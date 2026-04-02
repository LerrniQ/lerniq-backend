import { Router, Request, Response } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import ExcelJS from 'exceljs'
import pool from '../db'
import { requireAdmin } from '../middleware/requireAdmin'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(requireAdmin)

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const QUESTION_TYPES = [
  'short_text', 'long_text', 'multiple_choice', 'checkboxes',
  'yes_no', 'scale', 'email', 'phone', 'number',
] as const

const AUDIENCES = ['all', 'student', 'lecturer', 'course_rep'] as const

const surveySchema = z.object({
  title:               z.string().min(2),
  description:         z.string().optional().nullable(),
  slug:                z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  welcome_title:       z.string().optional().nullable(),
  welcome_description: z.string().optional().nullable(),
  welcome_button_text: z.string().optional().nullable(),
  audience:            z.enum(AUDIENCES).optional(),
})

const questionSchema = z.object({
  type:        z.enum(QUESTION_TYPES),
  title:       z.string().min(1, 'Question title is required'),
  description: z.string().optional().nullable(),
  required:    z.boolean().optional(),
  options:     z.any().optional().nullable(),
})

// ── List all surveys ───────────────────────────────────────────────────────────
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT s.*,
      (SELECT COUNT(*) FROM survey_questions q WHERE q.survey_id = s.id)::int  AS question_count,
      (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id)::int  AS response_count
    FROM surveys s
    ORDER BY s.created_at DESC
  `)
  return res.json(result.rows)
}))

// ── Create survey ──────────────────────────────────────────────────────────────
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const parsed = surveySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors })

  const { title, description, welcome_title, welcome_description, welcome_button_text, audience } = parsed.data
  const slug          = parsed.data.slug ?? slugify(title)
  const preview_token = crypto.randomBytes(32).toString('hex')

  const clash = await pool.query('SELECT id FROM surveys WHERE slug = $1', [slug])
  if (clash.rows.length > 0) return res.status(409).json({ error: 'A survey with this slug already exists.' })

  const result = await pool.query(
    `INSERT INTO surveys (title, description, slug, welcome_title, welcome_description, welcome_button_text, preview_token, audience)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [title, description ?? null, slug, welcome_title ?? null, welcome_description ?? null, welcome_button_text ?? 'Start', preview_token, audience ?? 'all']
  )
  return res.status(201).json(result.rows[0])
}))

// ── Get single survey with questions ──────────────────────────────────────────
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const survey = await pool.query('SELECT * FROM surveys WHERE id = $1', [req.params.id])
  if (survey.rows.length === 0) return res.status(404).json({ error: 'Survey not found.' })

  const questions = await pool.query(
    'SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY position ASC',
    [req.params.id]
  )
  return res.json({ ...survey.rows[0], questions: questions.rows })
}))

// ── Update survey metadata ─────────────────────────────────────────────────────
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const parsed = surveySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors })

  const { title, description, slug, welcome_title, welcome_description, welcome_button_text, audience } = parsed.data

  if (slug) {
    const clash = await pool.query('SELECT id FROM surveys WHERE slug = $1 AND id != $2', [slug, id])
    if (clash.rows.length > 0) return res.status(409).json({ error: 'Slug already in use.' })
  }

  const result = await pool.query(
    `UPDATE surveys SET
       title               = COALESCE($1, title),
       description         = $2,
       slug                = COALESCE($3, slug),
       welcome_title       = $4,
       welcome_description = $5,
       welcome_button_text = COALESCE($6, welcome_button_text),
       audience            = COALESCE($7, audience)
     WHERE id = $8 RETURNING *`,
    [title, description ?? null, slug ?? null, welcome_title ?? null, welcome_description ?? null, welcome_button_text ?? null, audience ?? null, id]
  )
  if (result.rows.length === 0) return res.status(404).json({ error: 'Survey not found.' })
  return res.json(result.rows[0])
}))

// ── Delete survey ──────────────────────────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await pool.query('DELETE FROM surveys WHERE id = $1', [req.params.id])
  return res.status(204).send()
}))

// ── Publish / Unpublish ────────────────────────────────────────────────────────
router.post('/:id/publish', asyncHandler(async (req: Request, res: Response) => {
  const result = await pool.query('UPDATE surveys SET published = true  WHERE id = $1 RETURNING *', [req.params.id])
  if (result.rows.length === 0) return res.status(404).json({ error: 'Survey not found.' })
  return res.json(result.rows[0])
}))

router.post('/:id/unpublish', asyncHandler(async (req: Request, res: Response) => {
  const result = await pool.query('UPDATE surveys SET published = false WHERE id = $1 RETURNING *', [req.params.id])
  if (result.rows.length === 0) return res.status(404).json({ error: 'Survey not found.' })
  return res.json(result.rows[0])
}))

// ── Add question ───────────────────────────────────────────────────────────────
router.post('/:id/questions', asyncHandler(async (req: Request, res: Response) => {
  const parsed = questionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors })

  const { type, title, description, required, options } = parsed.data

  const posResult = await pool.query(
    'SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM survey_questions WHERE survey_id = $1',
    [req.params.id]
  )
  const position = posResult.rows[0].next_pos

  const result = await pool.query(
    `INSERT INTO survey_questions (survey_id, position, type, title, description, required, options)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.params.id, position, type, title, description ?? null, required ?? true, options ? JSON.stringify(options) : null]
  )
  return res.status(201).json(result.rows[0])
}))

// ── Reorder questions (must be before /:qid) ──────────────────────────────────
router.put('/:id/questions/reorder', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { order } = req.body as { order: number[] }
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of question IDs' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < order.length; i++) {
      await client.query(
        'UPDATE survey_questions SET position = $1 WHERE id = $2 AND survey_id = $3',
        [i + 1, order[i], id]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  const questions = await pool.query(
    'SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY position ASC',
    [id]
  )
  return res.json(questions.rows)
}))

// ── Update question ────────────────────────────────────────────────────────────
router.put('/:id/questions/:qid', asyncHandler(async (req: Request, res: Response) => {
  const { id, qid } = req.params
  const parsed = questionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors })

  const { type, title, description, required, options } = parsed.data

  const result = await pool.query(
    `UPDATE survey_questions
     SET type = $1, title = $2, description = $3, required = $4, options = $5
     WHERE id = $6 AND survey_id = $7 RETURNING *`,
    [type, title, description ?? null, required ?? true, options ? JSON.stringify(options) : null, qid, id]
  )
  if (result.rows.length === 0) return res.status(404).json({ error: 'Question not found.' })
  return res.json(result.rows[0])
}))

// ── Delete question ────────────────────────────────────────────────────────────
router.delete('/:id/questions/:qid', asyncHandler(async (req: Request, res: Response) => {
  await pool.query('DELETE FROM survey_questions WHERE id = $1 AND survey_id = $2', [req.params.qid, req.params.id])
  return res.status(204).send()
}))

// ── List responses ─────────────────────────────────────────────────────────────
router.get('/:id/responses', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const [survey, questions, responses] = await Promise.all([
    pool.query('SELECT title, slug FROM surveys WHERE id = $1', [id]),
    pool.query('SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY position ASC', [id]),
    pool.query('SELECT * FROM survey_responses WHERE survey_id = $1 ORDER BY submitted_at DESC', [id]),
  ])
  if (survey.rows.length === 0) return res.status(404).json({ error: 'Survey not found.' })
  return res.json({ survey: survey.rows[0], questions: questions.rows, responses: responses.rows })
}))

// ── Export responses as Excel ──────────────────────────────────────────────────
router.get('/:id/responses/export', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const [survey, questions, responses] = await Promise.all([
    pool.query('SELECT title, slug FROM surveys WHERE id = $1', [id]),
    pool.query('SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY position ASC', [id]),
    pool.query('SELECT * FROM survey_responses WHERE survey_id = $1 ORDER BY submitted_at ASC', [id]),
  ])
  if (survey.rows.length === 0) return res.status(404).json({ error: 'Survey not found.' })

  const workbook = new ExcelJS.Workbook()
  const sheet    = workbook.addWorksheet('Responses')

  const headers  = ['Submitted At', 'Ref ID', ...questions.rows.map((q: Record<string, unknown>) => q.title as string)]
  const headerRow = sheet.addRow(headers)
  headerRow.font  = { bold: true }

  for (const r of responses.rows) {
    const answers = r.answers as Record<string, string | string[]>
    sheet.addRow([
      new Date(r.submitted_at).toLocaleString(),
      r.ref_id ?? '',
      ...questions.rows.map((q: Record<string, unknown>) => {
        const a = answers[String(q.id)]
        return Array.isArray(a) ? a.join(', ') : (a ?? '')
      }),
    ])
  }

  sheet.columns.forEach((col) => {
    col.width = Math.min(50, Math.max(15, String(col.header ?? '').length))
  })

  const buffer = await workbook.xlsx.writeBuffer()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="responses-${survey.rows[0].slug}.xlsx"`)
  res.send(buffer)
}))

export default router

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import pool from '../db'
import { requireAdmin } from '../middleware/requireAdmin'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(requireAdmin)

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateRef(): string {
  let id = 'AMB-'
  for (let i = 0; i < 5; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)]
  return id
}

async function uniqueRef(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const ref = generateRef()
    const clash = await pool.query('SELECT id FROM ambassadors WHERE ref_id = $1', [ref])
    if (clash.rows.length === 0) return ref
  }
  throw new Error('Could not generate unique ambassador ref')
}

const ambassadorSchema = z.object({
  name:   z.string().min(2),
  email:  z.string().email().optional().or(z.literal('')),
  phone:  z.string().min(7).optional().or(z.literal('')),
  school: z.string().optional().or(z.literal('')),
})

// ── List all ambassadors ───────────────────────────────────────────────────────
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT a.*,
      (SELECT COUNT(*) FROM survey_responses r WHERE r.ambassador_ref_id = a.ref_id)::int AS response_count
    FROM ambassadors a
    ORDER BY a.created_at DESC
  `)
  return res.json(result.rows)
}))

// ── Create ambassador ──────────────────────────────────────────────────────────
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const parsed = ambassadorSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors })

  const { name, email, phone, school } = parsed.data
  const ref_id = await uniqueRef()

  const result = await pool.query(
    `INSERT INTO ambassadors (name, email, phone, school, ref_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, email || null, phone || null, school || null, ref_id]
  )
  return res.status(201).json(result.rows[0])
}))

// ── Delete ambassador ──────────────────────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await pool.query('DELETE FROM ambassadors WHERE id = $1', [req.params.id])
  return res.status(204).send()
}))

// ── Responses for one ambassador across all surveys ────────────────────────────
router.get('/:id/responses', asyncHandler(async (req: Request, res: Response) => {
  const amb = await pool.query('SELECT * FROM ambassadors WHERE id = $1', [req.params.id])
  if (amb.rows.length === 0) return res.status(404).json({ error: 'Ambassador not found.' })

  const a = amb.rows[0] as Record<string, unknown>

  const responses = await pool.query(`
    SELECT r.*, s.title AS survey_title, s.slug AS survey_slug
    FROM   survey_responses r
    JOIN   surveys s ON s.id = r.survey_id
    WHERE  r.ambassador_ref_id = $1
    ORDER  BY r.submitted_at DESC
  `, [a.ref_id])

  const surveyIds = [...new Set(responses.rows.map(r => r.survey_id as number))]

  const questionsBySurvey: Record<number, Record<string, unknown>[]> = {}
  await Promise.all(
    surveyIds.map(async sid => {
      const q = await pool.query(
        'SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY position ASC',
        [sid]
      )
      questionsBySurvey[sid] = q.rows
    })
  )

  return res.json({ ambassador: a, responses: responses.rows, questions_by_survey: questionsBySurvey })
}))

// ── Export ambassador responses as Excel (one sheet per survey) ────────────────
router.get('/:id/responses/export', asyncHandler(async (req: Request, res: Response) => {
  const amb = await pool.query('SELECT * FROM ambassadors WHERE id = $1', [req.params.id])
  if (amb.rows.length === 0) return res.status(404).json({ error: 'Ambassador not found.' })

  const a = amb.rows[0] as Record<string, unknown>

  const responses = await pool.query(`
    SELECT r.*, s.title AS survey_title, s.id AS sid
    FROM   survey_responses r
    JOIN   surveys s ON s.id = r.survey_id
    WHERE  r.ambassador_ref_id = $1
    ORDER  BY s.title ASC, r.submitted_at ASC
  `, [a.ref_id])

  const surveyIds = [...new Set(responses.rows.map(r => r.survey_id as number))]

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'LerniQ'

  // One sheet per survey
  for (const sid of surveyIds) {
    const rows     = responses.rows.filter(r => r.survey_id === sid)
    const title    = (rows[0]?.survey_title as string) ?? `Survey ${sid}`
    const questions = await pool.query(
      'SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY position ASC', [sid]
    )
    const sheet = workbook.addWorksheet(title.slice(0, 31))
    const headerRow = sheet.addRow([
      'Submitted At', 'Survey', 'Ambassador', 'Ref ID',
      ...questions.rows.map(q => q.title as string),
    ])
    headerRow.font = { bold: true }

    for (const r of rows) {
      const answers = r.answers as Record<string, string | string[]>
      sheet.addRow([
        new Date(r.submitted_at as string).toLocaleString(),
        title,
        a.name as string,
        a.ref_id as string,
        ...questions.rows.map(q => {
          const ans = answers[String(q.id)]
          return Array.isArray(ans) ? ans.join(', ') : (ans ?? '')
        }),
      ])
    }
    sheet.columns.forEach(col => { col.width = Math.min(50, Math.max(15, String(col.header ?? '').length)) })
  }

  // Summary sheet
  const sum = workbook.addWorksheet('Summary')
  sum.addRow(['Ambassador', 'Ref ID', 'Email', 'Phone', 'School', 'Total Responses']).font = { bold: true }
  sum.addRow([a.name, a.ref_id, a.email ?? '', a.phone ?? '', a.school ?? '', responses.rows.length])
  sum.columns.forEach(col => { col.width = 22 })

  const buffer = await workbook.xlsx.writeBuffer()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="ambassador-${a.ref_id}.xlsx"`)
  res.send(buffer)
}))

// ── Global export: all ambassador responses across all ambassadors ──────────────
router.get('/export/all', asyncHandler(async (_req: Request, res: Response) => {
  const responses = await pool.query(`
    SELECT r.*, s.title AS survey_title, s.slug AS survey_slug,
           a.name AS amb_name, a.ref_id AS amb_ref, a.email AS amb_email,
           a.phone AS amb_phone, a.school AS amb_school
    FROM   survey_responses r
    JOIN   surveys s ON s.id = r.survey_id
    JOIN   ambassadors a ON a.ref_id = r.ambassador_ref_id
    ORDER  BY s.title ASC, a.name ASC, r.submitted_at ASC
  `)

  const surveyIds = [...new Set(responses.rows.map(r => r.survey_id as number))]

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'LerniQ'

  for (const sid of surveyIds) {
    const rows      = responses.rows.filter(r => r.survey_id === sid)
    const title     = (rows[0]?.survey_title as string) ?? `Survey ${sid}`
    const questions = await pool.query(
      'SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY position ASC', [sid]
    )
    const sheet = workbook.addWorksheet(title.slice(0, 31))
    const headerRow = sheet.addRow([
      'Submitted At', 'Survey', 'Ambassador', 'Ambassador Ref',
      'Email', 'Phone', 'School',
      ...questions.rows.map(q => q.title as string),
    ])
    headerRow.font = { bold: true }

    for (const r of rows) {
      const answers = r.answers as Record<string, string | string[]>
      sheet.addRow([
        new Date(r.submitted_at as string).toLocaleString(),
        title,
        r.amb_name as string,
        r.amb_ref as string,
        r.amb_email ?? '',
        r.amb_phone ?? '',
        r.amb_school ?? '',
        ...questions.rows.map(q => {
          const ans = answers[String(q.id)]
          return Array.isArray(ans) ? ans.join(', ') : (ans ?? '')
        }),
      ])
    }
    sheet.columns.forEach(col => { col.width = Math.min(50, Math.max(15, String(col.header ?? '').length)) })
  }

  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet('No Data').addRow(['No ambassador responses yet.'])
  }

  const buffer = await workbook.xlsx.writeBuffer()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="all-ambassador-responses.xlsx"')
  res.send(buffer)
}))

export default router

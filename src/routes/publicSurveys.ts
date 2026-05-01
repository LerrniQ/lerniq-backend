import { Router, Request, Response } from 'express'
import pool from '../db'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// ── List published surveys (optional ?audience= filter) ───────────────────────
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { audience } = req.query as { audience?: string }
  const validAudiences = ['all', 'student', 'lecturer', 'course_rep']

  let rows
  if (audience && validAudiences.includes(audience)) {
    const result = await pool.query(
      `SELECT id, title, slug, description, welcome_description, audience, created_at
       FROM surveys WHERE published = true AND (audience = $1 OR audience = 'all')
       ORDER BY created_at DESC`,
      [audience]
    )
    rows = result.rows
  } else {
    const result = await pool.query(
      `SELECT id, title, slug, description, welcome_description, audience, created_at
       FROM surveys WHERE published = true ORDER BY created_at DESC`
    )
    rows = result.rows
  }

  return res.json(rows)
}))

// ── Fetch survey by slug ───────────────────────────────────────────────────────
// Published surveys are open. Draft surveys require ?token=preview_token.
router.get('/:slug', asyncHandler(async (req: Request, res: Response) => {
  const { slug }  = req.params
  const { token } = req.query as { token?: string }

  const survey = await pool.query('SELECT * FROM surveys WHERE slug = $1', [slug])
  if (survey.rows.length === 0) return res.status(404).json({ error: 'Survey not found.' })

  const s = survey.rows[0]

  if (!s.published) {
    if (!token || token !== s.preview_token) {
      return res.status(404).json({ error: 'Survey not found.' })
    }
  }

  const questions = await pool.query(
    `SELECT id, position, type, title, description, required, options
     FROM survey_questions WHERE survey_id = $1 ORDER BY position ASC`,
    [s.id]
  )

  return res.json({
    id:                  s.id,
    title:               s.title,
    slug:                s.slug,
    welcome_title:       s.welcome_title,
    welcome_description: s.welcome_description,
    welcome_button_text: s.welcome_button_text,
    published:           s.published,
    preview:             !s.published,
    questions:           questions.rows,
  })
}))

// ── Submit response ────────────────────────────────────────────────────────────
router.post('/:slug/respond', asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params
  const { answers, ref } = req.body as {
    answers: Record<string, string | string[]>
    ref?: string
  }

  const survey = await pool.query(
    'SELECT id FROM surveys WHERE slug = $1 AND published = true',
    [slug]
  )
  if (survey.rows.length === 0) return res.status(404).json({ error: 'Survey not found.' })

  const surveyId = survey.rows[0].id as number

  // Check required questions
  const questions = await pool.query(
    'SELECT id, required FROM survey_questions WHERE survey_id = $1',
    [surveyId]
  )
  for (const q of questions.rows) {
    if (q.required) {
      const a = answers[String(q.id)]
      if (a === undefined || a === null || a === '' || (Array.isArray(a) && a.length === 0)) {
        return res.status(400).json({ error: `Question ${q.id} is required.` })
      }
    }
  }

  // Validate ref — check users first, then ambassadors
  let validUserRef:       string | null = null
  let validAmbassadorRef: string | null = null
  if (ref) {
    const [userRes, ambRes] = await Promise.all([
      pool.query('SELECT ref_id FROM users       WHERE ref_id = $1', [ref]),
      pool.query('SELECT ref_id FROM ambassadors WHERE ref_id = $1', [ref]),
    ])
    if (userRes.rows.length > 0)      validUserRef       = ref
    else if (ambRes.rows.length > 0)  validAmbassadorRef = ref
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'INSERT INTO survey_responses (survey_id, ref_id, ambassador_ref_id, answers) VALUES ($1,$2,$3,$4)',
      [surveyId, validUserRef, validAmbassadorRef, JSON.stringify(answers)]
    )
    if (validUserRef) {
      await client.query(
        'UPDATE users SET referral_count = referral_count + 1 WHERE ref_id = $1',
        [validUserRef]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return res.status(201).json({ ok: true })
}))

export default router

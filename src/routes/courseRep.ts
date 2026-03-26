import { Router, Request, Response } from 'express'
import { z } from 'zod'
import pool from '../db'
import { generateRefId } from '../utils/refId'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

const LECTURER_TYPEFORM_URL = 'https://form.typeform.com/to/pxQ8Pmkf'

const schema = z.object({
  name:   z.string().min(2, 'Name must be at least 2 characters'),
  email:  z.string().email('Invalid email address'),
  school: z.string().min(2, 'School name must be at least 2 characters'),
})

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors })
  }

  const { name, email, school } = parsed.data

  // If already registered as a course rep, return their existing link
  const existing = await pool.query(
    'SELECT ref_id FROM users WHERE email = $1 AND role = $2',
    [email, 'course_rep']
  )
  if (existing.rows.length > 0) {
    const refId = existing.rows[0].ref_id as string
    const typeformLink = `${LECTURER_TYPEFORM_URL}?ref=${refId}`
    return res.status(200).json({ refId, typeformLink, returning: true })
  }

  // Reject if email belongs to a different role
  const otherRole = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  )
  if (otherRole.rows.length > 0) {
    return res.status(409).json({ error: 'This email is already registered under a different role.' })
  }

  // Generate unique refId
  let refId: string = ''
  for (let i = 0; i < 10; i++) {
    const candidate = generateRefId()
    const clash = await pool.query(
      'SELECT id FROM users WHERE ref_id = $1',
      [candidate]
    )
    if (clash.rows.length === 0) {
      refId = candidate
      break
    }
  }
  if (!refId) {
    return res.status(500).json({ error: 'Could not generate a unique referral ID. Try again.' })
  }

  await pool.query(
    'INSERT INTO users (name, email, school, role, ref_id) VALUES ($1, $2, $3, $4, $5)',
    [name, email, school, 'course_rep', refId]
  )

  const typeformLink = `${LECTURER_TYPEFORM_URL}?ref=${refId}`
  return res.status(201).json({ refId, typeformLink })
}))

export default router

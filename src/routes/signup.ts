import { Router, Request, Response } from 'express'
import { z } from 'zod'
import pool from '../db'
import { generateRefId } from '../utils/refId'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

const schema = z.object({
  name:       z.string().min(2, 'Name must be at least 2 characters'),
  email:      z.string().email('Invalid email address'),
  school:     z.string().min(2, 'School name must be at least 2 characters'),
  role:       z.enum(['student', 'course_rep', 'lecturer']),
  referredBy: z.string().optional(),
})

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors })
  }

  const { name, email, school, role, referredBy } = parsed.data

  // Check for duplicate email
  const existing = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  )
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'This email is already registered.' })
  }

  // Validate referral code if provided
  if (referredBy) {
    const referrer = await pool.query(
      'SELECT id FROM users WHERE ref_id = $1',
      [referredBy]
    )
    if (referrer.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid referral code.' })
    }
  }

  // Generate a unique refId (collision extremely unlikely but guarded)
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

  // Insert user and credit referrer in a single transaction
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `INSERT INTO users (name, email, school, role, ref_id, referred_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, email, school, role, refId, referredBy ?? null]
    )

    if (referredBy) {
      await client.query(
        'UPDATE users SET referral_count = referral_count + 1 WHERE ref_id = $1',
        [referredBy]
      )
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  const baseUrl = process.env.FRONTEND_URL ?? 'https://lerniq.co'
  const referralLink = `${baseUrl}/join?ref=${refId}`

  return res.status(201).json({ refId, referralLink })
}))

export default router

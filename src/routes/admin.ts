import { Router, Request, Response } from 'express'
import pool from '../db'
import { requireAdmin } from '../middleware/requireAdmin'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(requireAdmin)

// All course reps who have generated a lecturer link, sorted by referral count
router.get('/course-reps', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT name, email, school, ref_id, referral_count, created_at
    FROM   users
    WHERE  role = 'course_rep'
    ORDER  BY referral_count DESC, created_at DESC
  `)
  return res.status(200).json(result.rows)
}))

// Everyone who signed up via /join (all roles)
router.get('/waitlist', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT name, email, school, role, ref_id, referred_by, referral_count, created_at
    FROM   users
    ORDER  BY created_at DESC
  `)
  return res.status(200).json(result.rows)
}))

export default router

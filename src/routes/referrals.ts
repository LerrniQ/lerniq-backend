import { Router, Request, Response } from 'express'
import pool from '../db'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.get('/:refId', asyncHandler(async (req: Request, res: Response) => {
  const { refId } = req.params

  const result = await pool.query(
    'SELECT name, ref_id, referral_count, created_at FROM users WHERE ref_id = $1',
    [refId]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Referral code not found.' })
  }

  return res.status(200).json(result.rows[0])
}))

export default router

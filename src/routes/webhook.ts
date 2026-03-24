import { Router, Request, Response } from 'express'
import pool from '../db'

const router = Router()

// Typeform sends POST with the full form_response payload.
// We read the hidden field `ref` and credit the referrer.
router.post('/typeform', async (req: Request, res: Response) => {
  const ref = req.body?.form_response?.hidden?.ref as string | undefined

  if (!ref) {
    // No ref attached — nothing to track, still return 200 so Typeform doesn't retry
    return res.status(200).json({ ok: true, skipped: true })
  }

  await pool.query(
    'UPDATE users SET referral_count = referral_count + 1 WHERE ref_id = $1',
    [ref]
  )

  return res.status(200).json({ ok: true })
})

export default router

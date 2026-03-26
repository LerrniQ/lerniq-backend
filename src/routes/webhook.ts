import { Router, Request, Response } from 'express'
import pool from '../db'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// Typeform sends POST with the full form_response payload.
// We read the hidden field `ref` and credit the referrer.
router.post('/typeform', asyncHandler(async (req: Request, res: Response) => {
  console.log('Typeform webhook hit')
  console.log('Body:', JSON.stringify(req.body, null, 2))

  const ref = req.body?.form_response?.hidden?.ref as string | undefined

  if (!ref) {
    console.log('No ref found in payload — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  console.log(`Crediting ref: ${ref}`)

  await pool.query(
    'UPDATE users SET referral_count = referral_count + 1 WHERE ref_id = $1',
    [ref]
  )

  console.log(`Referral count incremented for ${ref}`)
  return res.status(200).json({ ok: true })
}))

export default router

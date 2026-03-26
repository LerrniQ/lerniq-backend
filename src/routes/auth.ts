import { Router, Request, Response } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../db'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid credentials' })
  }

  const { email, password } = parsed.data

  const result = await pool.query(
    'SELECT * FROM admins WHERE email = $1',
    [email]
  )
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const admin = result.rows[0]
  const valid = await bcrypt.compare(password, admin.password_hash)
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email },
    process.env.JWT_SECRET ?? 'dev-secret',
    { expiresIn: '8h' }
  )

  return res.status(200).json({ token })
}))

export default router

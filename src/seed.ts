import bcrypt from 'bcryptjs'
import pool from './db'

export async function seedAdmin() {
  const email    = 'admin@lerniq.org'
  const password = process.env.ADMIN_PASSWORD ?? 'Admin@Lerniq2024!'

  const existing = await pool.query(
    'SELECT id FROM admins WHERE email = $1',
    [email]
  )
  if (existing.rows.length > 0) return // already seeded

  const hash = await bcrypt.hash(password, 12)
  await pool.query(
    'INSERT INTO admins (email, password_hash) VALUES ($1, $2)',
    [email, hash]
  )

  console.log('─────────────────────────────────────────')
  console.log('  Admin seeded')
  console.log(`  Email    : ${email}`)
  console.log(`  Password : ${password}`)
  console.log('  Change ADMIN_PASSWORD in your env to customise this.')
  console.log('─────────────────────────────────────────')
}

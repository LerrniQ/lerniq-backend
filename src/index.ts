import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import signupRouter    from './routes/signup'
import courseRepRouter from './routes/courseRep'
import webhookRouter   from './routes/webhook'
import referralsRouter from './routes/referrals'
import authRouter      from './routes/auth'
import adminRouter     from './routes/admin'
import { seedAdmin }   from './seed'

const app  = express()
const PORT = process.env.PORT ?? 3000
const isDev = process.env.NODE_ENV !== 'production'

// FRONTEND_URL can be a single origin or comma-separated list
// e.g. "https://lerniq.vercel.app,https://www.lerniq.co"
const allowedOrigins = (process.env.FRONTEND_URL ?? '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

app.use(cors({
  origin: isDev ? '*' : (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  methods: ['GET', 'POST'],
}))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/signup',     signupRouter)
app.use('/course-rep', courseRepRouter)
app.use('/webhook',    webhookRouter)
app.use('/referrals',  referralsRouter)
app.use('/auth',       authRouter)
app.use('/admin',      adminRouter)

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, async () => {
  console.log(`lerniq-api running on port ${PORT}`)
  await seedAdmin().catch(console.error)
})

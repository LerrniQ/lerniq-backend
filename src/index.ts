import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import signupRouter    from './routes/signup'
import webhookRouter   from './routes/webhook'
import referralsRouter from './routes/referrals'

const app  = express()
const PORT = process.env.PORT ?? 3000

app.use(cors({
  origin: process.env.FRONTEND_URL ?? '*',
  methods: ['GET', 'POST'],
}))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/signup',    signupRouter)
app.use('/webhook',   webhookRouter)
app.use('/referrals', referralsRouter)

// Global error handler — keeps Express from leaking stack traces in prod
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`lerniq-api running on port ${PORT}`)
})

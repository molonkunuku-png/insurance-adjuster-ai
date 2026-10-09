import { createApp } from './app.js'
import { initDb } from './db.js'
import { config, isProd } from './config.js'

async function main() {
  await initDb()
  const app = createApp()
  app.listen(config.port, () => {
    console.log(`[server] Themis API listening on :${config.port} (${config.nodeEnv})`)
    if (!config.openaiKey) console.warn('[server] OPENAI_API_KEY not set — AI endpoints will fail')
    if (!config.resendKey) console.warn('[server] RESEND_API_KEY not set — emails will be skipped')
    if (!isProd) console.warn('[server] development mode — CORS allows localhost')
  })
}

main().catch(err => {
  console.error('[server] fatal:', err)
  process.exit(1)
})

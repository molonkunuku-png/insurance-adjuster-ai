import { writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { betaConfirmationHtml, adminNotificationHtml } from '../src/email.js'

const outDir = join(tmpdir(), 'themis-email-preview')
mkdirSync(outDir, { recursive: true })

const sample = { name: 'Jane Adjuster', email: 'jane@claimsco.com', role: 'CAT adjuster', claimsPerMonth: '40', created: true }

const confirm = join(outDir, 'confirmation.html')
const admin = join(outDir, 'admin.html')
writeFileSync(confirm, betaConfirmationHtml(sample))
writeFileSync(admin, adminNotificationHtml(sample))

console.log('Wrote:')
console.log(' ', confirm)
console.log(' ', admin)

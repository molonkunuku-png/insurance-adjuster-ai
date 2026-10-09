import { writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { betaConfirmationHtml, adminNotificationHtml, betaAccessHtml } from '../src/email.js'

const outDir = join(tmpdir(), 'themis-email-preview')
mkdirSync(outDir, { recursive: true })

const sample = { name: 'Jane Adjuster', email: 'jane@claimsco.com', role: 'CAT adjuster', claimsPerMonth: '40', created: true }
const accessSample = { name: 'Jane Adjuster', accessUrl: 'https://insurance-adjuster-ai1.onrender.com/api/access/verify?token=TESTTOKEN' }

const confirm = join(outDir, 'confirmation.html')
const admin = join(outDir, 'admin.html')
const access = join(outDir, 'access.html')
writeFileSync(confirm, betaConfirmationHtml(sample))
writeFileSync(admin, adminNotificationHtml(sample))
writeFileSync(access, betaAccessHtml(accessSample))

console.log('Wrote:')
console.log(' ', confirm)
console.log(' ', admin)
console.log(' ', access)

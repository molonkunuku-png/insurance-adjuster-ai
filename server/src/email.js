import { Resend } from 'resend'
import { config } from './config.js'

let resend = null
function getResend() {
  if (!config.resendKey) throw new Error('RESEND_API_KEY is not set')
  if (!resend) resend = new Resend(config.resendKey)
  return resend
}

const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const ACCENT = '#12d9b0'
const BRAND = '#0b0d17'
const CARD = '#141828'
const LINE = '#232842'
const INK = '#ffffff'
const FAINT = '#6b7086'

/** Table-based, email-client-safe shell. Dark theme via bgcolor attributes. */
function shell(bodyHtml, preheader = '') {
  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>Themis</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${BRAND};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:${BRAND};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND}" style="background-color:${BRAND};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <tr>
            <td style="padding:0 0 22px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="36" height="36" align="center" valign="middle" bgcolor="${ACCENT}" style="width:36px;height:36px;background-color:${ACCENT};border-radius:10px;font-family:${FONT};font-size:19px;font-weight:700;color:${BRAND};line-height:36px;text-align:center;">T</td>
                  <td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                  <td valign="middle" style="font-family:${FONT};">
                    <div style="font-weight:700;font-size:15px;line-height:1.2;color:${INK};">Themis</div>
                    <div style="font-size:10px;line-height:1.4;letter-spacing:0.18em;text-transform:uppercase;color:#8b90a6;">Adjuster AI</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${LINE};border-radius:16px;padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0 4px;font-family:${FONT};font-size:11px;line-height:1.6;color:${FAINT};">
              Themis Adjuster AI &middot; Draft loss reports from photos and policy documents.<br>
              You received this email because you requested beta access.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function send(payload) {
  const r = getResend()
  const { data, error } = await r.emails.send(payload)
  if (error) throw new Error(error.message || 'Resend send failed')
  return data
}

export function adminNotificationHtml({ name, email, role, claimsPerMonth, created, delivery, company, volume, budget, pilot }) {
  const row = (label, value) => `
      <tr>
        <td style="padding:6px 12px 6px 0;font-family:${FONT};font-size:13px;color:${FAINT};white-space:nowrap;" valign="top">${label}</td>
        <td style="padding:6px 0;font-family:${FONT};font-size:14px;color:${INK};" valign="top">${value}</td>
      </tr>`
  const body = `
    <h1 style="margin:0 0 14px;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:700;color:${INK};">New beta request</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
      ${row('Name', escapeHtml(name))}
      ${row('Email', escapeHtml(email))}
      ${row('Role', escapeHtml(role || '—'))}
      ${row('Claims/month', escapeHtml(claimsPerMonth || '—'))}
      ${row('Company', escapeHtml(company || '—'))}
      ${row('Volume', escapeHtml(volume || '—'))}
      ${row('Budget', escapeHtml(budget || '—'))}
      ${row('Pilot interest', pilot === 'yes' ? 'YES' : '—')}
      ${row('Status', created ? 'new lead' : 'returning lead (updated)')}
      ${row('Magic link', escapeHtml(deliveryLine(delivery)))}
    </table>`
  return shell(body, `New Themis beta request from ${name}`)
}

export function adminNotificationText({ name, email, role, claimsPerMonth, created, delivery, company, volume, budget, pilot }) {
  return `New Themis beta request

Name: ${name}
Email: ${email}
Role: ${role || '—'}
Claims/month: ${claimsPerMonth || '—'}
Company: ${company || '—'}
Volume: ${volume || '—'}
Budget: ${budget || '—'}
Pilot interest: ${pilot === 'yes' ? 'YES' : '—'}
Status: ${created ? 'new lead' : 'returning lead (updated)'}
Magic link: ${deliveryLine(delivery)}`
}

// Delivery status for the owner: answers "is it handled" with metadata.
// The link itself is NEVER included (bearer credential, see Top200 ruling).
function deliveryLine(delivery) {
  const d = delivery || {}
  if (d.status === 'sent') return `sent via ${d.provider || 'mailer'}`
  if (d.status === 'queued') return 'queued for retry (mailer down, link will send)'
  if (d.status === 'waitlisted') return 'not minted — over beta cap (waitlisted)'
  if (d.status === 'failed') return `FAILED — ${d.error || 'unknown mailer error'} (fallback link shown to user)`
  return 'not attempted'
}

export async function sendAdminNotification(lead) {
  return send({
    from: config.resendFrom,
    to: config.contactEmail,
    replyTo: lead.email,
    subject: `New Themis beta request — ${lead.name}`,
    html: adminNotificationHtml(lead),
    text: adminNotificationText(lead),
  })
}

/** Generic templated send: subject/text/html supplied by templates.js. */
export async function sendTemplated({ to, subject, text, html }) {
  return send({
    from: config.resendFrom,
    to,
    subject,
    html,
    text,
  })
}

export function resendConfigured() {
  return Boolean(config.resendKey)
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

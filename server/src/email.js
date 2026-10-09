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
const MUTED = '#b9bed2'
const FAINT = '#6b7086'

/**
 * Bulletproof CTA button: table cell + solid bgcolor, with an Outlook (VML)
 * fallback so it renders as a real button everywhere.
 */
function button(url, label) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
    <tr>
      <td align="center" bgcolor="${ACCENT}" style="border-radius:10px;background-color:${ACCENT};">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="23%" stroke="f" fillcolor="${ACCENT}">
          <w:anchorlock/>
          <center style="color:${BRAND};font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${url}" target="_blank" style="display:inline-block;background-color:${ACCENT};color:${BRAND};font-family:${FONT};font-size:14px;font-weight:700;line-height:44px;text-decoration:none;padding:0 30px;border-radius:10px;">${label}</a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`
}

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

export function betaConfirmationHtml({ name }) {
  const first = escapeHtml((name || 'there').split(' ')[0])
  const body = `
    <h1 style="margin:0 0 10px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${INK};">You're on the beta list, ${first}.</h1>
    <p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.7;color:${MUTED};">
      Thanks for requesting access to Themis. We're onboarding a small first group of
      adjusters, and you're on the list. We'll email you your access link as soon as
      a spot opens.
    </p>
    <p style="margin:0 0 26px;font-family:${FONT};font-size:15px;line-height:1.7;color:${MUTED};">
      In return, we'll ask for honest feedback — what works, what's wrong, what's missing.
    </p>
    ${button(config.appUrl, 'Visit Themis')}
    <p style="margin:26px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};">
      Didn't request this? Just ignore this email.
    </p>`
  return shell(body, "You're on the Themis beta list — we'll send your access link soon.")
}

export function betaConfirmationText({ name }) {
  const first = (name || 'there').split(' ')[0]
  return `You're on the Themis beta list, ${first}.

Thanks for requesting access to Themis. We're onboarding a small first group of adjusters, and you're on the list. We'll email you your access link as soon as a spot opens.

In return, we'll ask for honest feedback — what works, what's wrong, what's missing.

Visit Themis: ${config.appUrl}

Didn't request this? Just ignore this email.
— Themis Adjuster AI`
}

export function adminNotificationHtml({ name, email, role, claimsPerMonth, created }) {
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
      ${row('Claims/mo', escapeHtml(claimsPerMonth || '—'))}
      ${row('Status', created ? 'new lead' : 'returning lead (updated)')}
    </table>`
  return shell(body, `New Themis beta request from ${name}`)
}

export function adminNotificationText({ name, email, role, claimsPerMonth, created }) {
  return `New Themis beta request

Name: ${name}
Email: ${email}
Role: ${role || '—'}
Claims/mo: ${claimsPerMonth || '—'}
Status: ${created ? 'new lead' : 'returning lead (updated)'}`
}

export async function sendBetaConfirmation({ name, email }) {
  return send({
    from: config.resendFrom,
    to: email,
    subject: "You're on the Themis beta list",
    html: betaConfirmationHtml({ name }),
    text: betaConfirmationText({ name }),
  })
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

export function smtpConfigured() {
  return Boolean(config.resendKey)
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

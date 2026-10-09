import { Resend } from 'resend'
import { config } from './config.js'

let resend = null
function getResend() {
  if (!config.resendKey) throw new Error('RESEND_API_KEY is not set')
  if (!resend) resend = new Resend(config.resendKey)
  return resend
}

function shell(bodyHtml) {
  return `<!doctype html>
<html><body style="margin:0;background:#0b0d17;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e7e9f3;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
      <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#12d9b0,#7c6cf6);"></div>
      <div>
        <div style="font-weight:700;font-size:15px;color:#fff;">Themis</div>
        <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#8b90a6;">Adjuster AI</div>
      </div>
    </div>
    <div style="background:#141828;border:1px solid #232842;border-radius:16px;padding:28px;">
      ${bodyHtml}
    </div>
    <p style="font-size:11px;color:#6b7086;margin-top:20px;line-height:1.6;">
      Themis Adjuster AI · Draft loss reports from photos and policy documents.<br/>
      You received this email because you requested beta access.
    </p>
  </div>
</body></html>`
}

async function send(payload) {
  const r = getResend()
  const { data, error } = await r.emails.send(payload)
  if (error) throw new Error(error.message || 'Resend send failed')
  return data
}

export async function sendBetaConfirmation({ name, email }) {
  const first = (name || 'there').split(' ')[0]
  const html = shell(`
    <h1 style="margin:0 0 8px;font-size:22px;color:#fff;">You're on the beta list, ${first}.</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#b9bed2;">
      Thanks for requesting access to Themis. We're onboarding a small first group of
      adjusters, and you're on the list. We'll email you your access link as soon as
      a spot opens.
    </p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#b9bed2;">
      In return, we'll ask for honest feedback — what works, what's wrong, what's missing.
    </p>
    <a href="${config.appUrl}" style="display:inline-block;background:linear-gradient(135deg,#12d9b0,#7c6cf6);color:#0b0d17;font-weight:700;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:12px;">
      Visit Themis
    </a>
    <p style="margin:20px 0 0;font-size:12px;color:#6b7086;">
      Didn't request this? Just ignore this email.
    </p>
  `)
  return send({ from: config.resendFrom, to: email, subject: "You're on the Themis beta list", html })
}

export async function sendAdminNotification({ name, email, role, claimsPerMonth, created }) {
  const html = shell(`
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">New beta request</h1>
    <table style="width:100%;font-size:14px;color:#b9bed2;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#6b7086;">Name</td><td style="padding:6px 0;color:#fff;">${escapeHtml(name)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7086;">Email</td><td style="padding:6px 0;color:#fff;">${escapeHtml(email)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7086;">Role</td><td style="padding:6px 0;color:#fff;">${escapeHtml(role || '—')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7086;">Claims/mo</td><td style="padding:6px 0;color:#fff;">${escapeHtml(claimsPerMonth || '—')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7086;">Status</td><td style="padding:6px 0;color:#fff;">${created ? 'new lead' : 'returning lead (updated)'}</td></tr>
    </table>
  `)
  return send({
    from: config.resendFrom,
    to: config.contactEmail,
    replyTo: email,
    subject: `New Themis beta request — ${name}`,
    html,
  })
}

export function smtpConfigured() {
  return Boolean(config.resendKey)
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

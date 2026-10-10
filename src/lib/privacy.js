/**
 * Client-side PII scrub (Tier 4 trust pack): emails, phone numbers, and
 * long digit runs are redacted BEFORE anything leaves the browser, so the
 * API (and its logs) never sees adjuster/insured contact details.
 * Coverage language is unaffected — redaction targets contact patterns only.
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// International-ish phones: optional +, digits, spaces/dashes/parens, 7+ digits total.
const PHONE_RE = /(\+?\d[\d\s().-]{5,}\d)/g
const LONG_DIGITS = /\b\d{9,}\b/g

export function scrubPII(text) {
  return String(text || '')
    .replace(EMAIL_RE, '[redacted-email]')
    // Phones must show dialing structure (+, spaces, dashes, parens);
    // bare digit runs fall through to the ID rule below.
    .replace(PHONE_RE, (m) => {
      const digits = m.replace(/\D/g, '')
      const structured = /^[+\s().-]/.test(m) || /[+\s().-]/.test(m);
      return (structured && digits.length >= 7 && digits.length <= 15) ? '[redacted-phone]' : m
    })
    .replace(LONG_DIGITS, '[redacted-id]')
}

export function containsPII(text) {
  const s = String(text || '')
  return EMAIL_RE.test(s) || LONG_DIGITS.test(s)
}

/**
 * Mail template registry — every template ships EN + BM, text + HTML.
 * Interpolation is named {{vars}} only (no eval); HTML output escapes every
 * variable; URLs must be https before interpolation.
 */

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const httpsUrl = (u) => {
  const s = String(u || '')
  if (!/^https:\/\/[^\s]+$/.test(s)) throw new Error('template: accessUrl must be https')
  return s
}

const TPL = {
  welcome: {
    en: {
      subject: 'Welcome to the Themis beta',
      text: ({ name }) => `Hi ${name},\n\nThanks for requesting access to Themis. This is a beta peer channel — magic links and updates arrive here while email is being fixed.\n\n— Themis Adjuster AI`,
      html: ({ name }) => `<p>Hi ${esc(name)},</p><p>Thanks for requesting access to Themis. This is a beta peer channel — magic links and updates arrive here while email is being fixed.</p><p>— Themis Adjuster AI</p>`,
    },
    ms: {
      subject: 'Selamat datang ke beta Themis',
      text: ({ name }) => `Hai ${name},\n\nTerima kasih kerana meminta akses ke Themis. Ini saluran beta — pautan magik dan kemas kini tiba di sini sementara e-mel diperbaiki.\n\n— Themis Adjuster AI`,
      html: ({ name }) => `<p>Hai ${esc(name)},</p><p>Terima kasih kerana meminta akses ke Themis. Ini saluran beta — pautan magik dan kemas kini tiba di sini sementara e-mel diperbaiki.</p><p>— Themis Adjuster AI</p>`,
    },
  },
  access: {
    en: {
      subject: 'Your Themis sign-in link (expires in 48 hours)',
      text: ({ name, accessUrl, ttl }) => `Hi ${name},\n\nYour sign-in link (single-use, expires in ${ttl}):\n${accessUrl}\n\nIf it stops working, request a fresh one from the sign-in page.\n\nThemis drafts documents for review — never a binding estimate without a human adjuster.`,
      html: ({ name, accessUrl, ttl }) => `<p>Hi ${esc(name)},</p><p>Your sign-in link (single-use, expires in ${esc(ttl)}):</p><p><a href="${esc(accessUrl)}">Open Themis</a></p><p>If it stops working, request a fresh one from the sign-in page.</p><p>Themis drafts documents for review — never a binding estimate without a human adjuster.</p>`,
    },
    ms: {
      subject: 'Pautan log masuk Themis anda (tamat dalam 48 jam)',
      text: ({ name, accessUrl, ttl }) => `Hai ${name},\n\nPautan log masuk anda (sekali guna, tamat dalam ${ttl}):\n${accessUrl}\n\nJika ia tidak berfungsi, minta yang baharu dari halaman log masuk.\n\nThemis merangka dokumen untuk semakan — bukan anggaran muktamad tanpa penyelaras manusia.`,
      html: ({ name, accessUrl, ttl }) => `<p>Hai ${esc(name)},</p><p>Pautan log masuk anda (sekali guna, tamat dalam ${esc(ttl)}):</p><p><a href="${esc(accessUrl)}">Buka Themis</a></p><p>Jika ia tidak berfungsi, minta yang baharu dari halaman log masuk.</p><p>Themis merangka dokumen untuk semakan — bukan anggaran muktamad tanpa penyelaras manusia.</p>`,
    },
  },
  waitlist: {
    en: {
      subject: "You're on the Themis beta list",
      text: ({ name }) => `Hi ${name},\n\nThanks — you're on the beta list. We'll send your access link as soon as a spot opens.\n\n— Themis Adjuster AI`,
      html: ({ name }) => `<p>Hi ${esc(name)},</p><p>Thanks — you're on the beta list. We'll send your access link as soon as a spot opens.</p><p>— Themis Adjuster AI</p>`,
    },
    ms: {
      subject: 'Anda dalam senarai beta Themis',
      text: ({ name }) => `Hai ${name},\n\nTerima kasih — anda dalam senarai beta. Kami akan menghantar pautan akses sebaik sahaja tempat dibuka.\n\n— Themis Adjuster AI`,
      html: ({ name }) => `<p>Hai ${esc(name)},</p><p>Terima kasih — anda dalam senarai beta. Kami akan menghantar pautan akses sebaik sahaja tempat dibuka.</p><p>— Themis Adjuster AI</p>`,
    },
  },
  revoke: {
    en: {
      subject: 'Your Themis beta access was removed',
      text: ({ name }) => `Hi ${name},\n\nYour Themis beta access has been removed. Existing sessions are signed out.\n\n— Themis Adjuster AI`,
      html: ({ name }) => `<p>Hi ${esc(name)},</p><p>Your Themis beta access has been removed. Existing sessions are signed out.</p><p>— Themis Adjuster AI</p>`,
    },
    ms: {
      subject: 'Akses beta Themis anda telah dibatalkan',
      text: ({ name }) => `Hai ${name},\n\nAkses beta Themis anda telah dibatalkan. Semua sesi sedia ada dilog keluar.\n\n— Themis Adjuster AI`,
      html: ({ name }) => `<p>Hai ${esc(name)},</p><p>Akses beta Themis anda telah dibatalkan. Semua sesi sedia ada dilog keluar.</p><p>— Themis Adjuster AI</p>`,
    },
  },
  confirm: {
    en: {
      subject: 'We got your Themis beta request',
      text: ({ name }) => `Hi ${name},\n\nWe received your beta request and will be in touch. No action needed.\n\n— Themis Adjuster AI`,
      html: ({ name }) => `<p>Hi ${esc(name)},</p><p>We received your beta request and will be in touch. No action needed.</p><p>— Themis Adjuster AI</p>`,
    },
    ms: {
      subject: 'Kami menerima permintaan beta Themis anda',
      text: ({ name }) => `Hai ${name},\n\nKami menerima permintaan beta anda dan akan menghubungi anda. Tiada tindakan diperlukan.\n\n— Themis Adjuster AI`,
      html: ({ name }) => `<p>Hai ${esc(name)},</p><p>Kami menerima permintaan beta anda dan akan menghubungi anda. Tiada tindakan diperlukan.</p><p>— Themis Adjuster AI</p>`,
    },
  },
  nudge: {
    en: {
      subject: 'Your Themis link expires soon — fresh one inside',
      text: ({ name, accessUrl }) => `Hi ${name},\n\nYour sign-in link expires within 24 hours. Here is a fresh single-use link:\n${accessUrl}\n\n— Themis Adjuster AI`,
      html: ({ name, accessUrl }) => `<p>Hi ${esc(name)},</p><p>Your sign-in link expires within 24 hours. Here is a fresh single-use link:</p><p><a href="${esc(accessUrl)}">Open Themis</a></p><p>— Themis Adjuster AI</p>`,
    },
    ms: {
      subject: 'Pautan Themis anda hampir tamat — yang baharu di dalam',
      text: ({ name, accessUrl }) => `Hai ${name},\n\nPautan log masuk anda tamat dalam 24 jam. Ini pautan baharu sekali guna:\n${accessUrl}\n\n— Themis Adjuster AI`,
      html: ({ name, accessUrl }) => `<p>Hai ${esc(name)},</p><p>Pautan log masuk anda tamat dalam 24 jam. Ini pautan baharu sekali guna:</p><p><a href="${esc(accessUrl)}">Buka Themis</a></p><p>— Themis Adjuster AI</p>`,
    },
  },
}

export const TEMPLATE_TYPES = Object.keys(TPL)

export function renderTemplate(type, lang = 'en', vars = {}) {
  const t = TPL[type]
  if (!t) throw new Error(`template: unknown type ${type}`)
  const L = t[lang === 'ms' ? 'ms' : 'en']
  const v = { ...vars }
  if (v.accessUrl !== undefined) v.accessUrl = httpsUrl(v.accessUrl)
  return {
    subject: L.subject,
    text: L.text(v),
    html: L.html(v),
  }
}

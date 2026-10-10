/**
 * Telegram channel: auth delivery with no verified domain (bot token only).
 * Pairing flow: beta lead gets a 15-minute code (from UI/admin), sends
 * `/start <code>` to the bot, chat_id binds to their lead email. Access
 * links then deliver to Telegram instead of (or alongside) email.
 *
 * Pairings persist to a tmpdir JSON file (best effort — Render disks are
 * ephemeral; re-pairing after a restart is a supported flow, not an error).
 */
import { readFile, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import crypto from 'crypto'

const storeFile = () => process.env.TG_STORE || join(tmpdir(), 'themis-telegram.json')

let pairs = new Map() // email -> { chatId, lang, pairedAt }
let codes = new Map() // code -> { email, exp }
let loaded = false

async function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = JSON.parse(await readFile(storeFile(), 'utf8'))
    pairs = new Map(Object.entries(raw.pairs || {}))
  } catch { /* first boot — empty store */ }
}

async function save() {
  try {
    await mkdir(tmpdir(), { recursive: true })
    await writeFile(storeFile(), JSON.stringify({ pairs: Object.fromEntries(pairs) }))
  } catch (e) {
    console.warn('[telegram] store save failed:', e.message)
  }
}

const botToken = () => process.env.TELEGRAM_BOT_TOKEN || ''
export const telegramEnabled = () => Boolean(botToken()) && process.env.TELEGRAM_ENABLED !== 'false'

async function api(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.ok) throw new Error(`telegram-${method}: ${data.description || res.status}`)
  return data.result
}

const STR = {
  paired: { en: 'Paired. Access links will arrive here.', ms: 'Berjaya dipadankan. Pautan akses akan tiba di sini.' },
  needCode: { en: 'Send /start <pairing-code> from your beta invite to link this chat.', ms: 'Hantar /start <kod-padanan> daripada jemputan beta untuk memautkan chat ini.' },
  badCode: { en: 'That code is invalid or expired. Request a fresh one.', ms: 'Kod itu tidak sah atau tamat. Minta yang baharu.' },
  statusOn: { en: 'Linked. You will receive access links here.', ms: 'Dipautkan. Anda akan menerima pautan akses di sini.' },
  statusOff: { en: 'Not linked. Pair with /start <code>.', ms: 'Belum dipautkan. Padankan dengan /start <kod>.' },
  unlinked: { en: 'Unlinked. Links will go by email again.', ms: 'Nyahlank. Pautan akan dihantar melalui e-mel semula.' },
  help: { en: 'Commands: /start <code> pair · /status · /revoke unlink · /bahasa · /english', ms: 'Arahan: /start <kod> padan · /status · /revoke nyahlank · /bahasa · /english' },
}

const langOf = (chatId) => {
  for (const [, p] of pairs) if (String(p.chatId) === String(chatId)) return p.lang || 'en'
  return 'en'
}

export async function issuePairingCode(email) {
  await load()
  const code = crypto.randomBytes(4).toString('hex').toUpperCase()
  codes.set(code, { email: String(email).toLowerCase(), exp: Date.now() + 15 * 60 * 1000 })
  return code
}

export function pairedChat(email) {
  const p = pairs.get(String(email).toLowerCase())
  return p ? { chatId: p.chatId, lang: p.lang || 'en' } : null
}

export async function sendTelegram(chatId, text) {
  if (!telegramEnabled()) throw new Error('telegram: disabled (no bot token)')
  const r = await api('sendMessage', {
    chat_id: chatId,
    text: String(text).slice(0, 4000),
    disable_web_page_preview: true,
  })
  return { ok: true, provider: 'telegram', messageId: r?.message_id || null }
}

async function reply(chatId, key) {
  const lang = langOf(chatId)
  await sendTelegram(chatId, STR[key][lang] || STR[key].en)
}

let offset = 0
async function poll() {
  if (!telegramEnabled()) return
  try {
    const data = await api('getUpdates', { offset, timeout: 20 })
    for (const u of data || []) {
      offset = Math.max(offset, (u.update_id || 0) + 1)
      const msg = u.message
      if (!msg?.text || !msg?.chat?.id) continue
      const chatId = msg.chat.id
      const [cmd, arg] = msg.text.trim().split(/\s+/)
      try {
        if (cmd === '/start' && arg) {
          const c = codes.get(String(arg).toUpperCase())
          if (!c || c.exp < Date.now()) {
            await reply(chatId, 'badCode')
          } else {
            codes.delete(String(arg).toUpperCase())
            pairs.set(c.email, { chatId, lang: langOf(chatId) === 'ms' ? 'ms' : 'en', pairedAt: new Date().toISOString() })
            await save()
            await reply(chatId, 'paired')
          }
        } else if (cmd === '/status') {
          let mine = false
          for (const [, p] of pairs) if (String(p.chatId) === String(chatId)) mine = true
          await reply(chatId, mine ? 'statusOn' : 'statusOff')
        } else if (cmd === '/revoke') {
          for (const [email, p] of pairs) {
            if (String(p.chatId) === String(chatId)) pairs.delete(email)
          }
          await save()
          await reply(chatId, 'unlinked')
        } else if (cmd === '/bahasa' || cmd === '/english') {
          const lang = cmd === '/bahasa' ? 'ms' : 'en'
          for (const [email, p] of pairs) {
            if (String(p.chatId) === String(chatId)) pairs.set(email, { ...p, lang })
          }
          await save()
          await reply(chatId, 'paired')
        } else if (cmd === '/help' || cmd === '/start') {
          await reply(chatId, String(arg || '') ? 'badCode' : 'needCode')
        }
      } catch (e) {
        console.warn('[telegram] command failed:', e.message)
      }
    }
  } catch (e) {
    console.warn('[telegram] poll failed:', e.message)
  }
}

export function startTelegramPoll({ everyMs = 25000 } = {}) {
  if (!telegramEnabled()) {
    console.warn('[telegram] disabled — set TELEGRAM_BOT_TOKEN to enable the channel')
    return
  }
  load().then(() => {
    const t = setInterval(poll, everyMs)
    t.unref?.()
  })
}

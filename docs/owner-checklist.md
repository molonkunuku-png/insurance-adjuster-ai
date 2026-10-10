# Themis Owner Checklist — mail, access & beta ops

One page. If it is not here, it is not your job.
Satu muka. Kalau tiada di sini, bukan tugas anda.

## 1. First boot (do once)

- [ ] Set `GMAIL_USER` + `GMAIL_APP_PASSWORD` in Render env (App Password needs 2SV on).
      Tetapkan `GMAIL_USER` + `GMAIL_APP_PASSWORD` dalam Render env.
- [ ] Set `MAIL_FROM` to the same Gmail address.
      Tetapkan `MAIL_FROM` ke alamat Gmail yang sama.
- [ ] Set `SESSION_SECRET` + `ADMIN_SECRET` (long random strings, never commit).
      Tetapkan `SESSION_SECRET` + `ADMIN_SECRET` (rawak, panjang, jangan commit).
- [ ] Deploy, then open `/api/health` — expect `"email":true`.
      Deploy, buka `/api/health` — pastikan `"email":true`.

## 2. Canary test (after every mail/env change)

- [ ] Incognito window → request access with an email you can check.
      Tetingkap inkognito → minta akses dengan e-mel yang boleh disemak.
- [ ] Link email arrives < 2 min. If not, check spam, then read the app's
      fallback panel (it shows the honest mail status, never a lie).
      Pautan tiba < 2 min. Jika tidak, semak spam, kemudian baca panel
      sandaran aplikasi (status jujur, bukan "check inbox" palsu).
- [ ] Click the link → app opens signed in. Done.
      Klik pautan → aplikasi terbuka. Selesai.

## 3. When a "New beta request" lands

- [ ] Read the **Magic link** row: `sent via X` = handled, nothing to do.
      Baca baris **Magic link**: `sent via X` = selesai, tiada tindakan.
- [ ] `queued` = mailer down, worker retrying. Check `/api/admin/mail`
      (header `x-admin-secret`) for depth; replay if needed.
      `queued` = penghantar gagal, worker mencuba semula. Semak
      `/api/admin/mail` untuk kedalaman baris; replay jika perlu.
- [ ] `FAILED` = user already got the fallback link in-app. Fix the mailer,
      then reissue via `/api/admin/invite`.
      `FAILED` = pengguna sudah dapat pautan sandaran dalam aplikasi.
      Baiki penghantar, kemudian hantar semula via `/api/admin/invite`.
- [ ] `not minted (waitlisted)` = over cap. Invite manually when ready.
      `not minted` = melebihi had. Jemput manual bila bersedia.
- [ ] NEVER paste a live magic link into any email — it signs in AS the lead.
      JANGAN tampal pautan magik hidup dalam apa-apa e-mel.

## 4. Emergency: someone locked out, no DNS can change

- [ ] Set `BREAK_GLASS=1` in Render env (restart), mint one link:
      Tetapkan `BREAK_GLASS=1`, jana satu pautan:
  `POST /api/admin/mint {"email":"..."}` with `x-admin-secret` header.
  Link lives 5 minutes, single-use, audited. Disable flag after.
  Pautan hidup 5 minit, sekali guna, diaudit. Matikan flag selepas itu.

## 5. Telegram channel (optional second lane)

- [ ] Message @BotFather → /newbot → copy token → `TELEGRAM_BOT_TOKEN` env.
      Mesej @BotFather → /newbot → salin token → env `TELEGRAM_BOT_TOKEN`.
- [ ] Signed-in lead: `GET /api/telegram/pair` → code → send `/start <code>`
      to the bot. Links then arrive in chat.
      Lead log masuk: `GET /api/telegram/pair` → kod → hantar
      `/start <kod>` kepada bot. Pautan tiba dalam chat.

## 6. Monthly (15 minutes)

- [ ] `GET /api/admin/mail` — failure rate, dead-letter, suppression list.
      Semak kadar gagal, dead-letter, senarai suppression.
- [ ] Rotate Gmail App Password every 90 days (canary after).
      Tukar App Password setiap 90 hari (canary selepas itu).
- [ ] Review `GET /api/admin/leads` — revoke stale test addresses.
      Semak senarai lead — revoke alamat ujian lama.

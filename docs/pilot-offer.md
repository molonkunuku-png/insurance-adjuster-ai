# Pilot offer — 20 files, 2 weeks, one benchmark (Tier 4)

For claims VPs at carriers and TPAs. No call required to start.

## Tawaran perintis — 20 fail, 2 minggu, satu penanda aras

Untuk VP tuntutan di syarikat insurans dan TPA. Mula tanpa panggilan.

## The offer / Tawaran

1. Carrier uploads **20 anonymized closed claim files** (photos + policy excerpts, PII scrubbed — see `src/lib/privacy.js` for the exact redaction rules).
   Syarikat memuat naik **20 fail tuntutan tertutup tanpa nama**.
2. Within **2 weeks** we return a benchmark: draft-minutes per file vs their current cycle, coverage-gap hits, citation rate.
   Dalam **2 minggu** kami memulangkan penanda aras: minit draf setiap fail berbanding kitaran semasa, jurang liputan, kadar petikan.
3. Fixed price, stated up front before file one. No hourly meter.
   Harga tetap, dinyatakan awal sebelum fail pertama.

## Intake checklist (owner)

- [ ] Leadrecord company + monthly volume (BetaForm `company`/`volume` fields → `beta_leads`).
      Rekod syarikat + volum bulanan lead.
- [ ] Confirm 20 files, anonymized (run them through the sample-claim flow first as a dry run).
      Sahkan 20 fail tanpa nama (uji dengan aliran tuntutan contoh dahulu).
- [ ] Agree the comparison baseline in writing (their current minutes-per-file).
      Persetujui garis asas perbandingan secara bertulis.
- [ ] Deliver benchmark + one-page prospectus; ask for the paid pilot, not feedback.
      Serahkan penanda aras + prospektus; minta perintis berbayar, bukan maklum balas.

## What we will NOT do

- No freeform consulting, no custom model training on carrier data.
  Tiada perundingan bebas, tiada latihan model atas data syarikat.
- No auto-decisions: every output stays a draft for human sign-off.
  Tiada keputusan automatik: semua output kekal draf untuk pengesahan manusia.

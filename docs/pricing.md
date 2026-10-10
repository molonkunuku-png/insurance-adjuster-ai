# Pricing (Tier 9-13) — intent stage, no checkout wired yet

Harga — peringkat niat; pembayaran dalam talian belum disambung.

## Free beta (live now / langsung)

- **3 report drafts / 30 days**, counted on-device. Over the cap the app
  teaches the upgrade moment instead of failing silently.
  **3 draf laporan / 30 hari.** Melebihi had, aplikasi memaparkan laluan naik taraf.

## Planned tiers (not yet purchasable / belum boleh dibeli)

| Tier | Price | What opens |
| --- | --- | --- |
| IA Starter | Free, 3 drafts/mo | Full flow, community support |
| Adjuster Pro | **per-claim** micropay | Batch upload, priority queue, DOCX letterhead |
| Agency bundle | **flat/mo** | Seats, shared templates, white-label header, SLA |
| Enterprise / white-label | **2–3× base, annual** | SSO, custom domain, DPA, pilot support |

Annual prepay: 2 months free + white-label included.
Bayaran tahunan: 2 bulan percuma + white-label termasuk.

## Willingness-to-pay signal (live)

Signup captures optional **tool budget range** + **paid-pilot interest** into
`beta_leads(budget, pilot)`, visible in `/api/admin/leads`. Pricing turns on
when 5+ leads land in $500+/mo with pilot=yes.
Isyarat kesanggupan bayar direkod semasa pendaftaran.

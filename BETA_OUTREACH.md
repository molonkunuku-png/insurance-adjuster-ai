# Themis — Beta Tester Outreach Kit

Goal: recruit **10 claims adjusters** to test the MVP and give feedback.
Offer: **free lifetime access** in exchange for honest feedback + a testimonial if they like it.

Rule #1: **Lead with value, not a pitch.** Adjusters are buried in claims and get spammed all day.
Rule #2: **Ask for feedback, not money.** No pricing conversation until they've used it once.
Rule #3: **One community at a time.** Post, wait for replies, actually talk to people. Mass-posting = ban.

---

## Target list (where adjusters actually hang out)

### Reddit (read the rules first — most have self-promo limits)
- `r/adjusters` — the main one (~30k). Post on weekends, answer 3–4 questions before you post.
- `r/InsuranceAdjuster`
- `r/claimsadjusters`
- `r/insurancepros` (careful: pro-leaning, hates spam)
- `r/insurance` — huge, general, but good for desk adjusters
- `r/WorkersComp` — niche, WC adjusters

### Facebook Groups (search these names — join, lurk 2 days, then post)
- "Claims Adjuster Network" — https://www.facebook.com/groups/386231336177135/
- "Independent Claims Adjusters"
- "Catastrophe Adjusters" / "CAT Adjusters"
- "Claims Adjusters Networking Group"
- "Women in Insurance & Claims"
- Note: many groups require an admin to approve posts. **Message the admin first.**

### Forums / communities
- Claims Roundup — https://claimsroundup.com/ (professional claims network)
- IKON (I Know Insurance) forum — https://iknowinsurance.proboards.com/
- CatAdjuster.org forums
- Adjuster Insights (Discord) — search "adjuster" servers

### Associations (email/reach out, they often have newsletters)
- NAPIA — National Association of Public Insurance Adjusters — napia.com
- NAIIA — National Association of Independent Insurance Adjusters — naiia.com
- BBIAN — Black & Brown Independent Adjusters Network — bbian.org

### LinkedIn
- Search groups: "Independent Adjusters", "Claims Adjusters", "Catastrophe Claims"
- DM adjusters with "Open to helping new tools" in profile, or who post about workflow pain.

---

## Template 1 — Reddit post (value-first)

> **Title:** Built a tool that drafts loss reports from damage photos — want 10 adjusters to test it (free)
>
> Hey all — I'm a developer who's been reading this sub for a while to understand how you actually work claims. The thing I kept seeing: you spend hours writing up reports after doing the field work.
>
> I built a small tool that takes your damage photos + the policy PDF and drafts a first-pass loss report (coverage, damage summary, estimated value, next steps) in about 30 seconds. It's rough — it's an MVP, not a finished product.
>
> I'm looking for **10 adjusters** to try it and tell me where it's wrong. Not selling anything — free access in exchange for honest feedback.
>
> If you're interested, drop a comment or DM me. Happy to answer anything about how it works.

## Template 2 — Reply to someone complaining about report writing

> This is exactly the pain I'm trying to solve. I built an MVP that drafts the report from photos + policy — it's not perfect yet but it cuts the first pass way down. Want to try it and tell me what's broken? Free, just want real feedback from someone doing this daily.

## Template 3 — Facebook group post

> Hi everyone — I'm a builder, not a vendor. I made a tool that turns damage photos + a policy PDF into a draft loss report, and I want to give it to a few adjusters free so I can learn what's actually useful.
>
> It does: reads the photos, pulls coverage/exclusions from the policy, estimates repairs, and drafts next steps. Takes ~30s. It's an MVP so expect rough edges.
>
> Looking for 10 people to test it. Comment "in" or DM me and I'll send the link. Thank you.

## Template 4 — LinkedIn DM

> Hi [Name] — I saw your post about [specific thing: CAT deployment / report backlog / desk reviews]. I'm building a tool for adjusters that drafts the loss report from damage photos + the policy. Looking for a handful of experienced adjusters to test it before launch — free access, no strings, just want honest feedback.
>
> Would you be open to trying it? Happy to send a 30-sec link.

## Template 5 — Cold email

> Subject: Can I give you free access to a loss-report tool?
>
> Hi [Name],
>
> I'm building Themis — a tool that drafts a first-pass loss report from your damage photos and the policy PDF in about 30 seconds. It's early (MVP), and I'm giving free access to 10 adjusters in exchange for honest feedback.
>
> No pitch, no cost. If it's useful, great. If it's wrong, I want to know exactly why.
>
> 20 seconds to request access: [YOUR_LIVE_URL]
>
> — [Your name]

## Template 6 — Follow-up (send 3–4 days later, once)

> Hey [Name] — just following up on the beta for the loss-report tool. Did you get a chance to look? Totally fine if not — I just want to make sure the link worked. Thanks!

---

## Posting discipline (do NOT skip)

1. **Read each community's rules.** r/adjusters and r/insurancepros restrict self-promo. Post value, or ask mods first.
2. **Space it out.** One subreddit per day, one Facebook group per day. Don't blast all at once — you'll get banned and flagged as spam.
3. **Engage first.** Answer 3–4 real questions in a community *before* posting your own.
4. **Track replies.** Log who responded and follow up personally. 10 real conversations > 1000 impressions.
5. **CAN-SPAM / GDPR:** cold email is legal in the US if you're truthful and include a way to opt out. In the EU/UK you need consent — stick to LinkedIn/Reddit DMs there, or just don't cold-email.
6. **Never** scrape emails and mass-blast. That gets your domain blacklisted before you launch.

---

## How to wire the signup form (zero backend)

The "Join beta" form on the site currently falls back to opening the visitor's email app
(controlled by `VITE_CONTACT_EMAIL`). For real submissions, set `VITE_BETA_FORM_ENDPOINT`
to a free form endpoint:

- **Formspree** (free 50/mo): create a form, copy the endpoint → set as `VITE_BETA_FORM_ENDPOINT`
- **Tally** / **Getform** also work.
- Then in Render → Environment → add both vars → redeploy.

Submissions land in your inbox and you follow up from your own account.

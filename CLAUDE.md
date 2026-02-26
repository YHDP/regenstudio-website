# Project: Regen Studio Website

## Tech Stack
- Language: HTML5, CSS3, Vanilla JavaScript (ES5+)
- Framework: None (static site)
- Package manager: None (zero dependencies)
- Backend: Supabase Edge Functions (Deno/TypeScript)
- Email: Lettermint via Supabase
- Hosting: GitHub Pages (www.regenstudio.world)
- Fonts: Self-hosted in `assets/fonts/` (Inter, Playfair Display)

## Directory Structure
- `/` — HTML pages (index, blog, about, faq, services, privacy)
- `/Blogs/` — JSON-based blog CMS (35+ posts, each in `slug/` with `meta.json` + `content.html`)
- `/Blogs/blogs.json` — Master index of all post slugs (newest first)
- `/Images/` — SVGs, logos, client logos, illustrations
- `/supabase/functions/` — 4 Edge Functions (contact-form, newsletter-send/subscribe, email-webhook)
- `/Newsletter/` — Email template + docs
- `script.js` — Main app logic (nav, animations, forms) — 1563 lines
- `blog.js` — Blog listing, filtering, rendering — 892 lines
- `trial2.js` — Hero canvas animation (triangle physics) — 634 lines
- `style.css` — Design system — 5059 lines
- `blog.css` — Blog styles + category colors — 1513 lines

## Commands
- Dev: `python3 -m http.server` or `npx http-server` (static files, no build step)
- Deploy: `git push origin main` (auto-deploys to GitHub Pages)
- Supabase functions: `supabase functions deploy <name> --no-verify-jwt`

## Conventions
- BEM CSS naming: `block__element--modifier`
- CSS variables in `:root` for colors, spacing, typography
- Blog posts: create `Blogs/<slug>/` with `meta.json` + `content.html`, prepend slug to `blogs.json`
- 18 blog categories with defined colors in `blog.js` (`CATEGORY_COLORS`)
- Forms POST to Supabase `/functions/v1/contact-form` with a `source` identifier
- Image paths are root-relative: `Blogs/slug/image.webp`, `Images/file.svg`
- Responsive design via media queries (mobile/tablet/desktop)

## Supabase
- Project: `uemspezaqxmkhenimwuf`
- Tables: `newsletter_subscribers`, `email_events`
- Edge Functions: contact-form, newsletter-send, newsletter-subscribe, email-webhook

### Required Environment Variables
| Variable | Used by | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | All 4 functions | Supabase project URL (auto-injected by Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | All 4 functions | Supabase service-role key (auto-injected by Supabase) |
| `LETTERMINT_API_TOKEN` | contact-form | Lettermint API token for sending transactional emails |
| `LETTERMINT_API_KEY` | newsletter-send | Lettermint API key (Bearer auth) for batch newsletter sends |
| `NEWSLETTER_SEND_SECRET` | newsletter-send | Shared secret for `x-newsletter-secret` header auth |
| `LETTERMINT_WEBHOOK_SECRET` | email-webhook | HMAC secret for verifying Lettermint webhook signatures |

## CPR Blog (`Blogs/cpr-digital-product-passport/content.html`)
- ~1920-line interactive article with 37 product family cards + popup modals
- All data is inline: each `<article class="cpr-card">` has data attributes:
  - `data-standards` — JSON blob with per-standard details (id, type, name, revision, dpp_est, etc.)
  - `data-info` — HTML string with paragraphs (About / Current harmonised standards / Standards in development / Standardisation request / DPP outlook)
  - `data-milestones`, `data-dpp-range`, `data-dpp-est`, `data-updated`, `data-letter`
- JS enriches standards at runtime: `computeHenStage()` adds `_stage`, enrichment block adds `current_cpr` and `sreq_cpr`
- `buildHenDppInfo(s, stageLabels)` and `buildEadDppInfo(s)` generate info popup HTML
- CSS + JS are inline `<style>` and `<script>` blocks within content.html (no external files)
- BEM classes: `cpr-card`, `cpr-modal__*`, `cpr-milestone__*`, `cpr-stage-dots__*`, `cpr-dpp-info-*`
- No build step or propagation script — all 37 cards are edited directly in the HTML
- When editing data-info: lines are very long single-line HTML strings; use `grep -o` to extract exact substrings before editing
- Fact-checking: always verify standard year designations (EN vs national adoption year), AVCP decision numbers, OJ-cited harmonised status vs newer non-harmonised revisions, and cross-check counts across data-dpp-range, data-standards summary, and data-info narrative

## Privacy Rules — MANDATORY

This site follows a **zero third-party connections** policy. Both regenstudio.world and demos.regenstudio.space promise visitors in their privacy policies that all assets are self-hosted and no cookies are set.

- **NEVER add Google Fonts, CDN-hosted scripts, or any external `<link>`/`<script>` tags**
  - If a new font or library is needed, download the files and self-host them
  - No `fonts.googleapis.com`, `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `unpkg.com`, etc.
- **NEVER add cookies, tracking pixels, fingerprinting, or advertising scripts**
- **NEVER store raw IP addresses** — always hash with a rotating salt
- **NEVER send personal data to third parties** beyond listed sub-processors (Supabase, Mollie, Lettermint, Exact Online, Proton Mail, GitHub Pages)
- If adding a new external service, update `privacy.html` sub-processors section first

## Multilingual (EN / NL / PT)

The site supports three languages: English (default), Dutch, and Portuguese (Brazilian).

### URL structure
- `/` — English (default)
- `/nl/` — Dutch (e.g., `/nl/about.html`, `/nl/blog/slug/`, `/nl/what-is-a-digital-product-passport/`)
- `/pt/` — Portuguese (same pattern)

### Architecture (Hybrid)
- **Static pages** per language for all content (blog posts, Q&A pages, core pages) — crawlable by search engines and AI
- **Runtime i18n.js** swaps shared UI strings (nav, footer, form labels, buttons) from `/locales/*.json`
- **JS i18n integration**: `blog.js` and `script.js` use `t(key, fallback)` helper for dynamic strings
- Language detection is by URL prefix, not cookies or localStorage

### File structure
```
/locales/en.json          — English UI strings (source of truth)
/locales/nl.json          — Dutch UI strings
/locales/pt.json          — Portuguese UI strings
/assets/js/i18n.js        — Runtime string swapper (~2KB)
/nl/index.html            — Dutch homepage
/nl/about.html            — Dutch about page
/nl/blog/slug/index.html  — Dutch blog posts (generated by build.ts)
/pt/...                   — Same structure for Portuguese
/Blogs/slug/meta.nl.json  — Dutch blog metadata
/Blogs/slug/meta.pt.json  — Portuguese blog metadata
/Blogs/slug/content.nl.html — Dutch blog content
/Blogs/slug/content.pt.html — Portuguese blog content
```

### What propagates AUTOMATICALLY (via i18n.js)
These changes only need updating in `/locales/*.json` — they apply to ALL pages at runtime:
- Nav link labels (Vision, Services, Blog, etc.)
- Footer headings and link labels
- Contact popover text
- Form placeholders and labels
- Button text (Send Message, Copy, etc.)
- Success and error messages
- Blog category names (in listings)
- "Read more", "Share", "Back to Blog" etc.
- Blog post dynamic UI: share buttons, CTA banners, related articles, floating CTA
- Form messages: sending state, success/error, email copy toast
- Hero freeze/unfreeze button text

### Adding a new translatable JS string
1. Add the key + English value to `/locales/en.json`
2. Add the NL translation to `/locales/nl.json`
3. Add the PT translation to `/locales/pt.json`
4. In blog.js or script.js, use `t("key", "English fallback")` instead of hardcoding
5. The `t()` helper is defined at the top of both files; it calls `window.__i18n.t()`

### What needs MANUAL parallel updates
When you change content on an English page, you must also update the NL and PT versions:
- **Page content** (headings, paragraphs, lists) — update `/nl/page.html` and `/pt/page.html`
- **Meta tags** (`<title>`, `<meta description>`, OG tags) — in each language file's `<head>`
- **JSON-LD schema** (FAQ answers, service descriptions) — in each language file
- **Blog posts** — update `meta.nl.json`, `meta.pt.json`, `content.nl.html`, `content.pt.html`
- **Sitemap entries** — regenerated by build.ts (no manual work if build.ts is updated)

### Adding a new blog post (all languages)
1. Create `Blogs/slug/meta.json` + `content.html` (English)
2. Create `Blogs/slug/meta.nl.json` + `content.nl.html` (Dutch)
3. Create `Blogs/slug/meta.pt.json` + `content.pt.html` (Portuguese)
4. Prepend slug to `Blogs/blogs.json`
5. Run `~/.deno/bin/deno run --allow-read --allow-write build.ts`
6. This generates `/blog/slug/`, `/nl/blog/slug/`, and `/pt/blog/slug/`

### EU regulation terminology
Use official EU translations, with English acronym in parentheses on first mention:
- EN: Digital Product Passport (DPP)
- NL: Digitaal Productpaspoort (DPP)
- PT: Passaporte Digital do Produto (DPP)
See `/Users/yvhun/Claude/Werkmappie/PLAN TO LAUNCH WEBSITE/translation-review.md` for the full terminology table.

## Conversion Tracking (Ad Pixels)

The `/thank-you.html` page (and `/nl/thank-you.html`, `/pt/thank-you.html`) includes a placeholder comment for conversion tracking pixels. When ad campaigns begin:

1. Open `thank-you.html` (and NL/PT versions)
2. Find the comment: `<!-- conversion tracking pixel placeholder -->`
3. Add the pixel script directly below it, for example:
   - **LinkedIn Insight Tag:** `<script>...</script>` from LinkedIn Campaign Manager
   - **Google Ads:** `<script>gtag('event', 'conversion', {...})</script>`
   - **Meta Pixel:** `<script>fbq('track', 'Lead')</script>`
4. Update `privacy.html` sub-processors section to disclose the new tracker
5. Test the form → thank-you redirect flow to confirm the pixel fires

## Current Status
- Live site with 35+ blog posts, newsletter system, contact forms
- Hero triangle canvas animation active
- 6 standalone Q&A pages for AI citation optimization
- Full trilingual support (EN/NL/PT) — i18n.js + locales + 16 translated core pages + 60 translated blog posts
- Thank-you page with social follow card and conversion pixel placeholder
- Form submissions redirect to /thank-you.html on success

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
- `/supabase/functions/` — symlink → Proton Drive (7 Edge Functions, not in git)
- `/supabase/migrations/` — gitignored, source of truth on Proton Drive
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

## Repo Hygiene (public GitHub Pages repo)

This repo is PUBLIC. Before committing, verify no file falls into these categories:
- **Secrets/credentials**: env vars, API keys, password hashes, auth tokens
- **Infrastructure code**: Supabase migrations, cron SQL, Edge Function source (→ Proton Drive)
- **Source drafts**: RTF, DOCX, XLSX, PPTX files (→ Proton Drive)
- **Unlinked large files**: PDFs/images not referenced from any HTML page
- **Internal docs**: process guides, templates, READMEs for internal workflows

When creating new files, ask: "Does a visitor's browser need this?" If no → gitignore + Proton Drive.
Edge functions are symlinked from Proton Drive: `supabase/functions/ → CLAUDE CODE SYNC FOLDER/supabase-functions/`

## Privacy Architecture

Zero third-party connections policy. All assets self-hosted, no cookies.
Privacy principles enforced by `soul.md`; project-specific details below:

- Fonts self-hosted in `assets/fonts/` (Inter, Playfair Display). New fonts/libs: download and self-host.
- IPs hashed with daily-rotating salt, never stored raw
- Sub-processors: Supabase (EU), Mollie (NL), Lettermint (email), GitHub Pages, Exact Online (NL), Proton Mail (CH)
- Privacy policy: `privacy.html` — must be updated in the same commit as any data-handling change
- Media embeds (Vimeo, SoundCloud): informed consent overlay, never auto-load iframes

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
See Proton Drive `CLAUDE CODE SYNC FOLDER/3-marketing/translation-review.md` for the full terminology table.

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

## Operational Docs (Proton Drive — private, synced across devices)

All at `~/Library/CloudStorage/ProtonDrive-yvhu@proton.me-folder/CLAUDE CODE SYNC FOLDER/`:

| File | Purpose | When to check |
|------|---------|---------------|
| `backlog.md` | Persistent task backlog | Before starting work (pick up items); after finishing work (add deferred items) |
| `Website sessions Episodic memory/session-handoff.md` | Session context for continuity | Start of session (read); end of session (update) |

In-repo docs at `docs/collaboration/`:

| File | Purpose | When to check |
|------|---------|---------------|
| `known-bugs.md` | Bug tracker | Start of session; when discovering or fixing bugs |
| `recurring-patterns.md` | Lessons learned | Before translation, SEO, or multi-file work |

**Backlog discipline**: When a task is deferred during a session (design decision needed, out of scope, blocked), add it to `backlog.md` before the session ends. When completing a backlog item, mark it done with the date.

## OG Images & Social Media Generators

Generators live on Proton Drive (not in git): `CLAUDE CODE SYNC FOLDER/3-marketing/generators/`

### OG Image Generator (`_og-generator.html`)
- Generates page-specific OG images (1200x630) from the base `Images/og-image.png`
- **When adding a new page**: add an entry to the PAGES array, copy the generator to the website root, run `python3 -m http.server`, generate the image, copy to `Images/`, update `og:image` + `twitter:image` meta tags on EN/NL/PT pages, then remove the generator from the repo
- Each page gets: chameleon logo + page title (KoHo Bold) + "REGEN STUDIO" brand mark (KoHo Bold/ExtraLight) + landscape
- 22 OG images currently in `Images/og-*.png` (homepage EN/NL/PT + 19 page-specific)

### Banner Generator (`_banner-generator.html`)
- Generates social media banner/header images for LinkedIn, Mastodon, Bluesky
- **When adding a new social platform**: add a config entry with correct dimensions, copy generator to website root, run local server, generate and download
- Requires `_landscape.png` and `_landscape-br.png` (also in generators folder)

### Usage workflow
1. Copy generator + assets to website root: `cp CLAUDE_CODE_SYNC_FOLDER/3-marketing/generators/* .`
2. Start local server: `python3 -m http.server 8000`
3. Open `http://localhost:8000/_og-generator.html` (or `_banner-generator.html`)
4. Preview images, show to user for approval
5. Download, copy to `Images/`, update meta tags
6. Remove generator files from repo: `rm _og-generator.html _banner-generator.html _landscape*.png`

## Current Status
- Live site with 35+ blog posts, newsletter system, contact forms
- Hero triangle canvas animation active
- 6 standalone Q&A pages for AI citation optimization
- Full trilingual support (EN/NL/PT) — i18n.js + locales + 16 translated core pages + 60 translated blog posts
- Thank-you page with social follow card and conversion pixel placeholder
- Form submissions redirect to /thank-you.html on success
- Page-specific OG images for all pages (22 images)

# Project: Regen Studio Website

## Tech Stack
- Language: HTML5, CSS3, Vanilla JavaScript (ES5+)
- Framework: None (static site)
- Package manager: None (zero dependencies)
- Backend: Supabase Edge Functions (Deno/TypeScript)
- Email: Lettermint via Supabase
- Hosting: GitHub Pages (www.regenstudio.space)
- Fonts: Google Fonts (Inter, Playfair Display)

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
- Fact-checking: always verify standard year designations (EN vs national adoption year), AVCP decision numbers, and OJ-cited harmonised status vs newer non-harmonised revisions

## Current Status
- Live site with 35+ blog posts, newsletter system, contact forms
- Hero triangle canvas animation active
- `trial.js` / `trial.html` / `trial2.html` are experimental pages

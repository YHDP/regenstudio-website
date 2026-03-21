# Regen Studio Website

Marketing website and blog for [Regen Studio](https://www.regenstudio.world) — a regenerative innovation consultancy based in the Netherlands.

## Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (no framework, no build step)
- **Backend:** Supabase Edge Functions (Deno/TypeScript)
- **Email:** Lettermint
- **Hosting:** GitHub Pages

## Structure

```
/                     HTML pages (index, blog, about, services, privacy, etc.)
/Blogs/               JSON-based blog CMS (slug/ folders with meta.json + content.html)
/Images/              SVGs, logos, illustrations
/Newsletter/          Email template and documentation
/supabase/functions/  Edge Functions (contact form, newsletter)
```

## Local Development

```bash
python3 -m http.server
# or
npx http-server
```

No install step, no build step. Open `http://localhost:8000` in your browser.

## Deployment

Push to `main` — GitHub Pages auto-deploys.

## License

- **Code:** [PolyForm Noncommercial 1.0.0](LICENSE) — use, study, modify, and share for any noncommercial purpose.
- **Blog content:** [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — share and adapt with attribution, noncommercial, share-alike.
- **Code snippets in blog posts:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain, no restrictions.
- **Brand assets** (name, logo, visual identity): All rights reserved.

Copyright 2024-2026 Regen Studio B.V.

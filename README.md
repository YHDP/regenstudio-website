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

Licensed under the [EUPL v1.2](LICENSE).

Copyright 2024-2026 Regen Studio B.V.

# Regen Studio Newsletter System

## Architecture

The newsletter system runs on Supabase Edge Functions + Lettermint (email delivery).

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `newsletter-send` | Supabase Edge Function | Sends newsletter to all active subscribers |
| `newsletter-subscribe` | Supabase Edge Function | Handles subscribe (POST) and unsubscribe (GET) |
| `contact-form` | Supabase Edge Function | Existing form handler; also inserts into subscribers when `newsletter_opt_in` is true |
| `email-webhook` | Supabase Edge Function | Receives Lettermint delivery webhooks (dormant until Lettermint plan supports inbound routes) |
| `newsletter_subscribers` | Supabase table | Stores subscriber emails, names, sources, status, unsubscribe tokens |
| `email_events` | Supabase table | Stores webhook delivery events (bounces, complaints, etc.) |

### Supabase Project

- **Project ID**: `uemspezaqxmkhenimwuf`
- **Dashboard**: https://supabase.com/dashboard/project/uemspezaqxmkhenimwuf
- **Edge Functions URL base**: `https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/`

### Edge Function source code

Source code is in two locations (kept in sync):
- `/Users/yvhun/regenstudio-website/supabase/functions/` (reference copy)
- `/Users/yvhun/regenstudio-demos/supabase/functions/` (deployment copy, linked to Supabase project)

Deploy from `regenstudio-demos`:
```bash
cd /Users/yvhun/regenstudio-demos
supabase functions deploy newsletter-send --no-verify-jwt
supabase functions deploy newsletter-subscribe --no-verify-jwt
supabase functions deploy contact-form --no-verify-jwt
supabase functions deploy email-webhook --no-verify-jwt
```

---

## How to Send a Newsletter

### Step 1: Write the content

Edit a copy of `template.json` in this folder. The payload format:

```json
{
  "subject": "Regen Studio - February 2026 Update",
  "intro": "A short intro paragraph that appears at the top of the email.",
  "sections": [
    {
      "heading": "Section Title",
      "body": "Section content. Can include <a href='https://...'>HTML links</a> and <strong>bold text</strong>."
    }
  ]
}
```

- `subject` (required): Email subject line
- `intro` (optional): Introductory paragraph before sections
- `sections` (required, at least 1): Array of heading + body pairs
- Section `body` supports inline HTML: `<a>`, `<strong>`, `<em>`, `<br>`

### Step 2: Send via curl

```bash
curl -X POST \
  https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/newsletter-send \
  -H "Content-Type: application/json" \
  -H "x-newsletter-secret: 89da632bd6e297f2daa6985358a6f4fc7974c78645aa5fb84aaf9d413adfe501" \
  -d @Newsletter/my-newsletter.json
```

Or with inline JSON:

```bash
curl -X POST \
  https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/newsletter-send \
  -H "Content-Type: application/json" \
  -H "x-newsletter-secret: 89da632bd6e297f2daa6985358a6f4fc7974c78645aa5fb84aaf9d413adfe501" \
  -d '{
    "subject": "Test Newsletter",
    "intro": "This is a test.",
    "sections": [{"heading": "Hello", "body": "Testing the newsletter system."}]
  }'
```

### Step 3: Check the response

- **Success**: `{ "ok": true, "sent": 12, "lettermint": { ... } }`
- **No subscribers**: `{ "error": "No active subscribers", "sent": 0 }`
- **Auth error**: `{ "error": "Unauthorized" }` (check the secret header)

---

## Subscriber Sources

Subscribers are added from multiple forms across the website. The `source` field tracks where they signed up:

| Source | Form location |
|--------|--------------|
| `website_contact` | Main site contact form (index.html) |
| `blog_contact` | Blog page contact form |
| `blog_post_contact` | Individual blog post contact form |
| `dpp_gate` | DPP page email gate |
| `dpp_contact` | DPP page contact form |
| `about_page` | About page contact form |
| `faq_page` | FAQ page contact form |
| `innovation_services` | Innovation Services page contact form |
| `demo_contact` | Demos landing page contact form |
| `demo_access_request` | Demo gate access request forms |

All forms have a "newsletter opt-in" checkbox (checked by default). When checked, the `contact-form` edge function inserts the email into `newsletter_subscribers`.

---

## Managing Subscribers

### View subscribers

Go to Supabase Dashboard > Table Editor > `newsletter_subscribers`.

Or via SQL:
```sql
SELECT email, name, source, status, subscribed_at
FROM newsletter_subscribers
WHERE status = 'active'
ORDER BY subscribed_at DESC;
```

### Manually add a subscriber

```sql
INSERT INTO newsletter_subscribers (email, name, source, status)
VALUES ('person@example.com', 'Name', 'manual', 'active')
ON CONFLICT (email)
DO UPDATE SET status = 'active', subscribed_at = now(), unsubscribed_at = null;
```

### Manually unsubscribe someone

```sql
UPDATE newsletter_subscribers
SET status = 'unsubscribed', unsubscribed_at = now()
WHERE email = 'person@example.com';
```

---

## Unsubscribe Flow

Every newsletter email includes an unsubscribe link in the footer. When clicked:
1. Hits `newsletter-subscribe?action=unsubscribe&token={uuid}`
2. Sets subscriber status to `unsubscribed` and records timestamp
3. Shows a confirmation HTML page

The `List-Unsubscribe` and `List-Unsubscribe-Post` headers are also included for email clients that support one-click unsubscribe.

---

## Email Template

The newsletter uses an HTML email template with:
- Top color bar (green > teal > orange gradient)
- "REGEN STUDIO" header
- Content sections (intro + heading/body pairs)
- Footer with unsubscribe link, privacy policy link, and website link
- Company info: "Regen Studio B.V. - Berg en Dal, The Netherlands"

The template is defined in `newsletter-send/index.ts` in the `emailLayout()` and `renderSections()` functions.

---

## Webhook System (Dormant)

The `email-webhook` edge function is deployed but currently dormant because Lettermint inbound routes require a paid plan.

When activated:
1. Register webhook URL in Lettermint dashboard: `https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/email-webhook`
2. Set the webhook secret: `supabase secrets set LETTERMINT_WEBHOOK_SECRET=whsec_xxx`
3. The function will log events to `email_events` table and auto-unsubscribe on hard bounces/spam complaints

---

## Secrets

Stored as Supabase secrets (set via `supabase secrets set KEY=VALUE` from `regenstudio-demos`):

| Secret | Purpose |
|--------|---------|
| `NEWSLETTER_SEND_SECRET` | Auth header for newsletter-send function |
| `LETTERMINT_API_KEY` | Lettermint API key for sending emails |
| `LETTERMINT_WEBHOOK_SECRET` | Webhook signature verification (not yet set) |

---

## Asking Claude to Help

When asking Claude Code to help with newsletters:
1. Point to this README and `template.json` for context
2. For sending: provide the content and Claude can format the JSON payload and run the curl command
3. For subscriber management: Claude can query/update via Supabase Dashboard or SQL
4. For template changes: the HTML template lives in `newsletter-send/index.ts` — after changes, redeploy from `regenstudio-demos`

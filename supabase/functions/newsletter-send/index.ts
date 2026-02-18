import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://www.regenstudio.world",
  "https://regenstudio.world",
];

const SUPABASE_FUNCTIONS_URL = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".supabase.co/functions/v1") || "";

function corsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-newsletter-secret",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

// --- Email HTML template (matches Regen Studio brand) ---
function emailLayout(content: string, unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Regen Studio Newsletter</title>
</head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:Inter,system-ui,-apple-system,sans-serif;color:#1a2b40;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;">
<tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

<!-- Header bar -->
<tr><td style="height:4px;background:linear-gradient(90deg,#00914B 0%,#009BBB 50%,#E8580C 100%);font-size:0;">&nbsp;</td></tr>

<!-- Logo -->
<tr><td style="padding:32px 40px 24px;text-align:center;">
  <span style="font-size:18px;font-weight:700;letter-spacing:2px;color:#1a2b40;">REGEN STUDIO</span>
</td></tr>

<!-- Content -->
<tr><td style="padding:0 40px 32px;">
  ${content}
</td></tr>

<!-- Footer -->
<tr><td style="padding:24px 40px;background:#f8f9fa;border-top:1px solid #e5e7eb;">
  <p style="margin:0 0 8px;font-size:12px;color:#6b7280;text-align:center;">
    Regen Studio B.V. &middot; Berg en Dal, The Netherlands
  </p>
  <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
    <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
    &nbsp;&middot;&nbsp;
    <a href="https://www.regenstudio.world/privacy.html" style="color:#6b7280;text-decoration:underline;">Privacy Policy</a>
    &nbsp;&middot;&nbsp;
    <a href="https://www.regenstudio.world" style="color:#6b7280;text-decoration:underline;">regenstudio.world</a>
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function renderSections(
  subject: string,
  intro: string,
  sections: { heading: string; body: string }[],
): string {
  let html = "";

  if (intro) {
    html += `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">${intro}</p>`;
  }

  for (const section of sections) {
    html += `
      <h2 style="margin:24px 0 8px;font-size:18px;font-weight:600;color:#1a2b40;">${section.heading}</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${section.body}</p>
    `;
  }

  return html;
}

interface NewsletterPayload {
  subject: string;
  intro: string;
  sections: { heading: string; body: string }[];
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  // Auth: check secret header
  const secret = Deno.env.get("NEWSLETTER_SEND_SECRET");
  const provided = req.headers.get("x-newsletter-secret");
  if (!secret || provided !== secret) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  let body: NewsletterPayload;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  if (!body.subject || !body.sections?.length) {
    return jsonResponse({ error: "subject and sections are required" }, 400, origin);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Fetch active subscribers
  const { data: subscribers, error: fetchError } = await supabase
    .from("newsletter_subscribers")
    .select("email, name, unsubscribe_token")
    .eq("status", "active");

  if (fetchError) {
    console.error("Failed to fetch subscribers:", fetchError);
    return jsonResponse({ error: "Failed to fetch subscribers" }, 500, origin);
  }

  if (!subscribers || subscribers.length === 0) {
    return jsonResponse({ error: "No active subscribers", sent: 0 }, 200, origin);
  }

  // Lettermint API
  const lettermintKey = Deno.env.get("LETTERMINT_API_KEY");
  if (!lettermintKey) {
    return jsonResponse({ error: "LETTERMINT_API_KEY not configured" }, 500, origin);
  }

  const unsubscribeBaseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/newsletter-subscribe`;

  // Build batch of emails
  const messages = subscribers.map((sub) => {
    const unsubscribeUrl = `${unsubscribeBaseUrl}?action=unsubscribe&token=${sub.unsubscribe_token}`;
    const contentHtml = renderSections(body.subject, body.intro, body.sections);
    const html = emailLayout(contentHtml, unsubscribeUrl);

    return {
      to: sub.email,
      subject: body.subject,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });

  // Send via Lettermint batch endpoint
  try {
    const res = await fetch("https://api.lettermint.co/v1/send/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lettermintKey}`,
      },
      body: JSON.stringify({
        route: "broadcast",
        messages,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Lettermint batch send failed:", res.status, errBody);
      return jsonResponse(
        { error: "Failed to send newsletter", detail: errBody },
        502,
        origin,
      );
    }

    const result = await res.json();
    return jsonResponse(
      { ok: true, sent: subscribers.length, lettermint: result },
      200,
      origin,
    );
  } catch (err) {
    console.error("Lettermint request error:", err);
    return jsonResponse({ error: "Failed to connect to email service" }, 502, origin);
  }
});

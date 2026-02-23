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

// --- Email HTML template (matches Regen Studio external brand theme) ---
function emailLayout(content: string, unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FAFBFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;color:#243644;line-height:1.6">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFBFC;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid #E4E2E2;overflow:hidden">

        <!-- Header with scattered rotated triangle characters -->
        <tr><td style="background:#3A5A6E;padding:0;text-align:center;height:88px">
          <table width="100%" cellpadding="0" cellspacing="0" style="height:88px"><tr>
            <td style="vertical-align:middle;text-align:center">
              <div style="font-size:0;line-height:0;height:20px;text-align:left;padding:0 8px">
                <span style="font-size:16px;color:rgba(0,145,75,0.7);padding-left:5px;display:inline-block;transform:rotate(25deg)">&#9650;</span>
                <span style="font-size:9px;color:rgba(0,155,187,0.6);padding-left:22px;display:inline-block;transform:rotate(-40deg)">&#9650;</span>
                <span style="font-size:13px;color:rgba(99,102,241,0.55);padding-left:35px;display:inline-block;transform:rotate(160deg)">&#9650;</span>
                <span style="font-size:7px;color:rgba(255,169,45,0.65);padding-left:18px;display:inline-block;transform:rotate(75deg)">&#9650;</span>
                <span style="font-size:11px;color:rgba(147,9,63,0.5);padding-left:30px;display:inline-block;transform:rotate(-20deg)">&#9650;</span>
                <span style="font-size:6px;color:rgba(0,145,75,0.6);padding-left:15px;display:inline-block;transform:rotate(200deg)">&#9650;</span>
                <span style="font-size:14px;color:rgba(0,155,187,0.45);padding-left:25px;display:inline-block;transform:rotate(110deg)">&#9650;</span>
                <span style="font-size:8px;color:rgba(255,169,45,0.55);padding-left:20px;display:inline-block;transform:rotate(-65deg)">&#9650;</span>
                <span style="font-size:10px;color:rgba(99,102,241,0.5);padding-left:12px;display:inline-block;transform:rotate(45deg)">&#9650;</span>
              </div>
              <span style="color:white;font-size:18px;font-weight:600;letter-spacing:0.5px">REGEN STUDIO</span>
              <div style="font-size:0;line-height:0;height:20px;text-align:right;padding:2px 8px 0">
                <span style="font-size:8px;color:rgba(0,155,187,0.6);padding-right:10px;display:inline-block;transform:rotate(135deg)">&#9650;</span>
                <span style="font-size:15px;color:rgba(255,169,45,0.65);padding-right:28px;display:inline-block;transform:rotate(-30deg)">&#9650;</span>
                <span style="font-size:10px;color:rgba(0,145,75,0.55);padding-right:35px;display:inline-block;transform:rotate(80deg)">&#9650;</span>
                <span style="font-size:7px;color:rgba(99,102,241,0.6);padding-right:15px;display:inline-block;transform:rotate(-90deg)">&#9650;</span>
                <span style="font-size:12px;color:rgba(147,9,63,0.5);padding-right:22px;display:inline-block;transform:rotate(210deg)">&#9650;</span>
                <span style="font-size:6px;color:rgba(0,145,75,0.7);padding-right:40px;display:inline-block;transform:rotate(50deg)">&#9650;</span>
                <span style="font-size:13px;color:rgba(0,155,187,0.5);padding-right:18px;display:inline-block;transform:rotate(-150deg)">&#9650;</span>
                <span style="font-size:9px;color:rgba(255,169,45,0.6);padding-right:30px;display:inline-block;transform:rotate(15deg)">&#9650;</span>
                <span style="font-size:11px;color:rgba(99,102,241,0.55);padding-right:5px;display:inline-block;transform:rotate(-55deg)">&#9650;</span>
              </div>
            </td>
          </tr></table>
        </td></tr>

        <!-- Multi-color accent line -->
        <tr><td style="height:0;font-size:0;line-height:0">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="width:30%;height:3px;background:#00914B"></td>
            <td style="width:20%;height:3px;background:#009BBB"></td>
            <td style="width:20%;height:3px;background:#6366F1"></td>
            <td style="width:15%;height:3px;background:#FFA92D"></td>
            <td style="width:15%;height:3px;background:#93093F"></td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 32px 24px;font-size:15px;line-height:1.7;color:#243644">
          ${content}
        </td></tr>

        <!-- Signature -->
        <tr><td style="padding:0 32px 32px">
          <div style="border-top:1px solid #E4E2E2;padding-top:20px">
            <p style="margin:0 0 4px;font-weight:600;font-size:14px;color:#243644">Best regards,</p>
            <p style="margin:0 0 12px;font-size:14px;color:#5781A1">The Regen Studio team</p>
            <a href="https://www.regenstudio.world" style="color:#00914B;font-size:13px;text-decoration:none">www.regenstudio.world</a>
          </div>
        </td></tr>

        <!-- Footer with triangle accent -->
        <tr><td style="height:0;font-size:0;line-height:0">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="width:30%;height:2px;background:#00914B"></td>
            <td style="width:20%;height:2px;background:#009BBB"></td>
            <td style="width:20%;height:2px;background:#6366F1"></td>
            <td style="width:15%;height:2px;background:#FFA92D"></td>
            <td style="width:15%;height:2px;background:#93093F"></td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#FAFBFC;padding:20px 32px;text-align:center">
          <p style="margin:0;font-size:12px;color:#9B9B9B">
            <span style="color:#00914B">&#9650;</span> &nbsp;
            You received this because you subscribed to the Regen Studio newsletter
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#9B9B9B">
            <a href="${unsubscribeUrl}" style="color:#5781A1;text-decoration:underline">Unsubscribe</a>
            &nbsp;&middot;&nbsp;
            <a href="https://www.regenstudio.world/privacy.html" style="color:#5781A1;text-decoration:underline">Privacy Policy</a>
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#9B9B9B">&copy; ${new Date().getFullYear()} Regen Studio &middot; Innovations that regenerate</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderSections(
  _subject: string,
  intro: string,
  sections: { heading: string; body: string }[],
): string {
  let html = "";

  if (intro) {
    html += `<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#243644">${intro}</p>`;
  }

  for (const section of sections) {
    html += `
      <h2 style="margin:24px 0 8px;font-size:17px;font-weight:600;color:#243644">${section.heading}</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#243644">${section.body}</p>
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

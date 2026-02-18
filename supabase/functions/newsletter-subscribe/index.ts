import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://www.regenstudio.world",
  "https://regenstudio.world",
];

function corsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function htmlResponse(html: string, status: number) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- GET: Unsubscribe ---
  if (req.method === "GET") {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const token = url.searchParams.get("token");

    if (action !== "unsubscribe" || !token) {
      return htmlResponse("<h1>Invalid request</h1>", 400);
    }

    const { data, error } = await supabase
      .from("newsletter_subscribers")
      .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
      .eq("unsubscribe_token", token)
      .eq("status", "active")
      .select("email")
      .single();

    if (error || !data) {
      return htmlResponse(`
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unsubscribe — Regen Studio</title>
        <style>body{font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa;color:#1a2b40}
        .card{text-align:center;padding:3rem;max-width:480px}h1{font-size:1.5rem;margin-bottom:.5rem}p{color:#6b7280;line-height:1.6}</style></head>
        <body><div class="card">
          <h1>Already unsubscribed</h1>
          <p>This email address has already been unsubscribed or the link is invalid.</p>
          <p><a href="https://www.regenstudio.world">Visit Regen Studio</a></p>
        </div></body></html>
      `, 200);
    }

    return htmlResponse(`
      <!DOCTYPE html>
      <html lang="en">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Unsubscribed — Regen Studio</title>
      <style>body{font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa;color:#1a2b40}
      .card{text-align:center;padding:3rem;max-width:480px}h1{font-size:1.5rem;margin-bottom:.5rem}p{color:#6b7280;line-height:1.6}.check{font-size:3rem;margin-bottom:1rem}</style></head>
      <body><div class="card">
        <div class="check">&#10003;</div>
        <h1>You've been unsubscribed</h1>
        <p>You won't receive any more newsletters from Regen Studio. If this was a mistake, you can re-subscribe on our <a href="https://www.regenstudio.world/blog.html">blog page</a>.</p>
      </div></body></html>
    `, 200);
  }

  // --- POST: Subscribe ---
  if (req.method === "POST") {
    let body: { email?: string; name?: string; source?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, origin);
    }

    const email = (body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Valid email is required" }, 400, origin);
    }

    const name = (body.name || "").trim() || null;
    const source = body.source || "blog_subscribe";

    // Upsert: if previously unsubscribed, reactivate
    const { error } = await supabase
      .from("newsletter_subscribers")
      .upsert(
        {
          email,
          name,
          source,
          status: "active",
          subscribed_at: new Date().toISOString(),
          unsubscribed_at: null,
        },
        { onConflict: "email" },
      );

    if (error) {
      console.error("Subscribe error:", error);
      return jsonResponse({ error: "Failed to subscribe" }, 500, origin);
    }

    return jsonResponse({ ok: true }, 200, origin);
  }

  return jsonResponse({ error: "Method not allowed" }, 405, origin);
});

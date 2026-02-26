import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://demos.regenstudio.world",
  "https://demos.regenstudio.space",
  "https://www.regenstudio.world",
  "https://www.regenstudio.space",
  "https://regenstudio.world",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Simple UA parsing — no external dependencies
function parseDevice(ua: string): string {
  if (/Mobile|Android.*Mobile|iPhone|iPod/i.test(ua)) return "mobile";
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return "tablet";
  return "desktop";
}

function parseBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "edge";
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return "opera";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "safari";
  if (/Firefox\//i.test(ua)) return "firefox";
  return "other";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { pathname, event_type, referrer_domain, from_page, target, section, time_on_page_ms, site: rawSite } = body;

    if (!event_type) {
      return new Response(
        JSON.stringify({ error: "event_type required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Validate site field — must be 'www' or 'demos'
    const VALID_SITES = ["www", "demos"];
    const site = VALID_SITES.includes(rawSite) ? rawSite : "demos";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Extract IP from request headers (never stored raw)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    const country = req.headers.get("cf-ipcountry") || "XX";
    const today = new Date().toISOString().split("T")[0];
    const pagePath = pathname || "/";

    // Parse device and browser from UA
    const deviceType = parseDevice(ua);
    const browserFamily = parseBrowser(ua);

    // 1. Increment aggregate counter (no personal data stored) — backward compat
    const { error: rpcError } = await supabase.rpc("increment_page_view", {
      p_date: today,
      p_pathname: pagePath,
      p_event_type: event_type,
      p_country: country,
      p_referrer: referrer_domain || "direct",
      p_site: site,
    });

    if (rpcError) {
      console.error("RPC error:", rpcError);
    }

    // 2. Compute visitor hash for ALL events (not just page_view)
    const { data: saltRow } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "analytics_daily_salt")
      .single();

    const salt = saltRow?.value || "fallback";
    const visitorHash = await sha256(`${salt}:${ip}:${ua}`);

    // 3. For page_view events: store visitor hash for unique counting (existing behavior)
    if (event_type === "page_view") {
      await supabase.from("visitor_hashes").insert({
        visitor_hash: visitorHash,
        pathname: pagePath,
      });
    }

    // 4. Insert into page_events_raw for extended analytics
    await supabase.from("page_events_raw").insert({
      visitor_hash: visitorHash,
      event_type,
      pathname: pagePath,
      from_page: from_page || null,
      target: target || null,
      section: section || null,
      time_on_page_ms: typeof time_on_page_ms === "number" ? time_on_page_ms : null,
      device_type: deviceType,
      browser_family: browserFamily,
      country,
      referrer: referrer_domain || "direct",
      site,
    });

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ ok: false }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

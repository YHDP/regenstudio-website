import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

async function verifySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  // Lettermint signature format: "t=<timestamp>,v1=<hex-signature>"
  const parts: Record<string, string> = {};
  for (const segment of signatureHeader.split(",")) {
    const [key, ...rest] = segment.split("=");
    parts[key.trim()] = rest.join("=").trim();
  }

  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  // Check timestamp tolerance
  const ts = parseInt(timestamp, 10) * 1000;
  if (Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) return false;

  // HMAC-SHA256 verify
  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const webhookSecret = Deno.env.get("LETTERMINT_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("LETTERMINT_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Read raw body before parsing (needed for signature verification)
  const rawBody = await req.text();

  // Verify signature — mandatory, reject unsigned requests
  const signatureHeader = req.headers.get("X-Lettermint-Signature") || "";
  if (!signatureHeader) {
    return new Response(JSON.stringify({ error: "Missing signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const valid = await verifySignature(rawBody, signatureHeader, webhookSecret);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const eventType = (payload.type as string) || (payload.event as string) || "unknown";
  const messageId = (payload.message_id as string) || (payload.id as string) || null;
  const recipient =
    (payload.recipient as string) ||
    ((payload.data as Record<string, unknown>)?.email as string) ||
    null;

  // Insert event into email_events
  const { error: insertError } = await supabase.from("email_events").insert({
    event_type: eventType,
    message_id: messageId,
    recipient,
    metadata: payload.data || payload.metadata || {},
    raw_payload: payload,
  });

  if (insertError) {
    console.error("Failed to insert email event:", insertError);
  }

  // Auto-suppression: unsubscribe on hard bounces and spam complaints
  const suppressEvents = ["message.hard_bounced", "message.spam_complaint"];
  if (suppressEvents.includes(eventType) && recipient) {
    const { error: suppressError } = await supabase
      .from("newsletter_subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString(),
      })
      .eq("email", recipient.toLowerCase())
      .eq("status", "active");

    if (suppressError) {
      console.error("Auto-suppression error:", suppressError);
    } else {
      console.log(`Auto-suppressed ${recipient} due to ${eventType}`);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

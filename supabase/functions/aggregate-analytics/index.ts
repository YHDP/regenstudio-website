import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * aggregate-analytics — Daily aggregation of page_events_raw into analytics tables.
 *
 * Call with POST { "date": "2026-02-25" } for a specific date,
 * or POST { "backfill": true } to process all dates with raw data.
 * Secured with AGGREGATE_SECRET env var via x-aggregate-secret header.
 *
 * Designed to be called via Supabase cron (pg_cron + pg_net) once daily.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  // Auth: x-aggregate-secret header or Authorization Bearer
  const secret = Deno.env.get("AGGREGATE_SECRET") || Deno.env.get("ADMIN_PASSWORD_HASH") || "";
  const providedSecret =
    req.headers.get("x-aggregate-secret") ||
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";

  if (!secret || providedSecret !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { date?: string; backfill?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body = process yesterday
  }

  try {
    let dates: string[];

    if (body.backfill) {
      // Get all distinct dates from page_events_raw
      const { data } = await supabase
        .from("page_events_raw")
        .select("created_at")
        .order("created_at", { ascending: true });

      const dateSet = new Set<string>();
      (data || []).forEach((r: { created_at: string }) => {
        dateSet.add(r.created_at.split("T")[0]);
      });
      dates = Array.from(dateSet);
      console.log(`Backfill mode: processing ${dates.length} dates`);
    } else if (body.date) {
      dates = [body.date];
    } else {
      // Default: yesterday
      const d = new Date(Date.now() - 86400000);
      dates = [d.toISOString().split("T")[0]];
    }

    const results: Record<string, number> = {};

    for (const date of dates) {
      const nextDate = new Date(new Date(date + "T00:00:00Z").getTime() + 86400000)
        .toISOString()
        .split("T")[0];

      // Fetch all raw events for this date
      const { data: events } = await supabase
        .from("page_events_raw")
        .select("*")
        .gte("created_at", date + "T00:00:00")
        .lt("created_at", nextDate + "T00:00:00");

      if (!events || events.length === 0) {
        results[date] = 0;
        continue;
      }

      results[date] = events.length;

      // Derive site from each event (already stored)
      // Group events by site
      const siteEvents: Record<string, typeof events> = {};
      for (const ev of events) {
        const s = ev.site || "www";
        if (!siteEvents[s]) siteEvents[s] = [];
        siteEvents[s].push(ev);
      }

      for (const [site, sevents] of Object.entries(siteEvents)) {
        // ── 1. unique_visitors_daily ──
        // Count distinct visitor_hash per pathname for page_view events
        const pvEvents = sevents.filter((e) => e.event_type === "page_view");
        const uniqueByPath: Record<string, Set<string>> = {};
        const allUniques = new Set<string>();
        for (const ev of pvEvents) {
          const p = ev.pathname || "/";
          if (!uniqueByPath[p]) uniqueByPath[p] = new Set();
          uniqueByPath[p].add(ev.visitor_hash);
          allUniques.add(ev.visitor_hash);
        }

        // Delete existing rows for this date+site, then insert
        await supabase
          .from("unique_visitors_daily")
          .delete()
          .eq("date", date)
          .eq("site", site);

        const uvRows = Object.entries(uniqueByPath).map(([pathname, hashes]) => ({
          date,
          site,
          pathname,
          uniques: hashes.size,
        }));
        if (uvRows.length > 0) {
          await supabase.from("unique_visitors_daily").insert(uvRows);
        }

        // ── 2. navigation_flows ──
        const flowCounts: Record<string, number> = {};
        for (const ev of pvEvents) {
          if (ev.from_page) {
            const key = `${ev.from_page}|${ev.pathname}`;
            flowCounts[key] = (flowCounts[key] || 0) + 1;
          }
        }

        await supabase
          .from("navigation_flows")
          .delete()
          .eq("date", date)
          .eq("site", site);

        const flowRows = Object.entries(flowCounts).map(([key, count]) => {
          const [from_page, to_page] = key.split("|");
          return { date, site, from_page, to_page, count };
        });
        if (flowRows.length > 0) {
          await supabase.from("navigation_flows").insert(flowRows);
        }

        // ── 3. session_depth_daily ──
        // Pages per visitor_hash (session = same visitor_hash on same day)
        const sessionPages: Record<string, Set<string>> = {};
        for (const ev of pvEvents) {
          if (!sessionPages[ev.visitor_hash]) sessionPages[ev.visitor_hash] = new Set();
          sessionPages[ev.visitor_hash].add(ev.pathname);
        }

        const depthBuckets: Record<string, number> = {};
        for (const pages of Object.values(sessionPages)) {
          const d = Math.min(pages.size, 5);
          const bucket = d >= 5 ? "5+" : String(d);
          depthBuckets[bucket] = (depthBuckets[bucket] || 0) + 1;
        }

        await supabase
          .from("session_depth_daily")
          .delete()
          .eq("date", date)
          .eq("site", site);

        const depthRows = Object.entries(depthBuckets).map(([depth_bucket, count]) => ({
          date,
          site,
          depth_bucket,
          count,
        }));
        if (depthRows.length > 0) {
          await supabase.from("session_depth_daily").insert(depthRows);
        }

        // ── 4. time_on_page_daily ──
        const exitEvents = sevents.filter(
          (e) => e.event_type === "page_exit" && typeof e.time_on_page_ms === "number"
        );

        function timeBucket(ms: number): string {
          if (ms < 10000) return "0-10s";
          if (ms < 30000) return "10-30s";
          if (ms < 60000) return "30s-1m";
          if (ms < 180000) return "1-3m";
          return "3m+";
        }

        const timeByPathBucket: Record<string, number> = {};
        for (const ev of exitEvents) {
          const bucket = timeBucket(ev.time_on_page_ms);
          const key = `${ev.pathname}|${bucket}`;
          timeByPathBucket[key] = (timeByPathBucket[key] || 0) + 1;
        }

        await supabase
          .from("time_on_page_daily")
          .delete()
          .eq("date", date)
          .eq("site", site);

        const timeRows = Object.entries(timeByPathBucket).map(([key, count]) => {
          const [pathname, bucket] = key.split("|");
          return { date, site, pathname, bucket, count };
        });
        if (timeRows.length > 0) {
          await supabase.from("time_on_page_daily").insert(timeRows);
        }

        // ── 5. click_targets_daily ──
        const clickEvents = sevents.filter((e) => e.event_type === "click" && e.target);
        const clickCounts: Record<string, number> = {};
        for (const ev of clickEvents) {
          const key = `${ev.pathname}|${ev.target}|${ev.section || ""}`;
          clickCounts[key] = (clickCounts[key] || 0) + 1;
        }

        await supabase
          .from("click_targets_daily")
          .delete()
          .eq("date", date)
          .eq("site", site);

        const clickRows = Object.entries(clickCounts).map(([key, clicks]) => {
          const [pathname, target, section] = key.split("|");
          return { date, site, pathname, target, section: section || null, clicks };
        });
        if (clickRows.length > 0) {
          await supabase.from("click_targets_daily").insert(clickRows);
        }

        // ── 6. device_daily ──
        const deviceCounts: Record<string, number> = {};
        for (const ev of pvEvents) {
          const key = `${ev.device_type || "unknown"}|${ev.browser_family || "unknown"}`;
          deviceCounts[key] = (deviceCounts[key] || 0) + 1;
        }

        await supabase
          .from("device_daily")
          .delete()
          .eq("date", date)
          .eq("site", site);

        const deviceRows = Object.entries(deviceCounts).map(([key, count]) => {
          const [device_type, browser_family] = key.split("|");
          return { date, site, device_type, browser_family, count };
        });
        if (deviceRows.length > 0) {
          await supabase.from("device_daily").insert(deviceRows);
        }

        // ── 7. entry_exit_daily ──
        // First page_view and last page_exit per session
        const sessionFirstLast: Record<string, { entry: string; exit: string; ts_first: string; ts_last: string }> = {};
        for (const ev of sevents) {
          if (ev.event_type !== "page_view" && ev.event_type !== "page_exit") continue;
          const h = ev.visitor_hash;
          if (!sessionFirstLast[h]) {
            sessionFirstLast[h] = {
              entry: ev.pathname,
              exit: ev.pathname,
              ts_first: ev.created_at,
              ts_last: ev.created_at,
            };
          } else {
            if (ev.created_at < sessionFirstLast[h].ts_first) {
              sessionFirstLast[h].entry = ev.pathname;
              sessionFirstLast[h].ts_first = ev.created_at;
            }
            if (ev.created_at > sessionFirstLast[h].ts_last) {
              sessionFirstLast[h].exit = ev.pathname;
              sessionFirstLast[h].ts_last = ev.created_at;
            }
          }
        }

        const entryExitCounts: Record<string, number> = {};
        for (const { entry, exit } of Object.values(sessionFirstLast)) {
          const key = `${entry}|${exit}`;
          entryExitCounts[key] = (entryExitCounts[key] || 0) + 1;
        }

        await supabase
          .from("entry_exit_daily")
          .delete()
          .eq("date", date)
          .eq("site", site);

        const eeRows = Object.entries(entryExitCounts).map(([key, count]) => {
          const [entry_page, exit_page] = key.split("|");
          return { date, site, entry_page, exit_page, count };
        });
        if (eeRows.length > 0) {
          await supabase.from("entry_exit_daily").insert(eeRows);
        }

        // ── 8. funnel_daily (reports purchase funnel) ──
        // Steps: 1=view DPP page, 2=click pricing, 3=enter email, 4=payment initiated, 5=payment complete
        const funnelSteps: Record<number, { name: string; visitors: Set<string> }> = {
          1: { name: "View DPP page", visitors: new Set() },
          2: { name: "Click pricing", visitors: new Set() },
          3: { name: "Enter email", visitors: new Set() },
          4: { name: "Payment initiated", visitors: new Set() },
          5: { name: "Payment complete", visitors: new Set() },
        };

        for (const ev of sevents) {
          const h = ev.visitor_hash;
          if (ev.pathname === "/digital-product-passports/" && ev.event_type === "page_view") {
            funnelSteps[1].visitors.add(h);
          }
          if (ev.event_type === "click" && ev.target && /pric/i.test(ev.target)) {
            funnelSteps[2].visitors.add(h);
          }
          if (ev.event_type === "click" && ev.target && /gate.*email|unlock/i.test(ev.target)) {
            funnelSteps[3].visitors.add(h);
          }
          if (ev.event_type === "click" && ev.target && /pay|checkout|buy/i.test(ev.target)) {
            funnelSteps[4].visitors.add(h);
          }
          if (ev.event_type === "page_view" && /thank/i.test(ev.pathname)) {
            funnelSteps[5].visitors.add(h);
          }
        }

        await supabase
          .from("funnel_daily")
          .delete()
          .eq("date", date)
          .eq("site", site)
          .eq("funnel_name", "reports_purchase");

        const funnelRows = Object.entries(funnelSteps)
          .filter(([, s]) => s.visitors.size > 0)
          .map(([n, s]) => ({
            date,
            site,
            funnel_name: "reports_purchase",
            step_number: parseInt(n),
            step_name: s.name,
            visitors: s.visitors.size,
          }));
        if (funnelRows.length > 0) {
          await supabase.from("funnel_daily").insert(funnelRows);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, dates_processed: dates.length, results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Aggregation error:", err);
    return new Response(
      JSON.stringify({ error: "Aggregation failed", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

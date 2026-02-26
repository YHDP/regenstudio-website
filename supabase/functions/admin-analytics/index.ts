import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://demos.regenstudio.world",
  "https://demos.regenstudio.space",
  "https://www.regenstudio.world",
  "https://www.regenstudio.space",
  "https://regenstudio.world",
];

const VALID_SITES = ["www", "demos"];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function jsonResponse(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
function applySiteFilter(query: any, site: string) {
  if (site !== "all") return query.eq("site", site);
  return query;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (req.method !== "GET") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth: Bearer <sha256-hex> — compared against ADMIN_PASSWORD_HASH env var
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const expectedHash = Deno.env.get("ADMIN_PASSWORD_HASH") || "";

  if (!token || !expectedHash || token !== expectedHash) {
    return jsonResponse(req, { error: "Unauthorized" }, 401);
  }

  // Parse query params
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "overview";
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const to = url.searchParams.get("to") || new Date().toISOString().split("T")[0];
  const rawSite = url.searchParams.get("site") || "all";
  const site = VALID_SITES.includes(rawSite) ? rawSite : (rawSite === "all" ? "all" : "all");

  try {
    switch (view) {
      case "overview": {
        // Daily views trend
        const { data: views } = await applySiteFilter(
          supabase
            .from("page_views_daily")
            .select("date, views")
            .eq("event_type", "page_view")
            .gte("date", from)
            .lte("date", to),
          site
        ).order("date");

        // Aggregate by date
        const dailyViews: Record<string, number> = {};
        (views || []).forEach((r: { date: string; views: number }) => {
          dailyViews[r.date] = (dailyViews[r.date] || 0) + r.views;
        });

        // Daily uniques
        const { data: uniques } = await applySiteFilter(
          supabase
            .from("unique_visitors_daily")
            .select("date, uniques")
            .gte("date", from)
            .lte("date", to),
          site
        ).order("date");

        const dailyUniques: Record<string, number> = {};
        (uniques || []).forEach((r: { date: string; uniques: number }) => {
          dailyUniques[r.date] = (dailyUniques[r.date] || 0) + r.uniques;
        });

        // Session depth
        const { data: depth } = await applySiteFilter(
          supabase
            .from("session_depth_daily")
            .select("depth_bucket, count")
            .gte("date", from)
            .lte("date", to),
          site
        );

        // Time on page
        const { data: timeData } = await applySiteFilter(
          supabase
            .from("time_on_page_daily")
            .select("bucket, count")
            .gte("date", from)
            .lte("date", to),
          site
        );

        // KPIs
        const totalViews = Object.values(dailyViews).reduce((a, b) => a + b, 0);
        const totalUniques = Object.values(dailyUniques).reduce((a, b) => a + b, 0);

        let totalSessions = 0;
        let weightedDepth = 0;
        (depth || []).forEach((r: { depth_bucket: string; count: number }) => {
          const d = r.depth_bucket === "5+" ? 5 : parseInt(r.depth_bucket);
          totalSessions += r.count;
          weightedDepth += d * r.count;
        });
        const avgDepth = totalSessions > 0 ? +(weightedDepth / totalSessions).toFixed(1) : 0;

        // Compute average time from bucket midpoints
        const timeBucketMs: Record<string, number> = {
          "0-10s": 5000, "10-30s": 20000, "30s-1m": 45000, "1-3m": 120000, "3m+": 300000
        };
        let totalTimeCount = 0;
        let weightedTime = 0;
        (timeData || []).forEach((r: { bucket: string; count: number }) => {
          totalTimeCount += r.count;
          weightedTime += (timeBucketMs[r.bucket] || 30000) * r.count;
        });
        const avgTimeMs = totalTimeCount > 0 ? Math.round(weightedTime / totalTimeCount) : 0;

        return jsonResponse(req, {
          kpis: { totalViews, totalUniques, avgDepth, avgTimeMs },
          dailyViews,
          dailyUniques,
          site,
        });
      }

      case "pages": {
        // Views per pathname — include site column for labeling
        const { data: views } = await applySiteFilter(
          supabase
            .from("page_views_daily")
            .select("site, pathname, views")
            .eq("event_type", "page_view")
            .gte("date", from)
            .lte("date", to),
          site
        );

        // Key by site:pathname when showing "all", just pathname otherwise
        const makeKey = (s: string, p: string) => site === "all" ? s + ":" + p : p;
        const pageViews: Record<string, { views: number; site: string; pathname: string }> = {};
        (views || []).forEach((r: { site: string; pathname: string; views: number }) => {
          const k = makeKey(r.site, r.pathname);
          if (!pageViews[k]) pageViews[k] = { views: 0, site: r.site, pathname: r.pathname };
          pageViews[k].views += r.views;
        });

        // Uniques per pathname
        const { data: uniques } = await applySiteFilter(
          supabase
            .from("unique_visitors_daily")
            .select("site, pathname, uniques")
            .gte("date", from)
            .lte("date", to),
          site
        );

        const pageUniques: Record<string, number> = {};
        (uniques || []).forEach((r: { site: string; pathname: string; uniques: number }) => {
          const k = makeKey(r.site, r.pathname);
          pageUniques[k] = (pageUniques[k] || 0) + r.uniques;
        });

        // Time per pathname
        const { data: timeData } = await applySiteFilter(
          supabase
            .from("time_on_page_daily")
            .select("site, pathname, bucket, count")
            .gte("date", from)
            .lte("date", to),
          site
        );

        const timeBucketMs: Record<string, number> = {
          "0-10s": 5000, "10-30s": 20000, "30s-1m": 45000, "1-3m": 120000, "3m+": 300000
        };
        const pageTimeSum: Record<string, number> = {};
        const pageTimeCount: Record<string, number> = {};
        (timeData || []).forEach((r: { site: string; pathname: string; bucket: string; count: number }) => {
          const k = makeKey(r.site, r.pathname);
          pageTimeSum[k] = (pageTimeSum[k] || 0) + (timeBucketMs[r.bucket] || 30000) * r.count;
          pageTimeCount[k] = (pageTimeCount[k] || 0) + r.count;
        });

        const pages = Object.keys(pageViews).map((k) => ({
          site: pageViews[k].site,
          pathname: pageViews[k].pathname,
          views: pageViews[k].views,
          uniques: pageUniques[k] || 0,
          avgTimeMs: pageTimeCount[k] ? Math.round(pageTimeSum[k] / pageTimeCount[k]) : 0,
        })).sort((a, b) => b.views - a.views);

        return jsonResponse(req, { pages, siteFilter: site });
      }

      case "navigation": {
        const { data: flows } = await applySiteFilter(
          supabase
            .from("navigation_flows")
            .select("from_page, to_page, count")
            .gte("date", from)
            .lte("date", to)
            .order("count", { ascending: false }),
          site
        ).limit(50);

        const { data: entryExit } = await applySiteFilter(
          supabase
            .from("entry_exit_daily")
            .select("entry_page, exit_page, count")
            .gte("date", from)
            .lte("date", to),
          site
        );

        // Aggregate entry pages
        const entries: Record<string, number> = {};
        const exits: Record<string, number> = {};
        (entryExit || []).forEach((r: { entry_page: string; exit_page: string; count: number }) => {
          entries[r.entry_page] = (entries[r.entry_page] || 0) + r.count;
          exits[r.exit_page] = (exits[r.exit_page] || 0) + r.count;
        });

        const entryPages = Object.entries(entries)
          .map(([page, count]) => ({ page, count }))
          .sort((a, b) => b.count - a.count);

        const exitPages = Object.entries(exits)
          .map(([page, count]) => ({ page, count }))
          .sort((a, b) => b.count - a.count);

        return jsonResponse(req, { flows, entryPages, exitPages });
      }

      case "engagement": {
        // Scroll depth from page_views_daily (scroll_25, scroll_50, etc.)
        const { data: scrollData } = await applySiteFilter(
          supabase
            .from("page_views_daily")
            .select("event_type, views")
            .like("event_type", "scroll_%")
            .gte("date", from)
            .lte("date", to),
          site
        );

        const scrollDepth: Record<string, number> = {};
        (scrollData || []).forEach((r: { event_type: string; views: number }) => {
          scrollDepth[r.event_type] = (scrollDepth[r.event_type] || 0) + r.views;
        });

        // Time distribution
        const { data: timeData } = await applySiteFilter(
          supabase
            .from("time_on_page_daily")
            .select("bucket, count")
            .gte("date", from)
            .lte("date", to),
          site
        );

        const timeBuckets: Record<string, number> = {};
        (timeData || []).forEach((r: { bucket: string; count: number }) => {
          timeBuckets[r.bucket] = (timeBuckets[r.bucket] || 0) + r.count;
        });

        // Click targets
        const { data: clicks } = await applySiteFilter(
          supabase
            .from("click_targets_daily")
            .select("pathname, target, section, clicks")
            .gte("date", from)
            .lte("date", to)
            .order("clicks", { ascending: false }),
          site
        ).limit(50);

        return jsonResponse(req, { scrollDepth, timeBuckets, clicks });
      }

      case "acquisition": {
        // Referrer sources
        const { data: refData } = await applySiteFilter(
          supabase
            .from("page_views_daily")
            .select("referrer, views")
            .eq("event_type", "page_view")
            .gte("date", from)
            .lte("date", to),
          site
        );

        const referrers: Record<string, number> = {};
        (refData || []).forEach((r: { referrer: string; views: number }) => {
          referrers[r.referrer || "direct"] = (referrers[r.referrer || "direct"] || 0) + r.views;
        });

        // Countries
        const { data: countryData } = await applySiteFilter(
          supabase
            .from("page_views_daily")
            .select("country, views")
            .eq("event_type", "page_view")
            .gte("date", from)
            .lte("date", to),
          site
        );

        const countries: Record<string, number> = {};
        (countryData || []).forEach((r: { country: string; views: number }) => {
          countries[r.country || "XX"] = (countries[r.country || "XX"] || 0) + r.views;
        });

        // Device & browser
        const { data: deviceData } = await applySiteFilter(
          supabase
            .from("device_daily")
            .select("device_type, browser_family, count")
            .gte("date", from)
            .lte("date", to),
          site
        );

        const devices: Record<string, number> = {};
        const browsers: Record<string, number> = {};
        (deviceData || []).forEach((r: { device_type: string; browser_family: string; count: number }) => {
          devices[r.device_type] = (devices[r.device_type] || 0) + r.count;
          browsers[r.browser_family] = (browsers[r.browser_family] || 0) + r.count;
        });

        return jsonResponse(req, { referrers, countries, devices, browsers });
      }

      case "funnel": {
        const { data: funnelData } = await applySiteFilter(
          supabase
            .from("funnel_daily")
            .select("step_number, step_name, visitors")
            .eq("funnel_name", "reports_purchase")
            .gte("date", from)
            .lte("date", to)
            .order("step_number"),
          site
        );

        // Aggregate by step
        const steps: Record<number, { name: string; visitors: number }> = {};
        (funnelData || []).forEach((r: { step_number: number; step_name: string; visitors: number }) => {
          if (!steps[r.step_number]) {
            steps[r.step_number] = { name: r.step_name, visitors: 0 };
          }
          steps[r.step_number].visitors += r.visitors;
        });

        const funnel = Object.entries(steps)
          .map(([n, s]) => ({ step: parseInt(n), name: s.name, visitors: s.visitors }))
          .sort((a, b) => a.step - b.step);

        return jsonResponse(req, { funnel, siteFilter: site });
      }

      default:
        return jsonResponse(req, { error: "Unknown view: " + view }, 400);
    }
  } catch (err) {
    console.error("Analytics query error:", err);
    return jsonResponse(req, { error: "Internal error" }, 500);
  }
});

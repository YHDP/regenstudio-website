-- Analytics data retention functions
-- Date: 2026-03-07
--
-- Enforces the privacy policy: raw analytics events and visitor hashes
-- are deleted after 48 hours. Only aggregate counters persist.
--
-- IMPORTANT: The cron job schedules must be configured separately
-- in the Supabase SQL Editor (they contain secrets that must not
-- be committed to git). See the companion file:
-- supabase/cron-jobs.sql.example

-- ── 1. Cleanup function: delete raw analytics data older than 48 hours ──

CREATE OR REPLACE FUNCTION cleanup_analytics_raw() RETURNS void AS $$
BEGIN
  DELETE FROM page_events_raw
  WHERE created_at < NOW() - INTERVAL '48 hours';

  DELETE FROM visitor_hashes
  WHERE created_at < NOW() - INTERVAL '48 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Salt rotation: generate a new daily salt for visitor hashing ──

CREATE OR REPLACE FUNCTION rotate_analytics_salt() RETURNS void AS $$
BEGIN
  INSERT INTO app_config (key, value)
  VALUES ('analytics_daily_salt', gen_random_uuid()::text)
  ON CONFLICT (key)
  DO UPDATE SET value = gen_random_uuid()::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Anti-bot rate limiting table and functions
-- Stores hashed IP + date counters for contact form submissions

CREATE TABLE IF NOT EXISTS contact_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  counter INT NOT NULL DEFAULT 1,
  UNIQUE (ip_hash, window_start)
);

ALTER TABLE contact_rate_limits ENABLE ROW LEVEL SECURITY;
-- No anon access — only Edge Function writes via service_role key

-- Atomic upsert: increment counter for an IP hash within the current hour window.
-- Returns the new counter value. If counter exceeds max_allowed, caller should reject.
CREATE OR REPLACE FUNCTION check_and_increment_rate_limit(
  p_ip_hash TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_counter INT;
BEGIN
  -- Truncate to current hour for the sliding window
  v_window := date_trunc('hour', now());

  INSERT INTO contact_rate_limits (ip_hash, window_start, counter)
  VALUES (p_ip_hash, v_window, 1)
  ON CONFLICT (ip_hash, window_start)
  DO UPDATE SET counter = contact_rate_limits.counter + 1
  RETURNING counter INTO v_counter;

  RETURN v_counter;
END;
$$;

-- Cleanup function: remove entries older than 24 hours.
-- Call via pg_cron or manually as needed.
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM contact_rate_limits
  WHERE window_start < now() - INTERVAL '24 hours';
END;
$$;

-- Index for cleanup queries (ip_hash+window_start covered by UNIQUE constraint)
CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON contact_rate_limits (window_start);

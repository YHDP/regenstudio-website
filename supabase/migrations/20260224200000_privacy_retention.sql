-- Privacy retention: email events and newsletter subscriber cleanup
-- Date: 2026-02-24

-- Clean up email events older than 90 days (keep aggregates, delete raw payloads)
CREATE OR REPLACE FUNCTION cleanup_email_events() RETURNS void AS $$
BEGIN
  DELETE FROM email_events WHERE received_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete unsubscribed records after 30 days (GDPR right to erasure)
CREATE OR REPLACE FUNCTION cleanup_unsubscribed() RETURNS void AS $$
BEGIN
  DELETE FROM newsletter_subscribers
  WHERE status = 'unsubscribed'
    AND unsubscribed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cron job schedule (must be configured in Supabase dashboard > Database > Extensions > pg_cron):
--   WEEKLY Sunday 02:00 UTC: SELECT cleanup_email_events();
--   DAILY 02:05 UTC: SELECT cleanup_unsubscribed();

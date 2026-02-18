-- Newsletter subscribers table
CREATE TABLE newsletter_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT NOT NULL,                     -- 'blog_subscribe', 'contact_form', 'dpp_gate'
  status TEXT NOT NULL DEFAULT 'active',    -- 'active', 'unsubscribed'
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  unsubscribe_token UUID DEFAULT gen_random_uuid()
);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_newsletter_active ON newsletter_subscribers (status) WHERE status = 'active';

-- Email delivery events table (webhook receiver)
CREATE TABLE email_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  received_at TIMESTAMPTZ DEFAULT now(),
  event_type TEXT NOT NULL,       -- 'message.delivered', 'message.hard_bounced', etc.
  message_id TEXT,
  recipient TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL
);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_email_events_type ON email_events (event_type);
CREATE INDEX idx_email_events_recipient ON email_events (recipient);

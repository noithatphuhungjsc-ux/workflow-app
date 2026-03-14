-- Push Subscriptions table for WorkFlow app
-- Run this in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow API (anon key) to insert/select/delete
CREATE POLICY "push_sub_insert" ON push_subscriptions FOR INSERT
  WITH CHECK (true);
CREATE POLICY "push_sub_select" ON push_subscriptions FOR SELECT
  USING (true);
CREATE POLICY "push_sub_delete" ON push_subscriptions FOR DELETE
  USING (true);

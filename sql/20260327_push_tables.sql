-- ============================================================
-- Ensure push notification tables exist
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Push Subscriptions (Web Push — VAPID)
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

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (API uses service key)
DO $$ BEGIN
  DROP POLICY IF EXISTS "push_sub_service" ON push_subscriptions;
  CREATE POLICY "push_sub_service" ON push_subscriptions FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Allow anon/authenticated to insert/select (for subscribe API)
DO $$ BEGIN
  DROP POLICY IF EXISTS "push_sub_insert" ON push_subscriptions;
  CREATE POLICY "push_sub_insert" ON push_subscriptions FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "push_sub_select" ON push_subscriptions;
  CREATE POLICY "push_sub_select" ON push_subscriptions FOR SELECT
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "push_sub_delete" ON push_subscriptions;
  CREATE POLICY "push_sub_delete" ON push_subscriptions FOR DELETE
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Push Tokens (FCM native — Android/iOS)
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "push_tokens_service" ON push_tokens;
  CREATE POLICY "push_tokens_service" ON push_tokens FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "push_tokens_select" ON push_tokens;
  CREATE POLICY "push_tokens_select" ON push_tokens FOR SELECT
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "push_tokens_insert" ON push_tokens;
  CREATE POLICY "push_tokens_insert" ON push_tokens FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "push_tokens_delete" ON push_tokens;
  CREATE POLICY "push_tokens_delete" ON push_tokens FOR DELETE
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- Done! Push notification tables ready
-- ============================================================

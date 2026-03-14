-- Cloud Sync table for WorkFlow app
-- Run this in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS user_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_data_user_key ON user_data(user_id, key);

-- RLS
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- Each user can only access their own data
CREATE POLICY "user_data_select" ON user_data FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "user_data_insert" ON user_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_data_update" ON user_data FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "user_data_delete" ON user_data FOR DELETE
  USING (auth.uid() = user_id);

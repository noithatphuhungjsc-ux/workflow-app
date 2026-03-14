-- ═══════════════════════════════════════════════════════════
-- DEV MESSAGES — Bridge giữa điện thoại ↔ Claude Code desktop
-- Chạy trong Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dev_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default',
  project TEXT NOT NULL DEFAULT 'workflow-app',
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  status TEXT DEFAULT 'done' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS — cho phép mọi người truy cập (dev tool, không chứa data nhạy cảm)
ALTER TABLE dev_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dev_messages' AND policyname = 'dev_messages_all') THEN
    CREATE POLICY "dev_messages_all" ON dev_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Realtime — để điện thoại nhận response ngay lập tức
ALTER PUBLICATION supabase_realtime ADD TABLE dev_messages;

-- Index cho query nhanh
CREATE INDEX IF NOT EXISTS idx_dev_messages_session ON dev_messages (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_messages_status ON dev_messages (status) WHERE status = 'pending';

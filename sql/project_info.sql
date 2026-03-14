-- Project Info — shared data cho mọi thành viên trong nhóm chat
-- Chạy SQL này trong Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS project_info (
  conversation_id TEXT PRIMARY KEY,
  info JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE project_info ENABLE ROW LEVEL SECURITY;

-- Mọi authenticated user đều đọc được
CREATE POLICY "read_project_info" ON project_info FOR SELECT
  USING (auth.role() = 'authenticated');

-- Mọi authenticated user đều ghi được (logic phân quyền xử lý ở app)
CREATE POLICY "write_project_info" ON project_info FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "update_project_info" ON project_info FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE project_info;

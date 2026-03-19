-- Requests table — cross-department workflow
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('purchase','advance','payment','document','record')),
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC,
  currency TEXT DEFAULT 'VND',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','rejected','processing','completed','archived')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),

  created_by UUID REFERENCES auth.users,
  assigned_to UUID REFERENCES auth.users,
  project_id UUID,
  dept_role TEXT,
  chat_id UUID REFERENCES conversations(id),

  files JSONB DEFAULT '[]'::jsonb,
  approvals JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_requests_created_by ON requests(created_by);
CREATE INDEX IF NOT EXISTS idx_requests_assigned_to ON requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_project_id ON requests(project_id);

-- RLS policies
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (API uses service role)
CREATE POLICY "service_role_all" ON requests FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can read their own or assigned requests
CREATE POLICY "users_read_own" ON requests FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR assigned_to = auth.uid());

-- Users can insert their own requests
CREATE POLICY "users_insert_own" ON requests FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Users can update requests they created or are assigned to
CREATE POLICY "users_update_own" ON requests FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR assigned_to = auth.uid());

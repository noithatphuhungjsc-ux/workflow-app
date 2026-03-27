-- ============================================================
-- Add missing columns and tables
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Add parent_id to conversations (for sub-threads)
DO $$ BEGIN
  ALTER TABLE conversations ADD COLUMN parent_id UUID REFERENCES conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_parent ON conversations(parent_id);

-- 2. Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  owner_id UUID,
  chat_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "projects_select" ON projects;
  CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "projects_insert" ON projects;
  CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "projects_update" ON projects;
  CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "projects_delete" ON projects;
  CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "projects_service" ON projects;
  CREATE POLICY "projects_service" ON projects FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'normal',
  quadrant INTEGER DEFAULT 4,
  deadline TEXT,
  start_time TEXT,
  assigned_to UUID,
  assigned_by UUID,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  owner_id UUID,
  subtasks JSONB DEFAULT '[]',
  notes JSONB DEFAULT '[]',
  tags TEXT[],
  deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tasks_select" ON tasks;
  CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tasks_insert" ON tasks;
  CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tasks_update" ON tasks;
  CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tasks_delete" ON tasks;
  CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tasks_service" ON tasks;
  CREATE POLICY "tasks_service" ON tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- Done! All missing schema added
-- ============================================================

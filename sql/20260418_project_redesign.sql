-- ============================================================
-- MIGRATION: Project Management Redesign — Đợt 1 (Schema)
-- - Bảng departments (8 phòng ban)
-- - Bảng workflow_templates (quy trình chung toàn công ty)
-- - Bảng workflow_steps (bước con của quy trình, gán phòng ban)
-- - Mở rộng projects + tasks để liên kết với schema mới
-- Run: Supabase Dashboard > SQL Editor
-- An toàn re-run: dùng IF NOT EXISTS / IF EXISTS cho mọi thao tác
-- ============================================================

-- ============================================================
-- 1. DEPARTMENTS — 8 phòng ban cố định của công ty
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,        -- slug: 'kinh-doanh', 'thiet-ke', ...
  name TEXT NOT NULL,                -- 'Kinh doanh', 'Thiết kế', ...
  icon TEXT,                         -- emoji
  sort_order INT NOT NULL DEFAULT 0,
  -- config: metadata tùy biến cho từng phòng (cho phép nâng cấp logic riêng
  -- sau này — vd KPI, quy tắc duyệt, trường form bắt buộc, plugin handler...)
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO departments (code, name, icon, sort_order) VALUES
  ('kinh-doanh',     'Kinh doanh',         '💼', 1),
  ('marketing',      'Marketing',          '📣', 2),
  ('thiet-ke',       'Thiết kế',           '📐', 3),
  ('ky-thuat-sx',    'Kỹ thuật sản xuất',  '⚙️', 4),
  ('san-xuat',       'Sản xuất',           '🪚', 5),
  ('giam-sat',       'Giám sát',           '👁', 6),
  ('cskh',           'Chăm sóc khách hàng','💬', 7),
  ('ke-toan',        'Kế toán',            '💰', 8)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departments_select" ON departments;
DROP POLICY IF EXISTS "departments_write" ON departments;
DROP POLICY IF EXISTS "departments_service" ON departments;

CREATE POLICY "departments_select" ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments_write"  ON departments FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director'));
CREATE POLICY "departments_service" ON departments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. PROFILES — thêm cột department_id (mỗi nhân viên thuộc 1 phòng)
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_dept_lead BOOLEAN DEFAULT false;  -- trưởng phòng

CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON profiles(department_id);

-- ============================================================
-- 3. WORKFLOW_TEMPLATES — quy trình chung toàn công ty
-- (thay thế hardcoded WORKFLOWS + per-user customWorkflows)
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                -- 'Thi công nội thất full', 'Khảo sát + Báo giá', ...
  description TEXT,
  icon TEXT,                          -- emoji
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_active ON workflow_templates(is_active);

ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflow_templates_select" ON workflow_templates;
DROP POLICY IF EXISTS "workflow_templates_write" ON workflow_templates;
DROP POLICY IF EXISTS "workflow_templates_service" ON workflow_templates;

CREATE POLICY "workflow_templates_select" ON workflow_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "workflow_templates_write"  ON workflow_templates FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director'));
CREATE POLICY "workflow_templates_service" ON workflow_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 4. WORKFLOW_STEPS — bước con của quy trình, có gán phòng ban
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,                -- 'Khảo sát hiện trạng', 'Lập bản vẽ 3D', ...
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  estimated_days INT,                -- số ngày dự kiến (nullable)
  -- config: metadata mở rộng cho bước (vd checklist, file đính kèm bắt buộc,
  -- yêu cầu phê duyệt, custom form fields...). Cho phép nâng cấp logic
  -- bước này hoặc cả nhóm bước sau, không cần đổi schema.
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_dept ON workflow_steps(department_id);

ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflow_steps_select" ON workflow_steps;
DROP POLICY IF EXISTS "workflow_steps_write" ON workflow_steps;
DROP POLICY IF EXISTS "workflow_steps_service" ON workflow_steps;

CREATE POLICY "workflow_steps_select" ON workflow_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "workflow_steps_write"  ON workflow_steps FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director'));
CREATE POLICY "workflow_steps_service" ON workflow_steps FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 5. PROJECTS — thêm cột mới (giữ cột cũ để không vỡ frontend)
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_address TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_workflow_id ON projects(workflow_id);

-- ============================================================
-- 6. TASKS — thêm cột mới để gắn task vào step + department
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_step_id UUID REFERENCES workflow_steps(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_workflow_step ON tasks(workflow_step_id);
CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department_id);

-- ============================================================
-- 7. PROJECT_MEMBERS — bảng riêng (thay vì JSONB inline)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
  -- 'lead' = trưởng giai đoạn (= trưởng phòng cho phòng đó trong dự án này)
  -- 'member' = nhân viên trong giai đoạn
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_dept ON project_members(department_id);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "project_members_select" ON project_members;
DROP POLICY IF EXISTS "project_members_write" ON project_members;
DROP POLICY IF EXISTS "project_members_service" ON project_members;

CREATE POLICY "project_members_select" ON project_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_members_write"  ON project_members FOR ALL    TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_dept_lead = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_dept_lead = true)
  );
CREATE POLICY "project_members_service" ON project_members FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 8. ENABLE REALTIME
-- ============================================================
DO $$
BEGIN
  ALTER publication supabase_realtime ADD TABLE departments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER publication supabase_realtime ADD TABLE workflow_templates;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER publication supabase_realtime ADD TABLE workflow_steps;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER publication supabase_realtime ADD TABLE project_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 9. VERIFY
-- ============================================================
SELECT 'departments' AS tbl, COUNT(*) AS rows FROM departments
UNION ALL SELECT 'workflow_templates', COUNT(*) FROM workflow_templates
UNION ALL SELECT 'workflow_steps', COUNT(*) FROM workflow_steps
UNION ALL SELECT 'project_members', COUNT(*) FROM project_members;

-- Expect: departments = 8, others = 0

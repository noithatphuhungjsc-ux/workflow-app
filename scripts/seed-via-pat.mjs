#!/usr/bin/env node
/* Seed via Supabase Management API (PAT-based, no DB password) */
import crypto from "crypto";

const PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = "meqzxwlbdxtdilkrwmxp";
if (!PAT) { console.error("Set SUPABASE_PAT"); process.exit(1); }

const URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function sql(label, query) {
  process.stdout.write(`▶ ${label}... `);
  try {
    const t = Date.now();
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const j = await res.json();
    if (!res.ok) { console.log(`FAIL: ${j.message || JSON.stringify(j)}`); return null; }
    console.log(`OK (${Date.now() - t}ms)`);
    return j;
  } catch (e) { console.log(`FAIL: ${e.message}`); return null; }
}

// ============================================================
// 1. PROJECT TASK EXPENSES — gắn chi tiêu vào 1 vài task done/inprogress
// ============================================================
await sql("Project task expenses", `
DO $$
DECLARE
  t_rec RECORD;
  amt INT;
  cat TEXT;
  cats TEXT[] := ARRAY['material', 'labor', 'transport', 'equipment', 'other'];
BEGIN
  -- Cho mỗi task done của các dự án thi công, gắn 1 expense ngẫu nhiên
  FOR t_rec IN
    SELECT t.id, t.title, t.workflow_step
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.status = 'done'
      AND t.deleted = false
      AND p.workflow_id IS NOT NULL
    LIMIT 50
  LOOP
    -- Random amount theo loại bước
    amt := CASE
      WHEN t_rec.title ILIKE '%vật liệu%' OR t_rec.title ILIKE '%vật tư%' THEN (5000000 + (random() * 25000000)::int)
      WHEN t_rec.title ILIKE '%gia công%' OR t_rec.title ILIKE '%sản xuất%' THEN (3000000 + (random() * 15000000)::int)
      WHEN t_rec.title ILIKE '%vận chuyển%' OR t_rec.title ILIKE '%lắp đặt%' THEN (1000000 + (random() * 5000000)::int)
      WHEN t_rec.title ILIKE '%khảo sát%' OR t_rec.title ILIKE '%báo giá%' THEN (200000 + (random() * 1000000)::int)
      ELSE (500000 + (random() * 3000000)::int)
    END;
    cat := cats[1 + (random() * (array_length(cats, 1) - 1))::int];
    UPDATE tasks SET expense = jsonb_build_object(
      'amount', amt,
      'description', 'Chi cho: ' || t_rec.title,
      'category', cat,
      'paid', random() > 0.3,
      'date', (CURRENT_DATE - (random() * 30)::int)::text
    ) WHERE id = t_rec.id;
  END LOOP;
END $$;
`);

// ============================================================
// 2. STANDALONE EXPENSES per user (lưu vào user_data.expenses JSONB)
// ============================================================
// Compute deterministic UUID for each test user (matches localIdToUUID)
function localToUUID(localId) {
  const hash = crypto.createHash("sha256").update("workflow-" + localId).digest("hex");
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

const TRINH_UUID = "52bd2c76-6ff0-404c-8900-d05984e9271b";

// Generate expense list per user
function genExpenses(deptCode) {
  const today = new Date();
  const expenses = [];
  const templates = {
    "kinh-doanh": [
      { desc: "Tiếp khách trưa", amt: 350000, cat: "relationship" },
      { desc: "Cafe gặp đối tác", amt: 120000, cat: "relationship" },
      { desc: "Xăng xe đi gặp KH", amt: 200000, cat: "personal" },
      { desc: "Quà tặng KH", amt: 500000, cat: "relationship" },
      { desc: "Ăn sáng", amt: 60000, cat: "personal" },
    ],
    "marketing": [
      { desc: "Mua đồ chụp ảnh sản phẩm", amt: 800000, cat: "work" },
      { desc: "Cafe họp team", amt: 180000, cat: "work" },
      { desc: "Chạy ads thử nghiệm", amt: 500000, cat: "work" },
      { desc: "Ăn trưa", amt: 70000, cat: "personal" },
    ],
    "thiet-ke": [
      { desc: "Mua vải mẫu", amt: 450000, cat: "work" },
      { desc: "In ấn bản vẽ", amt: 280000, cat: "work" },
      { desc: "Phần mềm 3D", amt: 1200000, cat: "work" },
      { desc: "Ăn trưa văn phòng", amt: 65000, cat: "personal" },
    ],
    "ky-thuat-sx": [
      { desc: "Đi khảo sát NCC", amt: 320000, cat: "work" },
      { desc: "Cafe + ăn trưa với NCC", amt: 220000, cat: "work" },
      { desc: "Mua dụng cụ đo", amt: 680000, cat: "work" },
    ],
    "san-xuat": [
      { desc: "Mua dầu máy", amt: 450000, cat: "work" },
      { desc: "Vật tư phụ", amt: 280000, cat: "work" },
      { desc: "Ăn trưa nhà máy", amt: 50000, cat: "personal" },
    ],
    "giam-sat": [
      { desc: "Xăng xe ra công trình", amt: 200000, cat: "personal" },
      { desc: "Ăn trưa công trình", amt: 80000, cat: "personal" },
      { desc: "Mua vật tư bù tại chỗ", amt: 350000, cat: "work" },
      { desc: "Đồ bảo hộ", amt: 220000, cat: "work" },
    ],
    "cskh": [
      { desc: "Quà thăm KH", amt: 350000, cat: "relationship" },
      { desc: "Cafe gặp KH", amt: 90000, cat: "relationship" },
      { desc: "Ăn trưa", amt: 75000, cat: "personal" },
    ],
    "ke-toan": [
      { desc: "Phí ngân hàng", amt: 50000, cat: "work" },
      { desc: "Mua hoá đơn đỏ", amt: 30000, cat: "work" },
      { desc: "Ăn trưa văn phòng", amt: 60000, cat: "personal" },
    ],
    "nhan-su": [
      { desc: "Quà tặng nhân viên", amt: 500000, cat: "relationship" },
      { desc: "In ấn HĐLĐ", amt: 80000, cat: "work" },
      { desc: "Ăn trưa", amt: 65000, cat: "personal" },
    ],
  };
  const list = templates[deptCode] || templates["kinh-doanh"];
  // Spread over last 30 days
  list.forEach((tpl, idx) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (idx * 5 + Math.floor(Math.random() * 3)));
    expenses.push({
      id: Date.now() + Math.floor(Math.random() * 100000) + idx,
      description: tpl.desc,
      amount: tpl.amt,
      category: tpl.cat,
      source: "cash",
      date: d.toISOString().split("T")[0],
      paid: Math.random() > 0.2,
    });
  });
  return expenses;
}

// Get all test users + their dept codes
const profilesRes = await sql("Get test users", `
  SELECT u.email, p.id::text AS profile_id, d.code AS dept_code
  FROM auth.users u
  JOIN profiles p ON p.id = u.id
  LEFT JOIN departments d ON d.id = p.department_id
  WHERE u.email LIKE '%@workflow.vn'
`);

if (profilesRes?.length) {
  const users = profilesRes;
  console.log(`  Found ${users.length} users to seed expenses for`);

  // Build batch UPSERT for user_data.expenses
  const values = users.map(u => {
    const localId = u.email.replace("@workflow.vn", "").replace(".", "_");
    const uid = localToUUID(localId);
    const exps = genExpenses(u.dept_code);
    return `('${uid}'::uuid, 'expenses', '${JSON.stringify(exps).replace(/'/g, "''")}'::jsonb, NOW())`;
  });

  await sql("Upsert user_data expenses", `
    INSERT INTO user_data (user_id, key, value, updated_at)
    VALUES ${values.join(",\n")}
    ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
  `);

  // Trinh's expenses (using LOCAL_ID_TO_UUID["trinh"])
  const trinhExps = genExpenses("kinh-doanh"); // Director uses business expenses
  await sql("Trinh expenses", `
    INSERT INTO user_data (user_id, key, value, updated_at)
    VALUES ('${TRINH_UUID}'::uuid, 'expenses', '${JSON.stringify(trinhExps).replace(/'/g, "''")}'::jsonb, NOW())
    ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
  `);
}

// ============================================================
// VERIFY
// ============================================================
const verify = await sql("Verify", `
  SELECT 'tasks with expense' AS bang, COUNT(*) AS n
    FROM tasks WHERE expense IS NOT NULL AND expense != '{}'::jsonb AND expense != 'null'::jsonb
  UNION ALL
  SELECT 'user_data.expenses', COUNT(*)
    FROM user_data WHERE key = 'expenses' AND jsonb_array_length(value) > 0
`);
if (verify) console.table(verify);

console.log("Done.");

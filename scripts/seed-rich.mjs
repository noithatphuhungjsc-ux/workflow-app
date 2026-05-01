#!/usr/bin/env node
/* Seed rich demo data via Postgres direct connection */
import pg from "pg";

const CONN = process.env.PG_URL;
if (!CONN) { console.error("Set PG_URL env"); process.exit(1); }

const client = new pg.Client({ connectionString: CONN });
await client.connect();
console.log("Connected.");

async function run(label, sql) {
  process.stdout.write(`▶ ${label}... `);
  try {
    const t = Date.now();
    await client.query(sql);
    console.log(`OK (${Date.now() - t}ms)`);
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
  }
}

// ============================================================
// 0. Bổ sung cột thiếu (an toàn re-run)
// ============================================================
await run("ALTER projects add deadline + description", `
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline DATE;
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
`);

// ============================================================
// 5. Project descriptions + deadlines + budget (note: no budget col, use description)
// ============================================================
await run("Phần 5 — project descriptions", `
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT * FROM (VALUES
      ('Nhà chị Phương — Q7',
       'Diện tích 95m² · 2PN + bếp mở · Phong cách Bắc Âu hiện đại, gam trung tính.' || E'\\n' ||
       'Khách: Phạm Thị Phương (38, chuyên viên tài chính), 2 con nhỏ → ưu tiên an toàn + dễ vệ sinh.' || E'\\n' ||
       'Ngân sách: 850.000.000đ (đã chốt). Cọc đợt 1 đã thu 30%.' || E'\\n' ||
       'Lưu ý: Khách rất chú trọng chi tiết, phản hồi nhanh trong 24h.',
       '2026-06-30'),
      ('Văn phòng Anh Bảo — Q1',
       'Văn phòng 220m² tầng 5 toà nhà Pasteur · Setup cho 25 nhân viên · Phòng họp + khu pantry.' || E'\\n' ||
       'Khách: Trần Gia Bảo, founder startup fintech.' || E'\\n' ||
       'Ngân sách: 1.500.000.000đ · Deadline 15/7 (trước khi đoàn nhân sự move in).' || E'\\n' ||
       'Yêu cầu: chống ồn, dây mạng âm tường, đèn LED tiết kiệm điện.',
       '2026-07-15'),
      ('Biệt thự Mr Hùng — Thảo Điền',
       'Biệt thự 3 tầng + sân vườn 350m² · 5PN + phòng karaoke + spa nhỏ.' || E'\\n' ||
       'Khách: Nguyễn Văn Hùng (chủ DN logistic), gia đình 4 người + giúp việc.' || E'\\n' ||
       'Ngân sách: 4.200.000.000đ — dự án high-end nhất quý 2.' || E'\\n' ||
       'Đặc thù: dùng gỗ óc chó nhập, đá marble nhập Italy. Khách check tiến độ qua group chat hàng tuần.',
       '2026-09-30'),
      ('Showroom NT đẹp — Tân Bình',
       'Showroom trưng bày sản phẩm nội thất 180m² mặt tiền Cộng Hoà.' || E'\\n' ||
       'Khách: Cty CP Nội Thất Đẹp (đối tác lâu năm) · Người liên hệ: Anh Khoa - Trưởng marketing.' || E'\\n' ||
       'Ngân sách: 680.000.000đ · Tự thiết kế concept showroom.' || E'\\n' ||
       'Mục tiêu: kịp khai trương 20/8.',
       '2026-08-20'),
      ('Quán cafe Latte — Q2',
       'Quán cafe 80m² 2 mặt tiền · Phong cách industrial loft · Sức chứa 40 khách.' || E'\\n' ||
       'Khách: Lê Quỳnh Anh (chủ chuỗi cafe nhỏ) · Đã có brand identity sẵn.' || E'\\n' ||
       'Ngân sách: 420.000.000đ — gồm cả thiết bị quầy bar.' || E'\\n' ||
       'Deadline gấp: 30/6 (kịp khai trương hè).',
       '2026-06-30'),
      ('Khảo sát chị Mai — BT',
       'Khảo sát + báo giá sơ bộ căn hộ 75m² Q. Bình Thạnh.' || E'\\n' ||
       'Khách: Đặng Hồng Mai · Mới mua nhà, chưa quyết style.' || E'\\n' ||
       'Tham khảo 2-3 phương án (Hiện đại / Bắc Âu / Tân cổ điển nhẹ).',
       '2026-05-20'),
      ('Hộ anh Đức — Q10',
       'Tư vấn cải tạo căn hộ chung cư 65m² xuống cấp.' || E'\\n' ||
       'Khách: Lê Minh Đức (giáo viên cấp 3) · Ngân sách hạn chế 250-300tr.' || E'\\n' ||
       'Ưu tiên: cải tạo bếp + WC, sơn lại toàn bộ, thay sàn.',
       '2026-06-15'),
      ('Căn hộ Vinhomes Central',
       'Penthouse 180m² Vinhomes Central Park, view sông Sài Gòn.' || E'\\n' ||
       'Khách: Phạm Thanh Tùng (CEO startup edu) · Yêu cầu high-end nhưng tinh giản.' || E'\\n' ||
       'Ngân sách: 2.800.000.000đ · Đang trong giai đoạn báo giá phương án 2.',
       '2026-12-31'),
      ('Cải tạo bếp anh Tùng — Q5',
       'Cải tạo riêng khu bếp 18m² · Chuyển từ bếp đóng sang bếp mở liên thông phòng khách.' || E'\\n' ||
       'Khách: Nguyễn Mạnh Tùng (đầu bếp nhà hàng) · Yêu cầu chuyên nghiệp như bếp pro.' || E'\\n' ||
       'Ngân sách: 180.000.000đ · Thiết bị bếp khách tự mua.',
       '2026-06-01'),
      ('Penthouse Landmark 81',
       'Penthouse 285m² toà Landmark 81 · 4PN + bar + jacuzzi · Phong cách Luxury Minimal.' || E'\\n' ||
       'Khách: Vũ Hoàng Long (chủ tịch tập đoàn BĐS) · Dự án flagship.' || E'\\n' ||
       'Ngân sách: 6.500.000.000đ — cao nhất năm. Mọi chi tiết phải duyệt qua khách.' || E'\\n' ||
       'Yêu cầu: dùng đồ Ý/Đức nhập khẩu, smart home full nhà, hệ thống âm thanh Bose.',
       '2026-12-15')
    ) AS t(name, descr, dl)
  LOOP
    UPDATE projects
    SET description = p.descr, deadline = p.dl::date
    WHERE name = p.name AND owner_id = (SELECT id FROM auth.users WHERE email = 'trinh@workflow.vn');
  END LOOP;
END $$;
`);

// ============================================================
// 6. Subtasks + notes cho task inprogress
// ============================================================
await run("Phần 6 — subtasks + notes (check description column)", `
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtasks JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes JSONB DEFAULT '[]'::jsonb;
`);

await run("Phần 6 — populate inprogress tasks", `
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM tasks WHERE status = 'inprogress' AND project_id IS NOT NULL LIMIT 50
  LOOP
    UPDATE tasks SET
      description = 'Cần phối hợp với phòng liên quan. Tham khảo file đính kèm trong group chat. Báo cáo tiến độ hàng ngày 17h.',
      subtasks = jsonb_build_array(
        jsonb_build_object('id', 1, 'title', 'Lên kế hoạch chi tiết', 'done', true),
        jsonb_build_object('id', 2, 'title', 'Phối hợp với phòng liên quan', 'done', true),
        jsonb_build_object('id', 3, 'title', 'Thực hiện phần chính', 'done', false),
        jsonb_build_object('id', 4, 'title', 'Kiểm tra chất lượng', 'done', false),
        jsonb_build_object('id', 5, 'title', 'Bàn giao + báo cáo', 'done', false)
      ),
      notes = jsonb_build_array(
        jsonb_build_object('id', 101, 'text', 'Khách yêu cầu báo cáo qua email trước khi sang gặp', 'status', 'doing', 'priority', 'high'),
        jsonb_build_object('id', 102, 'text', 'Tham khảo thêm dự án Anh Bảo cho phương án tương tự', 'status', 'pending', 'priority', 'normal')
      )
    WHERE id = t.id;
  END LOOP;
END $$;
`);

// ============================================================
// 7. Chat messages thực tế
// ============================================================
await run("Phần 7 — chat messages per project", `
DO $$
DECLARE
  proj RECORD;
  trinh_id UUID;
  chat_uid UUID;
  member_ids UUID[];
  base_time TIMESTAMP;
BEGIN
  SELECT id INTO trinh_id FROM auth.users WHERE email = 'trinh@workflow.vn';
  FOR proj IN
    SELECT p.id AS pid, p.name, p.chat_id, p.customer_name
    FROM projects p
    WHERE p.owner_id = trinh_id AND p.chat_id IS NOT NULL
  LOOP
    chat_uid := proj.chat_id;
    base_time := NOW() - INTERVAL '2 days';
    SELECT array_agg(user_id) INTO member_ids FROM project_members
      WHERE project_id = proj.pid AND user_id != trinh_id LIMIT 5;

    INSERT INTO messages (conversation_id, sender_id, content, type, created_at) VALUES
      (chat_uid, trinh_id, '@all Mọi người check task được giao, deadline cụ thể trong app nhé.', 'text', base_time + INTERVAL '5 minutes'),
      (chat_uid, COALESCE(member_ids[1], trinh_id), 'Em đã liên hệ ' || proj.customer_name || ' rồi anh, khách hẹn cuối tuần này gặp.', 'text', base_time + INTERVAL '20 minutes'),
      (chat_uid, COALESCE(member_ids[2], trinh_id), 'OK, em chuẩn bị catalog mẫu để mang theo.', 'text', base_time + INTERVAL '35 minutes'),
      (chat_uid, trinh_id, 'Báo giá phải có 3 phương án để khách chọn. Tránh chỉ 1 option.', 'text', base_time + INTERVAL '1 hour'),
      (chat_uid, COALESCE(member_ids[3], trinh_id), 'Vâng anh. Phòng KT đã bóc tách xong, em gửi file lên drive sau.', 'text', base_time + INTERVAL '4 hours'),
      (chat_uid, COALESCE(member_ids[1], trinh_id), 'Khách vừa nhắn lại, ok phương án 2. Chuyển sang giai đoạn thi công nhé team!', 'text', base_time + INTERVAL '1 day'),
      (chat_uid, trinh_id, '👏 Tuyệt. @Sản xuất chuẩn bị vật liệu. @Giám sát lên lịch khảo sát mặt bằng.', 'text', base_time + INTERVAL '1 day 30 minutes');
  END LOOP;
END $$;
`);

// ============================================================
// 8. Standalone tasks đa dạng theo phòng
// ============================================================
await run("Phần 8 — wipe old standalone", `
  DELETE FROM tasks WHERE project_id IS NULL AND owner_id IN (
    SELECT id FROM auth.users WHERE email LIKE '%@workflow.vn'
  );
`);

await run("Phần 8 — reseed standalone tasks per dept", `
DO $$
DECLARE
  s RECORD;
  d_code TEXT;
BEGIN
  FOR s IN
    SELECT u.id AS uid, p.dept_role, d.code AS dept_code
    FROM auth.users u
    JOIN profiles p ON p.id = u.id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE u.email LIKE '%@workflow.vn' AND p.role != 'director'
  LOOP
    d_code := COALESCE(s.dept_code, 'other');
    IF d_code = 'kinh-doanh' THEN
      INSERT INTO tasks (owner_id, assigned_to, title, description, status, priority, deadline) VALUES
        (s.uid, s.uid, 'Gọi follow-up KH chị Trang Q3', 'Khách quan tâm gói thi công full, gọi lại trước thứ 6 báo giá ước lượng.', 'todo', 'cao', (CURRENT_DATE + 1)::date),
        (s.uid, s.uid, 'Gửi catalog email anh Phước', 'Email kèm 3 mẫu thiết kế phòng khách. CC sếp.', 'inprogress', 'trung', CURRENT_DATE),
        (s.uid, s.uid, 'Cập nhật pipeline tuần', 'Excel pipeline trên drive, cập nhật stage từng KH.', 'todo', 'trung', (CURRENT_DATE + 3)::date),
        (s.uid, s.uid, 'Họp tổng kết doanh số quý', 'Họp với sếp 9h thứ 6.', 'todo', 'cao', (CURRENT_DATE + 5)::date);
    ELSIF d_code = 'marketing' THEN
      INSERT INTO tasks (owner_id, assigned_to, title, description, status, priority, deadline) VALUES
        (s.uid, s.uid, 'Đăng bài FB sản phẩm mới', 'Hoàn thiện caption + ảnh, đăng 19h tối.', 'inprogress', 'cao', CURRENT_DATE),
        (s.uid, s.uid, 'Chiến dịch giảm giá 30/4', 'Lên kế hoạch + duyệt với sếp KD.', 'todo', 'trung', (CURRENT_DATE + 4)::date),
        (s.uid, s.uid, 'Phân tích traffic website tháng', 'Lấy số từ GA + làm slide báo cáo.', 'todo', 'trung', (CURRENT_DATE + 7)::date),
        (s.uid, s.uid, 'Đặt KOC review showroom', 'List 3 KOC, deal giá.', 'todo', 'thap', (CURRENT_DATE + 10)::date);
    ELSIF d_code = 'thiet-ke' THEN
      INSERT INTO tasks (owner_id, assigned_to, title, description, status, priority, deadline) VALUES
        (s.uid, s.uid, 'Sửa concept theo feedback DA Anh Bảo', 'Khách góp ý đổi tone trầm hơn, render lại 3 góc.', 'inprogress', 'cao', (CURRENT_DATE + 1)::date),
        (s.uid, s.uid, 'Render phối cảnh DA chị Phương', 'Phòng khách + bếp, hi-res cho khách duyệt.', 'todo', 'cao', (CURRENT_DATE + 2)::date),
        (s.uid, s.uid, 'Học khoá Sketchup nâng cao', 'Hoàn thành module 3-4 trên Coursera.', 'todo', 'thap', (CURRENT_DATE + 14)::date),
        (s.uid, s.uid, 'Update thư viện vật liệu Q2', 'Bổ sung 20 mẫu vải + 15 mẫu gỗ mới về.', 'todo', 'trung', (CURRENT_DATE + 6)::date);
    ELSIF d_code = 'ky-thuat-sx' THEN
      INSERT INTO tasks (owner_id, assigned_to, title, description, status, priority, deadline) VALUES
        (s.uid, s.uid, 'Bóc tách chi tiết DA Mr Hùng', 'Bản vẽ thiết kế đã có, bóc theo từng hạng mục.', 'inprogress', 'cao', (CURRENT_DATE + 2)::date),
        (s.uid, s.uid, 'Cập nhật giá vật tư mới', 'Làm việc với 5 NCC chính, lấy báo giá Q2.', 'todo', 'trung', (CURRENT_DATE + 4)::date),
        (s.uid, s.uid, 'Họp NCC gỗ óc chó', 'Đàm phán giá lô gỗ DA Penthouse.', 'todo', 'cao', (CURRENT_DATE + 1)::date),
        (s.uid, s.uid, 'Soạn quy trình kiểm tra vật tư', 'Doc Word + checklist.', 'todo', 'trung', (CURRENT_DATE + 7)::date);
    ELSIF d_code = 'san-xuat' THEN
      INSERT INTO tasks (owner_id, assigned_to, title, description, status, priority, deadline) VALUES
        (s.uid, s.uid, 'Bảo dưỡng máy CNC số 2', 'Theo lịch định kỳ tháng. Thay dầu + kiểm tra mũi.', 'inprogress', 'trung', CURRENT_DATE),
        (s.uid, s.uid, 'Dạy việc cho NV mới Tuấn', 'Hướng dẫn 1 tuần phần phay gỗ.', 'todo', 'cao', (CURRENT_DATE + 7)::date),
        (s.uid, s.uid, 'Kiểm tra QA lô gỗ về', 'Lô vừa nhập từ NCC, kiểm độ ẩm + mối mọt.', 'todo', 'cao', (CURRENT_DATE + 1)::date),
        (s.uid, s.uid, 'Sản xuất tủ bếp DA chị Phương', 'Theo thiết kế đã duyệt, deadline ship 28/5.', 'todo', 'cao', (CURRENT_DATE + 10)::date);
    ELSIF d_code = 'giam-sat' THEN
      INSERT INTO tasks (owner_id, assigned_to, title, description, status, priority, deadline) VALUES
        (s.uid, s.uid, 'Kiểm tra công trình DA Mr Hùng', 'Sang công trường lúc 8h, check tiến độ phần thô.', 'inprogress', 'cao', CURRENT_DATE),
        (s.uid, s.uid, 'Lập biên bản nghiệm thu DA Vinhomes', 'Đo đạc + chụp ảnh nghiệm thu phần lắp đặt.', 'todo', 'cao', (CURRENT_DATE + 2)::date),
        (s.uid, s.uid, 'Hướng dẫn thợ lắp đặt mới', 'Tổ trưởng cần đào tạo 2 thợ mới về kỹ thuật lắp.', 'todo', 'trung', (CURRENT_DATE + 5)::date),
        (s.uid, s.uid, 'Khảo sát kỹ thuật DA Quán Latte', 'Đo đạc + chụp hiện trạng sàn.', 'todo', 'cao', (CURRENT_DATE + 1)::date);
    ELSIF d_code = 'cskh' THEN
      INSERT INTO tasks (owner_id, assigned_to, title, description, status, priority, deadline) VALUES
        (s.uid, s.uid, 'Gọi khảo sát hài lòng KH cũ', '5 KH bàn giao Q1, hỏi feedback + ghi nhận.', 'inprogress', 'trung', CURRENT_DATE),
        (s.uid, s.uid, 'Tổng hợp phản hồi Q1', 'Slide + biểu đồ tóm tắt cho sếp.', 'todo', 'trung', (CURRENT_DATE + 4)::date),
        (s.uid, s.uid, 'Xử lý khiếu nại KH chị Hằng', 'Khách phàn nàn về cánh tủ bị xước, xác minh + lên phương án.', 'todo', 'cao', (CURRENT_DATE + 1)::date),
        (s.uid, s.uid, 'Cập nhật CRM danh sách KH thân thiết', 'Tag + note đầy đủ trên hệ thống.', 'todo', 'thap', (CURRENT_DATE + 7)::date);
    ELSIF d_code = 'ke-toan' THEN
      INSERT INTO tasks (owner_id, assigned_to, title, description, status, priority, deadline) VALUES
        (s.uid, s.uid, 'Đối chiếu công nợ NCC Vinawood', 'Đối chiếu sao kê tháng 4.', 'inprogress', 'cao', CURRENT_DATE),
        (s.uid, s.uid, 'Lập phiếu chi tuần 18-22/5', '15 phiếu chi cần in + sếp ký.', 'todo', 'cao', (CURRENT_DATE + 1)::date),
        (s.uid, s.uid, 'Báo cáo thuế GTGT tháng 4', 'Hạn nộp 20/5.', 'todo', 'cao', (CURRENT_DATE + 5)::date),
        (s.uid, s.uid, 'Quyết toán DA Anh Bảo', 'Tính tổng chi + lập báo cáo gửi khách.', 'todo', 'trung', (CURRENT_DATE + 7)::date);
    ELSIF d_code = 'nhan-su' THEN
      INSERT INTO tasks (owner_id, assigned_to, title, description, status, priority, deadline) VALUES
        (s.uid, s.uid, 'Phỏng vấn 3 ứng viên thiết kế', 'Lịch 10h-15h thứ 3.', 'todo', 'cao', (CURRENT_DATE + 2)::date),
        (s.uid, s.uid, 'Soạn HĐLĐ cho NV mới', '3 hợp đồng cần soạn + ký tuần này.', 'inprogress', 'cao', (CURRENT_DATE + 1)::date),
        (s.uid, s.uid, 'Onboarding NV mới phòng KT', 'Giới thiệu công ty + dẫn tour.', 'todo', 'trung', (CURRENT_DATE + 3)::date),
        (s.uid, s.uid, 'Cập nhật BHXH tháng', 'Nộp danh sách NV mới + ngừng việc.', 'todo', 'trung', (CURRENT_DATE + 4)::date);
    ELSE
      INSERT INTO tasks (owner_id, assigned_to, title, status, priority, deadline) VALUES
        (s.uid, s.uid, 'Tổng kết tuần', 'todo', 'trung', (CURRENT_DATE + 2)::date);
    END IF;
  END LOOP;
END $$;
`);

// ============================================================
// VERIFY
// ============================================================
console.log("\n=== VERIFY ===");
const { rows } = await client.query(`
  SELECT 'projects' AS bang, COUNT(*) AS n FROM projects WHERE owner_id = (SELECT id FROM auth.users WHERE email='trinh@workflow.vn')
  UNION ALL SELECT 'projects with description', COUNT(*) FROM projects WHERE description IS NOT NULL
  UNION ALL SELECT 'tasks (project)', COUNT(*) FROM tasks WHERE project_id IS NOT NULL AND deleted = false
  UNION ALL SELECT 'tasks (standalone)', COUNT(*) FROM tasks WHERE project_id IS NULL AND deleted = false
  UNION ALL SELECT 'tasks with subtasks', COUNT(*) FROM tasks WHERE jsonb_array_length(COALESCE(subtasks,'[]'::jsonb)) > 0
  UNION ALL SELECT 'project_members', COUNT(*) FROM project_members
  UNION ALL SELECT 'messages', COUNT(*) FROM messages
  UNION ALL SELECT 'requests', COUNT(*) FROM requests;
`);
console.table(rows);

await client.end();
console.log("Done.");

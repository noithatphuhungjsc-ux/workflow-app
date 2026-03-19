/* Temporary migration runner — DELETE after use */
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const secret = req.headers["x-migration-secret"];
  if (secret !== "run-requests-table-2026") return res.status(403).json({ error: "forbidden" });

  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return res.status(500).json({ error: "missing env" });

  const supabase = createClient(url, key);

  const results = [];

  // 1. Create table
  const { error: e1 } = await supabase.rpc("exec_sql", { sql: "" }).catch(() => ({}));

  // Use raw SQL via supabase-js doesn't support it directly
  // Instead, create table via individual operations
  // Actually, let's just try to insert a test record and see if table exists
  const { error: checkErr } = await supabase.from("requests").select("id").limit(1);

  if (checkErr && checkErr.message.includes("does not exist")) {
    // Table doesn't exist — we need to create it via Supabase Dashboard
    return res.status(200).json({
      status: "table_not_found",
      message: "Table 'requests' does not exist. Please run the SQL migration manually in Supabase Dashboard SQL Editor.",
      sql_file: "supabase/migrations/20260320_requests_table.sql"
    });
  }

  if (checkErr) {
    return res.status(200).json({ status: "error", message: checkErr.message });
  }

  return res.status(200).json({ status: "table_exists", message: "Table 'requests' already exists and is accessible." });
}

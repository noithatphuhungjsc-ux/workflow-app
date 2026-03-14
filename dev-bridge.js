#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   DEV BRIDGE v2 — Anthropic API trực tiếp (không dùng CLI)
   Điện thoại → Supabase → Bridge → Anthropic API → sửa file → trả kết quả

   Cách dùng:
     cd /path/to/project
     node dev-bridge.js
   ═══════════════════════════════════════════════════════════════════ */
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { execSync } from "child_process";
import { resolve, basename, relative, join } from "path";

/* ── Load .env ── */
function loadEnv() {
  try {
    const envFile = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* no .env */ }
}
loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_KEY;
const PROJECT_NAME = process.env.PROJECT_NAME || basename(process.cwd());
const AUTO_DEPLOY = process.env.AUTO_DEPLOY === "true";
const PROJECT_DIR = process.cwd();

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("❌ Thiếu SUPABASE env"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("❌ Thiếu VITE_ANTHROPIC_KEY trong .env"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const log = (icon, msg) => console.log(`${icon} [${new Date().toLocaleTimeString("vi")}] ${msg}`);
let processing = false;

/* ══════════════════════════════════════════════════════
   TOOLS — Claude có thể đọc/sửa file, chạy lệnh
   ══════════════════════════════════════════════════════ */
const tools = [
  {
    name: "read_file",
    description: "Đọc nội dung file trong project. Path là relative từ project root.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Relative file path, e.g. src/App.jsx" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Ghi/tạo file. Ghi đè toàn bộ nội dung.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path" },
        content: { type: "string", description: "Full file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Sửa file bằng cách thay thế chuỗi. old_string phải khớp chính xác.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path" },
        old_string: { type: "string", description: "Chuỗi cần thay thế (phải khớp chính xác)" },
        new_string: { type: "string", description: "Chuỗi thay thế mới" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "list_files",
    description: "Liệt kê files/folders trong thư mục. Path relative từ project root.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Relative dir path, default '.'" } },
      required: [],
    },
  },
  {
    name: "run_command",
    description: "Chạy shell command trong project directory. Dùng cho git, npm, etc.",
    input_schema: {
      type: "object",
      properties: { command: { type: "string", description: "Shell command to run" } },
      required: ["command"],
    },
  },
  {
    name: "search_files",
    description: "Tìm kiếm text trong files (grep). Trả về file:line:content.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search" },
        glob: { type: "string", description: "File glob filter, e.g. '*.jsx'" },
      },
      required: ["pattern"],
    },
  },
];

/* ── Tool executors ── */
function executeTool(name, input) {
  try {
    switch (name) {
      case "read_file": {
        const fp = resolve(PROJECT_DIR, input.path);
        if (!existsSync(fp)) return `❌ File not found: ${input.path}`;
        return readFileSync(fp, "utf-8");
      }
      case "write_file": {
        const fp = resolve(PROJECT_DIR, input.path);
        writeFileSync(fp, input.content, "utf-8");
        return `✅ Đã ghi file: ${input.path} (${input.content.length} bytes)`;
      }
      case "edit_file": {
        const fp = resolve(PROJECT_DIR, input.path);
        if (!existsSync(fp)) return `❌ File not found: ${input.path}`;
        const content = readFileSync(fp, "utf-8");
        if (!content.includes(input.old_string)) return `❌ Không tìm thấy old_string trong ${input.path}`;
        const newContent = content.replace(input.old_string, input.new_string);
        writeFileSync(fp, newContent, "utf-8");
        return `✅ Đã sửa file: ${input.path}`;
      }
      case "list_files": {
        const dir = resolve(PROJECT_DIR, input.path || ".");
        if (!existsSync(dir)) return `❌ Directory not found: ${input.path}`;
        const items = readdirSync(dir).filter(f => !f.startsWith(".") && f !== "node_modules" && f !== "dist");
        return items.map(f => {
          const isDir = statSync(join(dir, f)).isDirectory();
          return `${isDir ? "📁" : "📄"} ${f}`;
        }).join("\n");
      }
      case "run_command": {
        const result = execSync(input.command, { cwd: PROJECT_DIR, timeout: 30000, encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
        return result || "(no output)";
      }
      case "search_files": {
        const glob = input.glob ? `--include="${input.glob}"` : "--include=*.{js,jsx,ts,tsx,css,json,html}";
        const cmd = `grep -rn ${glob} --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.vercel "${input.pattern}" . 2>/dev/null | head -30`;
        const result = execSync(cmd, { cwd: PROJECT_DIR, timeout: 10000, encoding: "utf-8", shell: true });
        return result || "Không tìm thấy";
      }
      default:
        return `❌ Unknown tool: ${name}`;
    }
  } catch (err) {
    return `❌ Error: ${err.message?.slice(0, 200) || err}`;
  }
}

/* ══════════════════════════════════════════════════════
   AGENT LOOP — Gọi Claude API + xử lý tool calls
   ══════════════════════════════════════════════════════ */
const SYSTEM_PROMPT = `Bạn là trợ lý lập trình cho dự án "${PROJECT_NAME}".
Thư mục project: ${PROJECT_DIR}
Tech stack: React + Vite, Supabase, Vercel deployment, PWA.

Bạn có thể đọc, sửa, tạo file và chạy lệnh shell. Khi được yêu cầu sửa code:
1. Đọc file liên quan trước
2. Sửa đúng chỗ cần thiết
3. Trả lời ngắn gọn về những gì đã làm

Luôn trả lời bằng tiếng Việt. Ngắn gọn, đi thẳng vào vấn đề.`;

async function callClaude(userMessage, responseId, metadata = {}) {
  // Build user content with optional images
  let userContent;
  if (metadata.images && metadata.images.length > 0) {
    userContent = [];
    for (const img of metadata.images) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: img.type || "image/jpeg", data: img.base64 },
      });
    }
    userContent.push({ type: "text", text: userMessage });
  } else {
    userContent = userMessage;
  }
  const messages = [{ role: "user", content: userContent }];
  let fullResponse = "";

  // Agent loop — keep going until no more tool calls
  for (let i = 0; i < 20; i++) {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Collect text blocks
    const textBlocks = resp.content.filter(b => b.type === "text").map(b => b.text);
    if (textBlocks.length > 0) {
      fullResponse += textBlocks.join("\n");
      // Update response in realtime
      await supabase.from("dev_messages").update({ content: fullResponse, status: "processing" }).eq("id", responseId);
    }

    // Check for tool use
    const toolBlocks = resp.content.filter(b => b.type === "tool_use");
    if (toolBlocks.length === 0) break; // done

    // Execute tools + stream activity to phone
    messages.push({ role: "assistant", content: resp.content });
    const toolResults = [];
    for (const tb of toolBlocks) {
      // Show activity on phone
      const toolLabel = {
        read_file: `📖 Đọc: ${tb.input.path}`,
        write_file: `📝 Tạo: ${tb.input.path}`,
        edit_file: `✏️ Sửa: ${tb.input.path}`,
        list_files: `📁 Liệt kê: ${tb.input.path || "."}`,
        run_command: `⚡ Chạy: ${tb.input.command?.slice(0, 50)}`,
        search_files: `🔍 Tìm: ${tb.input.pattern}`,
      }[tb.name] || `🔧 ${tb.name}`;

      fullResponse += `\n\n\`${toolLabel}\``;
      await supabase.from("dev_messages").update({ content: fullResponse, status: "processing" }).eq("id", responseId);

      log("🔧", `Tool: ${tb.name}(${JSON.stringify(tb.input).slice(0, 60)})`);
      const result = executeTool(tb.name, tb.input);
      const ok = !result.startsWith("❌");
      fullResponse += ok ? " ✅" : ` ${result.slice(0, 60)}`;
      await supabase.from("dev_messages").update({ content: fullResponse, status: "processing" }).eq("id", responseId);

      log("📎", `Result: ${result.slice(0, 80).replace(/\n/g, "↵")}`);
      toolResults.push({ type: "tool_result", tool_use_id: tb.id, content: result });
    }
    messages.push({ role: "user", content: toolResults });

    if (resp.stop_reason !== "tool_use") break;
  }

  return fullResponse || "✅ Hoàn thành (không có text output)";
}

/* ══════════════════════════════════════════════════════
   PROCESS MESSAGE
   ══════════════════════════════════════════════════════ */
async function processMessage(msg) {
  if (processing) return;
  processing = true;

  log("📱", `Lệnh: "${msg.content.slice(0, 80)}${msg.content.length > 80 ? "..." : ""}"`);

  await supabase.from("dev_messages").update({ status: "processing" }).eq("id", msg.id);

  const { data: resp } = await supabase
    .from("dev_messages")
    .insert({ session_id: msg.session_id, project: PROJECT_NAME, role: "assistant", content: "⚡ Đang xử lý...", status: "processing" })
    .select().single();

  try {
    const result = await callClaude(msg.content, resp.id, msg.metadata || {});

    await supabase.from("dev_messages").update({ content: result, status: "done" }).eq("id", resp.id);
    await supabase.from("dev_messages").update({ status: "done" }).eq("id", msg.id);
    log("✅", "Xong!");

    if (AUTO_DEPLOY) {
      log("🚀", "Deploying...");
      try {
        const out = execSync("vercel --prod --yes", { cwd: PROJECT_DIR, timeout: 120000, encoding: "utf-8", shell: true });
        log("✅", "Deploy done!");
        await supabase.from("dev_messages").update({ metadata: { deployed: true } }).eq("id", resp.id);
      } catch (e) { log("⚠️", `Deploy error: ${e.message?.slice(0, 80)}`); }
    }
  } catch (err) {
    log("❌", `Lỗi: ${err.message?.slice(0, 100)}`);
    await supabase.from("dev_messages").update({ content: `❌ ${err.message}`, status: "error" }).eq("id", resp.id);
    await supabase.from("dev_messages").update({ status: "error" }).eq("id", msg.id);
  }

  processing = false;

  // Check pending
  const { data: pending } = await supabase
    .from("dev_messages").select("*")
    .eq("project", PROJECT_NAME).eq("role", "user").eq("status", "pending")
    .order("created_at", { ascending: true }).limit(1);
  if (pending?.length > 0) processMessage(pending[0]);
}

/* ══════════════════════════════════════════════════════
   START
   ══════════════════════════════════════════════════════ */
async function start() {
  log("🔌", `Bridge v2 — project: ${PROJECT_NAME}`);
  log("📂", `Thư mục: ${PROJECT_DIR}`);
  log("🤖", "Anthropic API: OK");
  log("🚀", `Auto-deploy: ${AUTO_DEPLOY ? "BẬT" : "TẮT"}`);

  // Dọn tin cũ bị stuck
  const { data: stuck } = await supabase.from("dev_messages")
    .update({ status: "error" })
    .eq("project", PROJECT_NAME).in("status", ["pending", "processing"])
    .select();
  if (stuck?.length > 0) log("🧹", `Dọn ${stuck.length} tin cũ bị stuck`);

  // Process pending
  const { data: pending } = await supabase
    .from("dev_messages").select("*")
    .eq("project", PROJECT_NAME).eq("role", "user").eq("status", "pending")
    .order("created_at", { ascending: true });

  if (pending?.length > 0) {
    log("📋", `${pending.length} lệnh chờ`);
    for (const msg of pending) await processMessage(msg);
  }

  // Realtime
  supabase.channel("dev_bridge")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dev_messages", filter: "role=eq.user" },
      (payload) => {
        if (payload.new.status === "pending" && payload.new.project === PROJECT_NAME) processMessage(payload.new);
      })
    .subscribe((s) => {
      if (s === "SUBSCRIBED") log("✅", "Realtime connected — sẵn sàng nhận lệnh!\n");
    });
}

start().catch(e => { console.error("❌", e); process.exit(1); });
process.on("SIGINT", () => { log("👋", "Bye!"); process.exit(0); });

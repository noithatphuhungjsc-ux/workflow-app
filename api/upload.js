import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Missing Supabase config", hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Debug: list buckets first
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    console.log("Buckets:", JSON.stringify(buckets), "Error:", JSON.stringify(bucketsError));

    if (!buckets || buckets.length === 0) {
      // Try creating the bucket with service_role
      const { error: createError } = await supabase.storage.createBucket("chat-uploads", { public: true });
      if (createError && !createError.message?.includes("already exists")) {
        return res.status(400).json({ error: "Cannot access storage", bucketsError, createError });
      }
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const path = req.headers["x-file-path"];
    const contentType = req.headers["content-type"] || "application/octet-stream";

    if (!path) {
      return res.status(400).json({ error: "Missing x-file-path header" });
    }

    const { error } = await supabase.storage.from("chat-uploads").upload(path, body, {
      upsert: true,
      contentType,
    });

    if (error) {
      console.error("Upload error:", error);
      return res.status(400).json({ error: error.message, debug: { bucketCount: buckets?.length } });
    }

    const { data: urlData } = supabase.storage.from("chat-uploads").getPublicUrl(path);

    return res.status(200).json({ url: urlData?.publicUrl });
  } catch (e) {
    console.error("Upload failed:", e);
    return res.status(500).json({ error: e.message });
  }
}

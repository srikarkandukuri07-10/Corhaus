import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { rateLimit } from "@/lib/rateLimit";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Simple magic bytes validator
function isValidFileSignature(buffer: Buffer): { valid: boolean; mime: string; ext: string } {
  if (buffer.length >= 4) {
    const hex = buffer.toString("hex", 0, 4);

    // PNG: 89504e47
    if (hex === "89504e47") {
      return { valid: true, mime: "image/png", ext: "png" };
    }
    // PDF: 25504446 (%PDF)
    if (hex === "25504446") {
      return { valid: true, mime: "application/pdf", ext: "pdf" };
    }
  }

  if (buffer.length >= 3) {
    const hex3 = buffer.toString("hex", 0, 3);
    // JPEG: ffd8ff
    if (hex3 === "ffd8ff") {
      return { valid: true, mime: "image/jpeg", ext: "jpg" };
    }
  }

  if (buffer.length >= 12) {
    const riff = buffer.toString("utf8", 0, 4);
    const webp = buffer.toString("utf8", 8, 12);
    // WebP: RIFF ... WEBP
    if (riff === "RIFF" && webp === "WEBP") {
      return { valid: true, mime: "image/webp", ext: "webp" };
    }
  }

  return { valid: false, mime: "", ext: "" };
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    // Rate limit upload: 10 uploads per 15 minutes per IP
    const { success, retryAfter } = await rateLimit(ip, "support_upload", 10, 15 * 60 * 1000);
    if (!success) {
      return NextResponse.json(
        { error: `Too many upload requests. Please try again after ${retryAfter} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 1. Enforce max size limit: 5MB
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File size exceeds the 5MB limit." }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Validate file type by magic bytes signature (MIME type from client is untrusted)
    const { valid, mime, ext } = isValidFileSignature(buffer);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed formats: JPEG, PNG, WebP, PDF." },
        { status: 415 }
      );
    }

    const supabase = getServiceSupabase();

    // 3. Generate a cryptographically safe unique storage filename using randomUUID
    const safeUUID = crypto.randomUUID();
    const fileName = `${safeUUID}.${ext}`;
    const filePath = `ticket_attachments/${fileName}`;

    // 4. Upload with upsert: false (prevent overwriting files)
    const { error: uploadError } = await supabase.storage
      .from("support_attachments")
      .upload(filePath, buffer, {
        contentType: mime,
        upsert: false,
      });

    if (uploadError) {
      console.error("Attachment upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Return the storage path. Signed URLs must be retrieved via /api/support/attachment route.
    return NextResponse.json({
      success: true,
      filePath, // Save this path in ticket messages
      fileName: file.name,
    });
  } catch (err: any) {
    console.error("POST /api/support/upload error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

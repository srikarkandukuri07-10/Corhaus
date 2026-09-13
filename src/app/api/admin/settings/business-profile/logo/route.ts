import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png"]);
const BUCKET = "business-assets";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided." },
        { status: 400 }
      );
    }

    // MIME type check
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPG and PNG images are allowed." },
        { status: 400 }
      );
    }

    // Size check
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum allowed size is 2 MB." },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    const ext = file.type === "image/png" ? "png" : "jpg";
    const storageKey = `logo/business-logo.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload (upsert) to storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storageKey, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Logo upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload logo. Please try again." },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storageKey);

    const publicUrl = urlData.publicUrl;

    // Persist URL to business_profile row
    const { error: dbError } = await supabase
      .from("business_profile")
      .upsert({ id: "default", logo_url: publicUrl }, { onConflict: "id" });

    if (dbError) {
      console.error("Failed to persist logo URL:", dbError);
      return NextResponse.json(
        { error: "Logo uploaded but failed to save URL. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, logo_url: publicUrl });
  } catch (err: any) {
    console.error("POST /api/admin/settings/business-profile/logo error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to upload logo." },
      { status: 500 }
    );
  }
}

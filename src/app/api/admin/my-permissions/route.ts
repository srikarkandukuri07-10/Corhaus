import { NextResponse } from "next/server";
import { getUserRolePermissions } from "@/lib/rbac";

export async function GET() {
  try {
    const userPerms = await getUserRolePermissions();
    return NextResponse.json(userPerms);
  } catch (err: any) {
    console.error("GET /api/admin/my-permissions error:", err);
    return NextResponse.json({ error: "Failed to load permissions" }, { status: 500 });
  }
}

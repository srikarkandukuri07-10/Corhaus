import { NextResponse } from "next/server";
import { sendPushToRole, sendPushToUser } from "@/lib/push/service";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { memberId, memberName, amount, paymentMethod = "UPI/Card", invoiceNumber } = body;

    const amtFormatted = typeof amount === "number" ? amount.toLocaleString("en-IN") : String(amount);
    const invText = invoiceNumber ? ` (Inv #${invoiceNumber})` : "";
    const nameText = memberName || "Member";

    // 1. Notify Admin and Managers
    sendPushToRole("admin", {
      title: "💰 Payment Received",
      body: `${nameText} paid ₹${amtFormatted} via ${paymentMethod}${invText}.`,
      url: "/admin/billing/invoices",
      tag: `pay-${invoiceNumber || Date.now()}`,
    }).catch((e) => console.warn("[PUSH NOTIFY ADMIN PAYMENT ERROR]:", e));

    // 2. Notify the Member if memberId is present
    if (memberId) {
      sendPushToUser(memberId, {
        title: "💳 Payment Confirmed",
        body: `Thank you! We received your payment of ₹${amtFormatted}${invText}.`,
        url: "/member",
        tag: `member-pay-${invoiceNumber || Date.now()}`,
      }).catch((e) => console.warn("[PUSH NOTIFY MEMBER PAYMENT ERROR]:", e));
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[NOTIFY PAYMENT] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

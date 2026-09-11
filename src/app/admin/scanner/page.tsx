"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";

export default function ScannerPage() {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase.from("attendance_config").select("static_token").eq("id", "default").maybeSingle();
        const token = data?.static_token || "corhaus-attendance-static";
        const payload = JSON.stringify({ type: "corhaus-attendance", token });
        const url = await QRCode.toDataURL(payload, { width: 300, margin: 1, color: { dark: "#000000", light: "#FFFFFF" } });
        setQrUrl(url);
      } catch {
        QRCode.toDataURL(JSON.stringify({ type: "corhaus-attendance", token: "corhaus-attendance-static" }), { width: 300, margin: 1 }).then(setQrUrl).catch(() => {});
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <div>
        <h1 className="text-2xl font-bold text-fg">
          Attendance <span className="font-semibold text-accent">Scanner</span>
        </h1>
        <p className="text-sm text-fg-3 mt-1">
          Display this QR at reception — members scan it to mark attendance
        </p>
      </div>

      <div className="bg-surface rounded-3xl border border-line p-8 shadow-xs flex flex-col items-center text-center space-y-4">
        <h2 className="text-lg font-bold text-fg">Attendance QR</h2>
        <p className="text-sm text-fg-3">Scan this QR to mark attendance</p>
        <div className="w-80 h-80 bg-white rounded-2xl border-2 border-line p-4 flex items-center justify-center">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="Attendance QR" className="w-full h-full object-contain" />
          ) : (
            <div className="w-40 h-40 bg-surface-2 animate-pulse rounded-lg" />
          )}
        </div>
        <p className="text-xs text-fg-4">Permanent QR • Display at reception</p>
      </div>
    </div>
  );
}

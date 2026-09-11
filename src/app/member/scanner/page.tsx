"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { createClient } from "@/lib/supabase/client";

export default function MemberScanner() {
  const [result, setResult] = useState<{ success?: boolean; message?: string; member?: any; className?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligibleClasses, setEligibleClasses] = useState<any[]>([]);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [pendingQrData, setPendingQrData] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isRunningRef = useRef(false);

  async function submitScan(qrData: string, classId?: string) {
    try {
      const res = await fetch("/api/attendance/member-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrData, classId }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.eligibleClasses) {
          setEligibleClasses(json.eligibleClasses);
          setPendingQrData(qrData);
          setShowClassPicker(true);
          setError(null);
          return;
        }
        setError(json.error || "Scan failed");
        setResult({ success: false, message: json.error });
        return;
      }
      setResult({ success: true, message: json.message, member: json.member, className: json.className });
      setError(null);
      setEligibleClasses([]);
      setShowClassPicker(false);
    } catch (e: any) {
      setError(e.message || "Network error");
    }
  }

  async function handleClassSelect(classId: string) {
    if (pendingQrData) {
      await submitScan(pendingQrData, classId);
    }
  }

  useEffect(() => {
    const scanner = new Html5Qrcode("member-qr-reader");
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        if (isRunningRef.current) return;
        isRunningRef.current = true;
        scanner.pause();
        try {
          submitScan(decodedText).finally(() => {
            setTimeout(() => {
              scanner.resume();
              isRunningRef.current = false;
            }, 3000);
          });
        } catch {
          isRunningRef.current = false;
          scanner.resume();
        }
      },
      () => {}
    ).then(() => {
      isRunningRef.current = false;
    }).catch((err) => {
      setError("Camera not available: " + err);
    });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="space-y-6 p-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-fg">Scan Attendance QR</h1>
      <p className="text-sm text-fg-3">Point your camera at the QR displayed at reception</p>

      <div id="member-qr-reader" className="w-full rounded-xl overflow-hidden border-2 border-line bg-black" />

      {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {result?.success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-center space-y-1">
          <p className="font-bold">Attendance Marked Successfully ✓</p>
          {result.member && <p className="text-sm">{result.member.full_name || "Member"}</p>}
          {result.className && <p className="text-xs">{result.className}</p>}
        </div>
      )}
      {result && !result.success && result.message && !error && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">{result.message}</div>
      )}

      {showClassPicker && eligibleClasses.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-bold text-fg">Select Class</h3>
            <p className="text-xs text-fg-3">Multiple eligible classes found. Choose the correct one:</p>
            <div className="space-y-2">
              {eligibleClasses.map((c: any) => (
                <button key={c.id} onClick={() => handleClassSelect(c.id)} className="w-full p-3 rounded-xl border border-line text-left hover:bg-surface-2">
                  <p className="font-bold text-sm text-fg">{c.title}</p>
                  <p className="text-xs text-fg-3">{c.class_date} {c.class_time} • {c.instructor}</p>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowClassPicker(false); setEligibleClasses([]); }} className="w-full py-2 rounded-xl border border-line text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

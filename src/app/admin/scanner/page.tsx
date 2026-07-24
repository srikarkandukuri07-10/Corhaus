"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import jsQR from "jsqr";

interface ScanResult {
  success: boolean;
  member?: { full_name: string; email: string } | null;
  error?: string;
}

export default function ScannerPage() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isRunningRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [lastScanned, setLastScanned] = useState<ScanResult[]>([]);
  const [scanningFile, setScanningFile] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function playSuccess() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1200;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // silent
    }
  }

  async function markAttendance(bookingId: string, token: string) {
    try {
      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, token }),
      });

      const data = await res.json();

      if (res.ok) {
        playSuccess();
        setResult({ success: true, member: data.member });
        setLastScanned((prev) => [{ success: true, member: data.member }, ...prev].slice(0, 10));
      } else if (res.status === 409) {
        setResult({ success: false, error: "Attendance already recorded", member: data.member });
      } else {
        setResult({ success: false, error: data.error || "Invalid QR code" });
      }
    } catch {
      setResult({ success: false, error: "Network error. Please try again." });
    }
  }

  function resumeCameraAfterDelay() {
    setTimeout(async () => {
      setResult(null);
      if (scannerRef.current && !isRunningRef.current) {
        try {
          await scannerRef.current.resume();
          isRunningRef.current = true;
        } catch {
          // scanner was stopped externally
        }
      }
    }, 3000);
  }

  async function onScanSuccess(decodedText: string) {
    const scanner = scannerRef.current;
    if (!scanner || !isRunningRef.current) return;

    let bookingId: string;
    let token: string;

    try {
      const parsed = JSON.parse(decodedText);
      bookingId = parsed.bookingId;
      token = parsed.token;
    } catch {
      return;
    }

    if (!bookingId || !token) return;

    isRunningRef.current = false;
    try { await scanner.pause(); } catch {} 

    await markAttendance(bookingId, token);
    resumeCameraAfterDelay();
  }

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {}
      )
      .then(() => {
        isRunningRef.current = true;
        setCameraReady(true);
      })
      .catch(() => {
        setResult({ success: false, error: "Camera access denied or unavailable. Please grant camera permission." });
      });

    return () => {
      if (isRunningRef.current) {
        scanner.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFileScan(file: File) {
    if (!scannerRef.current) return;
    if (scanningFile) return;

    if (!file.type.startsWith("image/")) {
      setResult({ success: false, error: "Please upload an image file." });
      return;
    }

    setScanningFile(true);
    setResult(null);

    try {
      const imageData = await readFileAsImageData(file);

      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (!code) {
        setResult({ success: false, error: "Could not read QR code from image. Try a clearer image." });
        return;
      }

      // Pause camera so it doesn't keep firing scans
      if (isRunningRef.current) {
        isRunningRef.current = false;
        try { await scannerRef.current.pause(); } catch {}
      }

      let bookingId: string;
      let token: string;
      try {
        const parsed = JSON.parse(code.data);
        bookingId = parsed.bookingId;
        token = parsed.token;
      } catch {
        setResult({ success: false, error: "Invalid QR payload — expected JSON with bookingId and token" });
        return;
      }

      if (!bookingId || !token) {
        setResult({ success: false, error: "QR payload missing bookingId or token" });
        return;
      }

      await markAttendance(bookingId, token);
      resumeCameraAfterDelay();
    } catch (err) {
      console.error("QR_DECODE_ERROR", err);
      setResult({ success: false, error: `Could not read QR code from image. (${err})` });
    } finally {
      setScanningFile(false);
    }
  }

  function readFileAsImageData(file: File): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Could not get 2d context")); return; }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);
        resolve(ctx.getImageData(0, 0, img.width, img.height));
      };
      img.onerror = () => { reject(new Error("Failed to load image")); URL.revokeObjectURL(img.src); };
      img.src = URL.createObjectURL(file);
    });
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileScan(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileScan(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <div>
        <h1 className="text-2xl font-bold text-[#1B0B38]">
          Attendance <span className="font-semibold text-[#7B3FE4]">Scanner</span>
        </h1>
        <p className="text-sm text-[#1B0B38]/60 mt-1">
          Scan member QR codes to record attendance
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-[#1B0B38]/10 p-6 shadow-xs">
        <div className="max-w-md mx-auto">
          {!cameraReady && !result?.error && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-[#7B3FE4]/30 border-t-[#7B3FE4] rounded-full animate-spin" />
              <p className="text-xs text-[#1B0B38]/50 font-medium">Requesting camera access...</p>
            </div>
          )}

          <div id="qr-reader" className="rounded-2xl overflow-hidden [&_video]:rounded-2xl [&_img]:rounded-2xl border border-[#1B0B38]/10" />

          {result?.error && !result?.success && (
            <div className="mt-4 p-4 rounded-2xl text-xs text-center bg-red-50 border border-red-200 text-red-700 font-semibold">
              {result.error}
              {result.member && (
                <p className="mt-1 font-bold text-[#1B0B38]">{result.member.full_name}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upload QR section */}
      <div className="bg-white rounded-3xl border border-[#1B0B38]/10 p-6 shadow-xs">
        <div className="max-w-md mx-auto">
          <h3 className="text-sm font-bold text-[#1B0B38] mb-3">Or upload a QR image</h3>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-[#7B3FE4] bg-[#7B3FE4]/5"
                : "border-[#1B0B38]/15 hover:border-[#7B3FE4] hover:bg-[#FAF9FC]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            {scanningFile ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-[#7B3FE4]/30 border-t-[#7B3FE4] rounded-full animate-spin" />
                <p className="text-xs text-[#1B0B38]/50 font-medium">Scanning QR code...</p>
              </div>
            ) : (
              <>
                <svg className="w-8 h-8 mx-auto mb-2 text-[#7B3FE4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-xs text-[#1B0B38]/60 font-medium">
                  <span className="text-[#7B3FE4] font-bold">Click to browse</span> or drag and drop a QR code image
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {result?.success && result.member && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-sm w-full mx-4 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto mb-4 font-bold text-2xl">
              ✓
            </div>
            <h2 className="text-xl font-bold text-[#1B0B38] mb-1">Attendance Marked</h2>
            <p className="text-xs text-[#1B0B38]/60">Attendance marked for</p>
            <p className="text-lg font-bold text-[#7B3FE4] mt-1">{result.member.full_name}</p>
            <p className="text-xs text-[#1B0B38]/50 mt-1">{result.member.email}</p>
            <p className="text-[11px] text-[#1B0B38]/40 mt-3 font-medium">
              Checked in at {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      )}

      {lastScanned.length > 0 && (
        <div className="bg-white rounded-3xl border border-[#1B0B38]/10 p-6 shadow-xs">
          <h3 className="text-base font-bold text-[#1B0B38] mb-4">Recent Scans</h3>
          <div className="space-y-2">
            {lastScanned.map((s, i) => (
              <div
                key={i}
                className={`p-3.5 rounded-2xl text-xs flex items-center justify-between ${
                  s.success
                    ? "bg-emerald-50 border border-emerald-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div>
                  <p className="font-bold text-[#1B0B38]">{s.member?.full_name || "Unknown"}</p>
                  <p className="text-[11px] text-[#1B0B38]/60">{s.member?.email}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                  s.success
                    ? "text-emerald-900 bg-emerald-200"
                    : "text-red-900 bg-red-200"
                }`}>
                  {s.success ? "Attended" : "Failed"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

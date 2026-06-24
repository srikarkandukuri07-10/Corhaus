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
    console.log("ATTENDANCE_LOOKUP", { bookingId, token });
    try {
      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, token }),
      });

      const data = await res.json();

      if (res.ok) {
        console.log("ATTENDANCE_MARKED", data.member);
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

    console.log("QR_DECODE_SUCCESS", decodedText);

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

    console.log("IMAGE_RECEIVED", { name: file.name, size: file.size, type: file.type });

    try {
      const imageData = await readFileAsImageData(file);
      console.log("IMAGE_DIMENSIONS", { width: imageData.width, height: imageData.height });

      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (!code) {
        console.log("QR_DECODE_FAILED", "jsQR returned null — no QR found in image");
        setResult({ success: false, error: "Could not read QR code from image. Try a clearer image." });
        return;
      }

      console.log("QR_DECODE_SUCCESS", code.data);
      console.log("QR_PAYLOAD", code.data);

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
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-light text-brand-navy">
          Attendance <span className="font-medium">Scanner</span>
        </h1>
        <p className="text-sm text-brand-navy/50 mt-1">
          Scan member QR codes to record attendance
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-brand-sand/50 p-6">
        <div className="max-w-md mx-auto">
          {!cameraReady && !result?.error && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
              <p className="text-sm text-brand-navy/40">Requesting camera access...</p>
            </div>
          )}

          <div id="qr-reader" className="rounded-xl overflow-hidden [&_video]:rounded-xl [&_img]:rounded-xl" />

          {result?.error && !result?.success && (
            <div className="mt-4 p-4 rounded-xl text-sm text-center bg-brand-error/10 border border-brand-error/20 text-brand-error">
              {result.error}
              {result.member && (
                <p className="mt-1 font-medium text-brand-navy">{result.member.full_name}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upload QR section */}
      <div className="bg-white rounded-2xl border border-brand-sand/50 p-6">
        <div className="max-w-md mx-auto">
          <h3 className="text-sm font-medium text-brand-navy mb-3">Or upload a QR image</h3>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-brand-brown bg-brand-brown/5"
                : "border-brand-sand hover:border-brand-brown/50 hover:bg-brand-cream"
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
                <div className="w-6 h-6 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                <p className="text-sm text-brand-navy/50">Scanning QR code...</p>
              </div>
            ) : (
              <>
                <svg className="w-8 h-8 mx-auto mb-2 text-brand-navy/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-brand-navy/50">
                  <span className="text-brand-brown font-medium">Click to browse</span> or drag and drop a QR code image
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {result?.success && result.member && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-sm w-full mx-4 text-center">
            <div className="w-20 h-20 rounded-full bg-brand-success/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-brand-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-medium text-brand-navy mb-1">Attendance Marked</h2>
            <p className="text-sm text-brand-navy/60">Attendance marked for</p>
            <p className="text-lg font-semibold text-brand-brown mt-1">{result.member.full_name}</p>
            <p className="text-sm text-brand-navy/50 mt-1">{result.member.email}</p>
            <p className="text-xs text-brand-navy/40 mt-3">
              Checked in at {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      )}

      {lastScanned.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-sand/50 p-6">
          <h3 className="text-lg font-medium text-brand-navy mb-4">Recent Scans</h3>
          <div className="space-y-2">
            {lastScanned.map((s, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl text-sm flex items-center justify-between ${
                  s.success
                    ? "bg-brand-success/5 border border-brand-success/20"
                    : "bg-brand-error/5 border border-brand-error/20"
                }`}
              >
                <div>
                  <p className="font-medium text-brand-navy">{s.member?.full_name || "Unknown"}</p>
                  <p className="text-xs text-brand-navy/50">{s.member?.email}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  s.success
                    ? "text-brand-success bg-brand-success/10"
                    : "text-brand-error bg-brand-error/10"
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

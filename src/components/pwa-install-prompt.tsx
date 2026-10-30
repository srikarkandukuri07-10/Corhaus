"use client";

import { useEffect, useState } from "react";

export default function PwaInstallPrompt({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
      return;
    }

    // Check iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  if (isInstalled) return null;
  if (!deferredPrompt && !isIos) return null;

  if (compact) {
    return (
      <>
        <button
          onClick={handleInstallClick}
          title="Install Corhaus App to your Desktop / Phone"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-2 transition-all shadow-xs ${className}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Install App</span>
        </button>

        {showIosGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-surface border border-line rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-fg">Install Corhaus on iPhone</h3>
                <button onClick={() => setShowIosGuide(false)} className="text-fg-4 hover:text-fg text-sm">✕</button>
              </div>
              <p className="text-xs text-fg-3 leading-relaxed">
                To install this app on your iPhone or iPad:
              </p>
              <ol className="text-xs text-fg space-y-2 list-decimal list-inside bg-surface-2 p-3 rounded-2xl border border-line">
                <li>Tap the <strong>Share</strong> button (box with arrow) at the bottom of Safari.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong> in the top-right corner.</li>
              </ol>
              <button
                onClick={() => setShowIosGuide(false)}
                className="w-full py-2 bg-accent text-white rounded-xl text-xs font-bold"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className={`p-3 rounded-2xl bg-surface-2 border border-line-2 flex items-center justify-between gap-3 shadow-xs ${className}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs">
            📲
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-fg leading-tight">Install Corhaus App</p>
            <p className="text-[11px] text-fg-3 truncate">Use as a standalone app on your phone & desktop</p>
          </div>
        </div>
        <button
          onClick={handleInstallClick}
          className="px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-2 text-white font-bold text-xs shrink-0 transition-colors shadow-2xs"
        >
          Install
        </button>
      </div>

      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-line rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-fg">Install Corhaus on iPhone</h3>
              <button onClick={() => setShowIosGuide(false)} className="text-fg-4 hover:text-fg text-sm">✕</button>
            </div>
            <p className="text-xs text-fg-3 leading-relaxed">
              To install this app on your iPhone or iPad:
            </p>
            <ol className="text-xs text-fg space-y-2 list-decimal list-inside bg-surface-2 p-3 rounded-2xl border border-line">
              <li>Tap the <strong>Share</strong> button at the bottom of Safari.</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> in the top-right corner.</li>
            </ol>
            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2 bg-accent text-white rounded-xl text-xs font-bold"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}

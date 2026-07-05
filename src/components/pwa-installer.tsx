"use client";

import { useEffect, useState } from "react";

export default function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 1. Register the Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then(
          (registration) => {
            console.log("ServiceWorker registration successful with scope: ", registration.scope);
          },
          (err) => {
            console.log("ServiceWorker registration failed: ", err);
          }
        );
      });
    }

    // 2. Check if already installed or running in standalone mode
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const isAppClient = (navigator as any).standalone || isStandalone;

    if (isAppClient) {
      return;
    }

    // 3. Listen to beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Only show if user has not dismissed it before
      const isDismissed = sessionStorage.getItem("pwa-prompt-dismissed") === "true";
      if (!isDismissed) {
        setIsVisible(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 4. Listen to appinstalled event
    const handleAppInstalled = () => {
      setIsVisible(false);
      setDeferredPrompt(null);
      sessionStorage.setItem("pwa-prompt-dismissed", "true");
      console.log("PWA was installed successfully!");
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the browser's install prompt
    deferredPrompt.prompt();
    
    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    
    // Clean up
    setDeferredPrompt(null);
    setIsVisible(false);
    
    if (outcome === "accepted") {
      sessionStorage.setItem("pwa-prompt-dismissed", "true");
    }
  };

  const handleDismissClick = () => {
    setIsVisible(false);
    sessionStorage.setItem("pwa-prompt-dismissed", "true");
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:max-w-sm z-50 bg-white rounded-2xl border border-brand-sand shadow-xl p-5 animate-slide-up">
      <div className="flex gap-4">
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-brand-sand/50 bg-brand-cream flex items-center justify-center">
          <img src="/icon-192.jpg" alt="Corhaus logo" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-brand-navy text-sm font-medium">Install Corhaus App</h4>
          <p className="text-xs text-brand-navy/60 mt-0.5">
            Add Corhaus to your home screen for quick and easy class bookings.
          </p>
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleInstallClick}
              className="flex-1 py-1.5 px-3 rounded-lg bg-brand-brown text-white text-xs font-medium hover:bg-brand-brown-dark transition-colors cursor-pointer"
            >
              Install App
            </button>
            <button
              onClick={handleDismissClick}
              className="py-1.5 px-3 rounded-lg border border-brand-sand text-brand-navy/50 text-xs hover:bg-brand-beige/50 transition-colors cursor-pointer"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

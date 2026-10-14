"use client";

import { useState, useEffect } from "react";
import { Download, X, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    // Listen for the install prompt (Chrome/Android)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      // Chrome/Android — trigger native prompt
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setIsInstalled(true);
      setDeferredPrompt(null);
    } else if (isIOS) {
      // iOS — show guide
      setShowIOSGuide(true);
    } else {
      // Other browser — show generic guide
      setShowIOSGuide(true);
    }
  };

  // Don't show on desktop browsers that aren't Chrome (no install support)
  if (!deferredPrompt && !isIOS) return null;

  return (
    <>
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium transition-all border border-white/10"
        title="Install App"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Install</span>
      </button>

      {/* iOS / Safari install guide overlay */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0a1a] p-6 relative">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-5">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                <Download className="h-6 w-6 text-purple-400" />
              </div>
              <h3 className="text-base font-bold text-white">Install Uniq Social</h3>
              <p className="text-xs text-slate-400 mt-1">Add to your home screen for quick access</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-purple-400 shrink-0">
                  1
                </div>
                <div>
                  <p className="text-sm text-white font-medium">
                    Tap the Share button
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    The <Share className="h-3 w-3 inline" /> icon at the bottom of Safari
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-purple-400 shrink-0">
                  2
                </div>
                <div>
                  <p className="text-sm text-white font-medium">
                    Scroll down and tap &quot;Add to Home Screen&quot;
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    It has a + icon next to it
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-purple-400 shrink-0">
                  3
                </div>
                <div>
                  <p className="text-sm text-white font-medium">
                    Tap &quot;Add&quot;
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    The app will appear on your home screen
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full mt-5 py-2.5 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition-all"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

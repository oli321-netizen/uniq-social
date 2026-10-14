"use client";

import { useState, useEffect } from "react";
import { Download, X, Share, Monitor } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android-chrome" | "mac-safari" | "mac-chrome" | "desktop-chrome" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua) && /Chrome/.test(ua)) return "android-chrome";
  const isMac = /Macintosh/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
  if (isMac && isChrome) return "mac-chrome";
  if (isMac) return "mac-safari";
  if (isChrome) return "desktop-chrome";
  return "other";
}

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    setPlatform(detectPlatform());

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
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setIsInstalled(true);
      setDeferredPrompt(null);
    } else {
      setShowGuide(true);
    }
  };

  // Always show the button — every platform gets either native prompt or a guide
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

      {showGuide && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0a1a] p-6 relative">
            <button
              onClick={() => setShowGuide(false)}
              className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-5">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                <Download className="h-6 w-6 text-purple-400" />
              </div>
              <h3 className="text-base font-bold text-white">Install Uniq Social</h3>
              <p className="text-xs text-slate-400 mt-1">
                {platform === "ios"
                  ? "Add to your home screen for quick access"
                  : "Add to your dock for quick access"}
              </p>
            </div>

            {/* iOS Safari */}
            {platform === "ios" && (
              <div className="space-y-4">
                <Step n={1} title="Tap the Share button">
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    The <Share className="h-3 w-3 inline" /> icon at the bottom of Safari
                  </p>
                </Step>
                <Step n={2} title='Tap "Add to Home Screen"'>
                  <p className="text-xs text-slate-500 mt-0.5">Scroll down — it has a + icon next to it</p>
                </Step>
                <Step n={3} title='Tap "Add"'>
                  <p className="text-xs text-slate-500 mt-0.5">The app will appear on your home screen</p>
                </Step>
              </div>
            )}

            {/* Mac Safari */}
            {platform === "mac-safari" && (
              <div className="space-y-4">
                <Step n={1} title='Click "File" in the menu bar'>
                  <p className="text-xs text-slate-500 mt-0.5">At the top of your screen</p>
                </Step>
                <Step n={2} title='Click "Add to Dock"'>
                  <p className="text-xs text-slate-500 mt-0.5">This adds Uniq Social as an app in your Dock</p>
                </Step>
                <Step n={3} title="Open from your Dock">
                  <p className="text-xs text-slate-500 mt-0.5">It runs in its own window, like a regular app</p>
                </Step>
              </div>
            )}

            {/* Mac Chrome / Desktop Chrome */}
            {(platform === "mac-chrome" || platform === "desktop-chrome") && (
              <div className="space-y-4">
                <Step n={1} title="Click the install icon in the address bar">
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    The <Monitor className="h-3 w-3 inline" /> icon on the right side of the URL bar
                  </p>
                </Step>
                <Step n={2} title='Click "Install"'>
                  <p className="text-xs text-slate-500 mt-0.5">Chrome will add it as a standalone app</p>
                </Step>
              </div>
            )}

            {/* Android Chrome (fallback if native prompt didn't fire) */}
            {platform === "android-chrome" && (
              <div className="space-y-4">
                <Step n={1} title="Tap the three-dot menu">
                  <p className="text-xs text-slate-500 mt-0.5">Top-right corner of Chrome</p>
                </Step>
                <Step n={2} title='Tap "Add to Home screen" or "Install app"'>
                  <p className="text-xs text-slate-500 mt-0.5">It&apos;ll appear on your home screen</p>
                </Step>
              </div>
            )}

            {/* Other / unknown */}
            {platform === "other" && (
              <div className="space-y-4">
                <Step n={1} title="Open in Chrome or Safari">
                  <p className="text-xs text-slate-500 mt-0.5">PWA install works best in these browsers</p>
                </Step>
                <Step n={2} title="Use the browser's install or Add to Home Screen option">
                  <p className="text-xs text-slate-500 mt-0.5">Check the browser menu or address bar</p>
                </Step>
              </div>
            )}

            <button
              onClick={() => setShowGuide(false)}
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

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-purple-400 shrink-0">
        {n}
      </div>
      <div>
        <p className="text-sm text-white font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { X, Cookie } from "lucide-react";

export default function CookieConsent() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const editor = pathname?.startsWith("/hub/editor-lab") || pathname?.startsWith("/hub/hook-lab");

  useEffect(() => {
    try {
      const consent = localStorage.getItem("cookie-consent");
      if (!consent) {
        // Small delay so it doesn't flash on load
        const t = setTimeout(() => setVisible(true), 1500);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem("cookie-consent", "accepted");
    } catch {}
    setVisible(false);
  }

  function decline() {
    try {
      localStorage.setItem("cookie-consent", "declined");
    } catch {}
    setVisible(false);
  }

  if (!visible || editor) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] p-4 sm:p-6 animate-in slide-in-from-bottom duration-500">
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#0a0a1a]/95 backdrop-blur-xl p-5 shadow-2xl shadow-black/40">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Cookie className="h-5 w-5 text-purple-400" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white mb-1">We use cookies</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              We use essential cookies to keep you signed in and make the site work. We also use
              analytics cookies to understand how you use our service so we can improve it.
            </p>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={accept}
                className="px-5 py-2 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white transition-all hover:shadow-lg hover:shadow-purple-500/20"
              >
                Accept All
              </button>
              <button
                onClick={decline}
                className="px-5 py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all"
              >
                Essential Only
              </button>
            </div>
          </div>

          <button
            onClick={decline}
            className="shrink-0 text-slate-600 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

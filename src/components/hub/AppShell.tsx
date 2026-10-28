"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Loader2, LogOut, Menu, Moon, PanelLeft, Settings, Sun, X } from "lucide-react";
import NotificationsMenu from "@/components/hub/NotificationsMenu";
import SectionNav from "@/components/hub/SectionNav";
import InstallButton from "@/components/InstallButton";
import { useTheme } from "@/components/ThemeProvider";

const PACKS = [
  { credits: 20, price: "£5.20" },
  { credits: 50, price: "£13" },
  { credits: 100, price: "£26" },
  { credits: 250, price: "£65" },
  { credits: 500, price: "£130" },
  { credits: 1000, price: "£260" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [credits, setCredits] = useState<number | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpError, setTopUpError] = useState("");
  const [buying, setBuying] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const editor = pathname?.startsWith("/hub/editor-lab") || pathname?.startsWith("/hub/hook-lab");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(pathname || "/")}`);
    }
  }, [status, router, pathname]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("uniq-nav-collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    const load = () => {
      fetch("/api/credits")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setCredits(d.credits ?? 0);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("focus", load);
    window.addEventListener("uniq-credits", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      window.removeEventListener("uniq-credits", load);
    };
  }, [status]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem("uniq-nav-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function buy(creditsToBuy: number) {
    setBuying(creditsToBuy);
    setTopUpError("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: creditsToBuy }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setTopUpError(data.error || "Top up is unavailable. Set STRIPE_SECRET_KEY on the server, or open Account if you already subscribed.");
    } catch {
      setTopUpError("Could not reach checkout.");
    } finally {
      setBuying(null);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b14] text-[#9a9bab]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (editor) {
    return (
      <div className="flex h-screen flex-col bg-[#0a0b14] text-[#e7e8ee]">
        <a href="#hub-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-[#10111c] focus:px-3 focus:py-2">
          Skip to content
        </a>
        <main id="hub-main" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    );
  }

  const sidebar = (narrow: boolean) => (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" className={`flex items-center gap-2 px-2 pb-5 pt-1 text-[16px] font-semibold ${narrow ? "justify-center px-0" : ""}`}>
        <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d="M1 13L7 1M7 13L13 1M12 13L17 4" stroke="#7c5cff" strokeWidth="2.2" strokeLinecap="round" fill="none" /></svg>
        {narrow ? <span className="sr-only">uniq</span> : <span>uniq</span>}
      </Link>
      <SectionNav collapsed={narrow} />
      <button
        type="button"
        onClick={toggleCollapsed}
        className="m-2 flex h-8 items-center gap-2 rounded-lg px-2 text-[12px] text-[#9a9bab] hover:bg-white/[0.04] hover:text-white"
      >
        <PanelLeft className="h-3.5 w-3.5" />
        {narrow ? <span className="sr-only">Collapse</span> : "Collapse"}
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#0a0b14] text-[#e7e8ee]">
      <a href="#hub-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-[#10111c] focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className={`hidden shrink-0 flex-col border-r border-[#1e2130] bg-[#0a0b14] md:flex ${collapsed ? "w-14" : "w-[200px]"}`}>
        {sidebar(collapsed)}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-[#1e2130] bg-[#0a0b14] px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" className="rounded-lg p-1.5 text-[#c8c9d4] md:hidden" aria-label="Open menu" onClick={() => setMobileNav(true)}>
              <Menu className="h-4 w-4" />
            </button>
            <p className="truncate text-[13px] font-medium">
              {pathname === "/dashboard" ? <>Process <span className="font-normal text-[#8a8ea3]">/ New batch</span></> : <span className="capitalize">{pathname?.split("/").filter(Boolean).slice(-1)[0]?.replace(/-/g, " ") || "uniq"}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsMenu />
            <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#1e2130] px-2.5 py-1 text-[12px] text-[#e6e7ee]">
              {credits === null ? "…" : `${credits.toLocaleString()} credits`}
            </span>
            <button
              type="button"
              onClick={() => {
                setTopUpError("");
                setTopUpOpen(true);
              }}
              className="rounded-[7px] border border-[#7c5cff] px-3 py-1 text-[12px] text-[#c9bcff] hover:bg-[#7c5cff]/10"
            >
              Top up
            </button>
            <InstallButton />
            <button type="button" onClick={toggleTheme} className="rounded-lg p-1.5 text-[#9a9bab] hover:text-white" aria-label="Toggle theme" title="Toggle theme">
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <Link href="/account" className="rounded-lg p-1.5 text-[#9a9bab] hover:text-white" aria-label="Account">
              <Settings className="h-3.5 w-3.5" />
            </Link>
            <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="rounded-lg p-1.5 text-[#9a9bab] hover:text-white" aria-label="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>
        <main id="hub-main" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {mobileNav && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setMobileNav(false)} />
          <aside className="relative flex h-full w-[220px] flex-col border-r border-white/10 bg-[#0c0d16]" onClick={() => setMobileNav(false)}>
            {sidebar(false)}
          </aside>
        </div>
      )}

      {topUpOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
          <button type="button" aria-label="Close top up" className="absolute inset-0 bg-black/60" onClick={() => setTopUpOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="topup-title" className="relative w-full max-w-lg rounded-xl border border-white/10 bg-[#10111c] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="topup-title" className="text-[14px] font-medium">Top up credits</h2>
              <button type="button" aria-label="Close" onClick={() => setTopUpOpen(false)} className="rounded-md p-1"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-[12px] leading-relaxed text-[#9a9bab]">
              One credit is used each time the existing processor renders a video. Checkout uses the Stripe packs already configured for this app.
            </p>
            {topUpError && (
              <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300" role="alert">
                {topUpError} <Link href="/account" className="underline">Open account</Link>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PACKS.map((pack) => (
                <button key={pack.credits} type="button" disabled={buying !== null} onClick={() => buy(pack.credits)} className="rounded-lg border border-white/10 px-3 py-2.5 text-left text-[13px] disabled:opacity-50">
                  <span className="block">{pack.credits.toLocaleString()}</span>
                  <span className="text-[12px] text-[#9a9bab]">{buying === pack.credits ? "Opening…" : pack.price}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

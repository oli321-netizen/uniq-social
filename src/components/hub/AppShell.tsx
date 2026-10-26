"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  Bookmark,
  Clapperboard,
  Layers,
  Loader2,
  LogOut,
  Menu,
  PanelLeft,
  Settings,
  Sparkles,
  Users,
  UserRound,
  X,
  Zap,
} from "lucide-react";

const NAV = [
  { href: "/hub/hook-lab", label: "Hook Lab", icon: Sparkles },
  { href: "/hub/process", label: "Process", icon: Clapperboard },
  { href: "/hub/variants", label: "Variants", icon: Layers },
  { href: "/hub/results", label: "Results", icon: BarChart3 },
  { href: "/hub/presets", label: "Presets", icon: Bookmark },
  { href: "/hub/creators", label: "Creators", icon: UserRound },
  { href: "/hub/team", label: "Team", icon: Users },
  { href: "/hub/settings", label: "Settings", icon: Settings },
];

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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpError, setTopUpError] = useState("");
  const [buying, setBuying] = useState<number | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(pathname || "/hub")}`);
    }
  }, [status, router, pathname]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("uniq-hub-sidebar") === "collapsed");
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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("uniq-hub-sidebar", next ? "collapsed" : "open");
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
      setTopUpError(
        data.error ||
          "Top up is unavailable. Set STRIPE_SECRET_KEY on the server, or open Account if you already subscribed."
      );
    } catch {
      setTopUpError("Could not reach checkout.");
    } finally {
      setBuying(null);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F] text-[#8A8A9A]">
        <Loader2 className="h-6 w-6 animate-spin text-[#8B5CF6]" />
        <span className="sr-only">Loading the hub</span>
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-2 px-3 py-4 ${collapsed ? "justify-center" : ""}`}>
        <Link href="/hub/hook-lab" className="flex items-center gap-2 text-[#E8E8F0]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#8B5CF6] text-sm font-semibold text-white">
            u
          </span>
          {!collapsed && <span className="text-[15px] font-semibold tracking-tight">uniq</span>}
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-2" aria-label="Hub">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-[#8B5CF6]/15 text-[#E8E8F0]"
                  : "text-[#8A8A9A] hover:bg-white/5 hover:text-[#E8E8F0]"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={toggleCollapsed}
        className="m-2 hidden items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[#8A8A9A] hover:bg-white/5 hover:text-[#E8E8F0] lg:flex"
      >
        <PanelLeft className="h-4 w-4" aria-hidden />
        {!collapsed && "Collapse"}
      </button>
    </div>
  );

  return (
    <div className="hub-app flex h-screen overflow-hidden bg-[#0A0A0F] text-[#E8E8F0]">
      <a
        href="#hub-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[#8B5CF6] focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside
        className={`hidden shrink-0 border-r border-[#23232F] bg-[#0A0A0F] lg:block ${collapsed ? "w-[72px]" : "w-[240px]"}`}
      >
        {sidebar}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[240px] border-r border-[#23232F] bg-[#0A0A0F]">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#23232F] px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg p-2 text-[#8A8A9A] hover:bg-white/5 hover:text-[#E8E8F0] lg:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </button>
            <p className="truncate text-[13px] text-[#8A8A9A]">
              Creator hub
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#23232F] bg-[#12121A] px-3 py-1 font-mono text-[12px] text-[#E8E8F0]">
              {credits === null ? "…" : credits.toLocaleString()} credits
            </span>
            <button
              type="button"
              onClick={() => {
                setTopUpError("");
                setTopUpOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 px-3 py-1 text-[13px] font-medium text-[#E8E8F0] hover:bg-[#8B5CF6]/20"
            >
              <Zap className="h-3.5 w-3.5 text-[#8B5CF6]" aria-hidden />
              Top up
            </button>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-lg p-2 text-[#8A8A9A] hover:bg-white/5 hover:text-[#E8E8F0]"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main id="hub-main" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {topUpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close top up"
            className="absolute inset-0 bg-black/70"
            onClick={() => setTopUpOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="topup-title"
            className="relative w-full max-w-lg rounded-[10px] border border-[#23232F] bg-[#12121A] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="topup-title" className="text-base font-medium">
                Top up credits
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setTopUpOpen(false)}
                className="rounded-md p-1 text-[#8A8A9A] hover:text-[#E8E8F0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-[13px] text-[#8A8A9A]">
              One credit is used each time the existing processor renders a video. Checkout uses the Stripe packs already configured for this app.
            </p>
            {topUpError && (
              <p className="mb-3 rounded-lg border border-[#F87171]/30 bg-[#F87171]/10 px-3 py-2 text-[13px] text-[#F87171]" role="alert">
                {topUpError}{" "}
                <Link href="/account" className="underline">
                  Open account
                </Link>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PACKS.map((pack) => (
                <button
                  key={pack.credits}
                  type="button"
                  disabled={buying !== null}
                  onClick={() => buy(pack.credits)}
                  className="rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-3 text-left hover:border-[#8B5CF6]/50 disabled:opacity-50"
                >
                  <span className="block font-mono text-sm">{pack.credits.toLocaleString()}</span>
                  <span className="text-[12px] text-[#8A8A9A]">{buying === pack.credits ? "Opening…" : pack.price}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

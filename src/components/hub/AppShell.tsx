"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Fingerprint, Loader2, LogOut, X, Zap } from "lucide-react";
import NotificationsMenu from "@/components/hub/NotificationsMenu";

const PACKS = [
  { credits: 20, price: "£5.20" },
  { credits: 50, price: "£13" },
  { credits: 100, price: "£26" },
  { credits: 250, price: "£65" },
  { credits: 500, price: "£130" },
  { credits: 1000, price: "£260" },
];

const TITLES: { prefix: string; label: string }[] = [
  { prefix: "/hub/hook-lab", label: "Hook Lab" },
  { prefix: "/hub/variants", label: "Variants" },
  { prefix: "/hub/creators", label: "Creators" },
  { prefix: "/hub/results", label: "Results" },
  { prefix: "/hub/presets", label: "Presets" },
  { prefix: "/hub/team", label: "Team" },
  { prefix: "/hub/settings", label: "Settings" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [credits, setCredits] = useState<number | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpError, setTopUpError] = useState("");
  const [buying, setBuying] = useState<number | null>(null);

  const section = TITLES.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))?.label;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(pathname || "/")}`);
    }
  }, [status, router, pathname]);

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
      <div className="flex min-h-screen items-center justify-center bg-[#010313] text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div className="hub-app flex h-screen flex-col overflow-hidden bg-[#010313] text-white">
      <a
        href="#hub-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-purple-600 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/5 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10">
              <Fingerprint className="h-4 w-4 text-purple-400" />
            </span>
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
              Uniq<span className="text-purple-400">Social</span>
            </span>
          </Link>
          <Link href="/" className="truncate text-[13px] text-slate-400 transition-colors hover:text-white">
            Services{section ? ` / ${section}` : ""}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsMenu />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[12px]">
            {credits === null ? "…" : credits.toLocaleString()} credits
          </span>
          <button
            type="button"
            onClick={() => {
              setTopUpError("");
              setTopUpOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[13px] font-medium transition-colors hover:bg-purple-500/20"
          >
            <Zap className="h-3.5 w-3.5 text-purple-400" aria-hidden />
            Top up
          </button>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main id="hub-main" className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </main>

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
            className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0c0c18] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="topup-title" className="text-base font-medium">
                Top up credits
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setTopUpOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-[13px] text-slate-400">
              One credit is used each time the existing processor renders a video. Checkout uses the Stripe packs already configured for this app.
            </p>
            {topUpError && (
              <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300" role="alert">
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
                  className="rounded-lg border border-white/10 bg-[#010313] px-3 py-3 text-left transition-colors hover:border-purple-500/40 disabled:opacity-50"
                >
                  <span className="block font-mono text-sm">{pack.credits.toLocaleString()}</span>
                  <span className="text-[12px] text-slate-400">{buying === pack.credits ? "Opening…" : pack.price}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

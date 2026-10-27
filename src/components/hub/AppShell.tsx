"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Loader2, LogOut, X } from "lucide-react";
import NotificationsMenu from "@/components/hub/NotificationsMenu";

const PACKS = [
  { credits: 20, price: "£5.20" },
  { credits: 50, price: "£13" },
  { credits: 100, price: "£26" },
  { credits: 250, price: "£65" },
  { credits: 500, price: "£130" },
  { credits: 1000, price: "£260" },
];

const NAV = [
  { href: "/hub/hook-lab", label: "Hook Lab" },
  { href: "/hub/variants", label: "Variants" },
  { href: "/hub/creators", label: "Creators" },
  { href: "/hub/results", label: "Results" },
  { href: "/hub/presets", label: "Presets" },
  { href: "/hub/team", label: "Team" },
  { href: "/hub/settings", label: "Settings" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [credits, setCredits] = useState<number | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpError, setTopUpError] = useState("");
  const [buying, setBuying] = useState<number | null>(null);
  const section = NAV.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label;

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
      setTopUpError(data.error || "Top up is unavailable. Set STRIPE_SECRET_KEY on the server, or open Account if you already subscribed.");
    } catch {
      setTopUpError("Could not reach checkout.");
    } finally {
      setBuying(null);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="surface flex min-h-screen items-center justify-center bg-[#f4efe8] text-[#6d5e53]">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div className="surface flex h-screen bg-[#f4efe8] text-[#2c241c]" style={{ fontFamily: '"DM Sans", "Segoe UI", sans-serif' }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" />
      <a href="#hub-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="hidden w-52 shrink-0 flex-col border-r border-[#e4d5c6] bg-[#fffdfb] md:flex">
        <Link href="/" className="px-4 py-4 text-[18px] font-medium">
          UniqSocial
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-2">
          <Link href="/dashboard" className="rounded-md px-3 py-2 text-[15px] text-[#6d5e53] hover:bg-[#f4efe8]">
            Video processor
          </Link>
          {NAV.map((item) => {
            const on = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={`rounded-md px-3 py-2 text-[15px] ${on ? "bg-[#f4efe8] font-medium" : "hover:bg-[#f4efe8]"}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#e4d5c6] bg-[#fffdfb] px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="text-[16px] font-medium md:hidden">UniqSocial</Link>
            <p className="truncate text-[15px] text-[#6d5e53]">{section || "Services"}</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsMenu />
            <span className="rounded-full border border-[#e4d5c6] px-3 py-1 text-[14px]">
              {credits === null ? "…" : credits.toLocaleString()} credits
            </span>
            <button type="button" onClick={() => { setTopUpError(""); setTopUpOpen(true); }} className="rounded-md bg-[#9a3412] px-3 py-1.5 text-[15px] text-[#fffdfb]">
              Top up
            </button>
            <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="rounded-md p-2 text-[#6d5e53]" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex gap-2 overflow-x-auto border-b border-[#e4d5c6] px-3 py-2 md:hidden">
          <Link href="/dashboard" className="shrink-0 text-[15px] text-[#6d5e53]">Video processor</Link>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 text-[15px]">{item.label}</Link>
          ))}
        </div>
        <main id="hub-main" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {topUpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close top up" className="absolute inset-0 bg-[#1c1612]/40" onClick={() => setTopUpOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="topup-title" className="relative w-full max-w-lg rounded-md border border-[#e4d5c6] bg-[#fffdfb] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="topup-title" className="text-[18px] font-medium">Top up credits</h2>
              <button type="button" aria-label="Close" onClick={() => setTopUpOpen(false)} className="rounded-md p-1"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-4 text-[15px] text-[#6d5e53]">
              One credit is used each time the existing processor renders a video. Checkout uses the Stripe packs already configured for this app.
            </p>
            {topUpError && (
              <p className="mb-3 rounded-md border border-[#e4d5c6] bg-[#fff4ef] px-3 py-2 text-[15px]" role="alert">
                {topUpError} <Link href="/account" className="underline">Open account</Link>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PACKS.map((pack) => (
                <button key={pack.credits} type="button" disabled={buying !== null} onClick={() => buy(pack.credits)} className="rounded-md border border-[#e4d5c6] px-3 py-3 text-left disabled:opacity-50">
                  <span className="block text-[15px]">{pack.credits.toLocaleString()}</span>
                  <span className="text-[14px] text-[#6d5e53]">{buying === pack.credits ? "Opening…" : pack.price}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

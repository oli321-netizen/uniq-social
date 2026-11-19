"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { planLabel, unlockedLines } from "@/lib/plan-catalog";

export default function UpgradeNotice() {
  const { data, status } = useSession();
  const [plan, setPlan] = useState("");
  const userId = (data?.user as { id?: string } | undefined)?.id || "";

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    const params = new URLSearchParams(window.location.search);
    const upgraded = params.get("upgraded") || "";
    if (!upgraded) return;
    const key = `uniq-upgrade-seen:${userId}:${upgraded}`;
    try {
      if (localStorage.getItem(key) === "1") return;
    } catch {
      /* ignore */
    }
    setPlan(upgraded);
    window.dispatchEvent(new Event("uniq-credits"));
  }, [status, userId]);

  useEffect(() => {
    if (!plan) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan, userId]);

  function markSeen() {
    if (!plan || !userId) return;
    try {
      localStorage.setItem(`uniq-upgrade-seen:${userId}:${plan}`, "1");
    } catch {
      /* ignore */
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("upgraded");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    setPlan("");
  }

  function dismiss() {
    markSeen();
  }

  if (!plan) return null;
  const lines = unlockedLines(plan);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={dismiss}>
      <style>{`@keyframes uniq-pop { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }`}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="w-full max-w-sm rounded-[10px] border border-[#1e2130] bg-[#10121c] p-4 text-[13px] text-[#e6e7ee]"
        style={{ animation: "uniq-pop 180ms ease" }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="upgrade-title" className="text-[15px] font-medium">You&apos;re on {planLabel(plan)}</h2>
        <p className="mt-1 text-[12px] text-[#8a8ea3]">These are now open on your account.</p>
        <ul className="mt-3 space-y-1 text-[12px] text-[#c9cbd8]">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <Link href="/hub/ai-editor" onClick={markSeen} className="mt-4 flex h-10 items-center justify-center rounded-[8px] bg-[#7c5cff] font-medium text-white">
          Open AI Editor
        </Link>
        <button type="button" onClick={dismiss} className="mt-2 h-10 w-full rounded-[8px] border border-[#1e2130] text-[#b4b7c8]">
          Done
        </button>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id") || "";
  const credits = searchParams.get("credits");
  const [message, setMessage] = useState(sessionId ? "Checking your plan…" : "");

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetch("/api/stripe/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.plan) {
          window.location.replace(`/dashboard?upgraded=${encodeURIComponent(data.plan)}`);
          return;
        }
        if (res.ok && data.topUp) {
          window.location.replace("/dashboard");
          return;
        }
        setMessage(data.error || "Payment is recorded. Your plan will update when the receipt arrives.");
      })
      .catch(() => {
        if (!cancelled) setMessage("Payment is recorded. Your plan will update when the receipt arrives.");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0b14] px-4 text-[13px] text-[#e6e7ee]">
      <div className="w-full max-w-md rounded-[10px] border border-[#1e2130] bg-[#10121c] p-6 text-center">
        <h1 className="text-[16px] font-medium">Payment successful</h1>
        <p className="mt-2 text-[12px] text-[#8a8ea3]">
          {message || (credits ? `${credits} credits were added.` : "Your account is updating.")}
        </p>
        <a href="/dashboard" className="mt-4 inline-flex h-10 items-center justify-center rounded-[8px] bg-[#7c5cff] px-4 font-medium text-white">
          Back to Process
        </a>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0a0b14] text-[13px] text-[#8a8ea3]">Loading…</div>}>
      <SuccessContent />
    </Suspense>
  );
}

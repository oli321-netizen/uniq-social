"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { planCatalog } from "@/lib/plan-catalog";

export default function PlanList() {
  const { status } = useSession();
  const [busy, setBusy] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const plans = planCatalog();

  async function subscribe(planKey: string) {
    setBusy(planKey);
    setError("");
    try {
      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (res.status === 401) {
        window.location.href = `/login?callbackUrl=${encodeURIComponent("/account#plans")}`;
        return;
      }
      setError(data.error || "Could not start checkout.");
    } catch {
      setError("Could not start checkout.");
    } finally {
      setBusy("");
    }
  }

  async function applyCode(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (status !== "authenticated") {
      window.location.href = `/login?callbackUrl=${encodeURIComponent("/account#plans")}`;
      return;
    }
    setBusy("code");
    try {
      const res = await fetch("/api/billing/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "That code is not valid.");
        return;
      }
      window.location.href = `/dashboard?upgraded=${encodeURIComponent(data.plan)}`;
    } catch {
      setError("Could not apply that code.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div id="plans" className="text-[13px] text-[#e6e7ee]">
      <div className="mb-3">
        <h2 className="text-[15px] font-medium">Monthly plans</h2>
        <p className="mt-1 text-[12px] text-[#8a8ea3]">Every paid plan includes the same tools. The monthly credit grant is the difference.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <section key={plan.key} className="rounded-[10px] border border-[#1e2130] bg-[#10121c] p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-medium">{plan.label}</h3>
              <p className="text-[12px] text-[#8a8ea3]">{plan.monthly ? `£${plan.price}/mo` : "£0"}</p>
            </div>
            <ul className="mt-2 space-y-1">
              {plan.features.map((feature) => (
                <li key={feature.label} className="flex gap-2 text-[12px]">
                  <span className={feature.included ? "text-[#c9bcff]" : "text-[#5c6070]"} aria-hidden="true">{feature.included ? "✓" : "–"}</span>
                  <span className={feature.included ? "text-[#c9cbd8]" : "text-[#5c6070]"}>{feature.label}</span>
                </li>
              ))}
            </ul>
            {plan.monthly ? (
              <button type="button" disabled={busy === plan.key} onClick={() => subscribe(plan.key)} className="mt-3 h-9 w-full rounded-[8px] bg-[#7c5cff] text-[13px] font-medium text-white disabled:opacity-40">
                {busy === plan.key ? "Opening checkout…" : "Subscribe"}
              </button>
            ) : (
              <p className="mt-3 text-[12px] text-[#8a8ea3]">Included when you create an account.</p>
            )}
          </section>
        ))}
      </div>
      <form onSubmit={applyCode} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1 text-[12px] text-[#8a8ea3]">
          Have a code?
          <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" className="mt-1 h-9 w-full rounded-[8px] border border-[#1e2130] bg-[#0a0b14] px-3 text-[13px] text-[#e6e7ee] outline-none" />
        </label>
        <button type="submit" disabled={busy === "code" || !code.trim()} className="h-9 rounded-[8px] border border-[#1e2130] px-3 text-[13px] sm:mt-5 disabled:opacity-40">
          Apply
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-red-300">{error}</p>}
      {message && <p className="mt-2 text-[12px] text-[#c9bcff]">{message}</p>}
    </div>
  );
}

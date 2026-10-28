"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Fingerprint, CheckCircle, ArrowRight } from "lucide-react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const credits = searchParams.get("credits") || "0";
  const plan = searchParams.get("plan");

  return (
    <div className="min-h-screen bg-[#0a0b14] flex items-center justify-center px-4">
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />

      <div className="w-full max-w-md relative z-10 text-center">
        <a href="/" className="inline-flex items-center gap-2 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Fingerprint className="h-5 w-5 text-purple-400" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            Uniq<span className="text-purple-400">Social</span>
          </span>
        </a>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm p-8">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-2">Payment successful</h1>
          <p className="text-sm text-slate-400 mb-6">
            {plan
              ? `You're now on the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan. ${credits} credits have been added to your account.`
              : `${credits} credits have been added to your account.`}
          </p>

          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 py-3 px-8 rounded-xl font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-all hover:shadow-lg hover:shadow-purple-500/20"
          >
            Back to Dashboard
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0b14] flex items-center justify-center">
          <div className="text-purple-400">Loading...</div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}

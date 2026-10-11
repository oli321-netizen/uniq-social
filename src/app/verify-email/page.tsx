import { Fingerprint, ArrowRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify Email — Uniq Social",
};

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-[#010313] flex items-center justify-center px-4">
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
          <h1 className="text-2xl font-bold mb-2">Verify your email</h1>
          <p className="text-sm text-slate-400 mb-6">
            Enter the 6-digit code we sent to your email during sign up.
          </p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 py-3 px-8 rounded-xl font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-all hover:shadow-lg hover:shadow-purple-500/20"
          >
            Go to Sign Up
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

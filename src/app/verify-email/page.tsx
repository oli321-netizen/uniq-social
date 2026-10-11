"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Fingerprint, CheckCircle, XCircle, Loader2, ArrowRight, Mail } from "lucide-react";

function VerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "already" | "error">("loading");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("No verification token provided");
      return;
    }

    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setStatus("success");
          setEmail(data.email);
        } else if (data.alreadyVerified) {
          setStatus("already");
          setEmail(data.email);
        } else {
          setStatus("error");
          setError(data.error || "Verification failed");
        }
      })
      .catch(() => {
        setStatus("error");
        setError("Failed to connect to server");
      });
  }, [token]);

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
          {status === "loading" && (
            <>
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
                </div>
              </div>
              <h1 className="text-2xl font-bold mb-2">Verifying your email...</h1>
              <p className="text-sm text-slate-400">Just a moment</p>
            </>
          )}

          {(status === "success" || status === "already") && (
            <>
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
              </div>
              <h1 className="text-2xl font-bold mb-2">
                {status === "already" ? "Already verified" : "Email verified"}
              </h1>
              <p className="text-sm text-slate-400 mb-6">
                {email} is verified. You&apos;re all set.
              </p>
              <a
                href="/login"
                className="inline-flex items-center gap-2 py-3 px-8 rounded-xl font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-all hover:shadow-lg hover:shadow-purple-500/20"
              >
                Sign in
                <ArrowRight className="h-4 w-4" />
              </a>
            </>
          )}

          {status === "error" && (
            <>
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-red-400" />
                </div>
              </div>
              <h1 className="text-2xl font-bold mb-2">Verification failed</h1>
              <p className="text-sm text-slate-400 mb-6">{error}</p>
              <a
                href="/login"
                className="inline-flex items-center gap-2 py-3 px-8 rounded-xl font-medium text-sm bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all"
              >
                Back to login
                <ArrowRight className="h-4 w-4" />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#010313] flex items-center justify-center">
          <div className="text-purple-400">Loading...</div>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}

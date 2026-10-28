"use client";

import { useState } from "react";
import { Fingerprint, Loader2, Mail, ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      setSent(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0b14] flex items-center justify-center px-4">
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Fingerprint className="h-5 w-5 text-purple-400" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              Uniq<span className="text-purple-400">Social</span>
            </span>
          </a>
          <h1 className="text-2xl font-bold mb-2">Reset your password</h1>
          <p className="text-sm text-slate-500">
            {sent
              ? "Check your inbox for the reset link"
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
              </div>
              <p className="text-sm text-slate-400">
                If an account exists with <span className="text-white font-medium">{email}</span>,
                you&apos;ll receive a password reset link shortly.
              </p>
              <a
                href="/login"
                className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors mt-4"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </a>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <div>
                  <label className="text-xs text-slate-500 block mb-2 font-medium">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 placeholder:text-slate-700 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-all flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <a
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-purple-400 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to login
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

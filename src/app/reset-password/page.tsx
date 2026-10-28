"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Fingerprint, Loader2, Lock, CheckCircle, XCircle } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <XCircle className="h-8 w-8 text-red-400" />
          </div>
        </div>
        <p className="text-sm text-slate-400">
          Invalid reset link. Please request a new one.
        </p>
        <a
          href="/forgot-password"
          className="inline-block text-sm text-purple-400 hover:text-purple-300 transition-colors"
        >
          Request new link
        </a>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-400" />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-white">Password updated</h2>
        <p className="text-sm text-slate-400">
          Your password has been reset successfully.
        </p>
        <a
          href="/login"
          className="inline-block mt-2 py-3 px-8 rounded-xl font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-all hover:shadow-lg hover:shadow-purple-500/20"
        >
          Sign In
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="text-xs text-slate-500 block mb-2 font-medium">
          New Password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 placeholder:text-slate-700 transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 block mb-2 font-medium">
          Confirm Password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
          <input
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Type it again"
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
          "Reset Password"
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
          <h1 className="text-2xl font-bold mb-2">Set new password</h1>
          <p className="text-sm text-slate-500">
            Choose a strong password for your account
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm p-8">
          <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef } from "react";
import { signIn } from "next-auth/react";
import { Fingerprint, Loader2, Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      digits.forEach((d, i) => {
        if (index + i < 6) newCode[index + i] = d;
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyCode = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the full 6-digit code");
      return;
    }
    setError("");
    setVerifying(true);

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fullCode, email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid code");
        setVerifying(false);
        return;
      }

      // Code verified — sign them in
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Account is verified but sign-in failed — send them to login
        setShowCodeEntry(false);
        setIsSignUp(false);
        setError("Account verified! Please sign in.");
        setVerifying(false);
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Something went wrong. Try again.");
      setVerifying(false);
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    setError("");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch {}
    setResending(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, referralCode: referralCode.trim() || undefined }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Signup failed");
          setLoading(false);
          return;
        }

        // Show code entry screen
        setShowCodeEntry(true);
        setLoading(false);
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#010313] flex items-center justify-center px-4">
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Fingerprint className="h-5 w-5 text-purple-400" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              Uniq<span className="text-purple-400">Social</span>
            </span>
          </a>
          <h1 className="text-2xl font-bold mb-2">
            {showCodeEntry ? "Enter your code" : isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-slate-500">
            {showCodeEntry
              ? <>Enter the 6-digit code we emailed to <span className="text-white">{email}</span></>
              : isSignUp
              ? "Get 5 free credits to start processing"
              : "Sign in to your dashboard"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm p-8">
          {showCodeEntry ? (
            <div>
              <div className="flex justify-center mb-6">
                <div className="h-14 w-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <ShieldCheck className="h-7 w-7 text-purple-400" />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-5 text-center">
                  {error}
                </div>
              )}

              <div className="flex justify-center gap-2 mb-6">
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                ))}
              </div>

              <button
                onClick={handleVerifyCode}
                disabled={verifying || code.join("").length !== 6}
                className="w-full py-3.5 rounded-xl font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-all flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Verify & Continue
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <div className="mt-5 text-center space-y-2">
                <button
                  onClick={handleResendCode}
                  disabled={resending}
                  className="text-sm text-slate-500 hover:text-purple-400 transition-colors disabled:opacity-50"
                >
                  {resending ? "Sending..." : "Resend code"}
                </button>
                <div>
                  <button
                    onClick={() => {
                      setShowCodeEntry(false);
                      setIsSignUp(false);
                      setCode(["", "", "", "", "", ""]);
                      setError("");
                    }}
                    className="text-sm text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    Back to sign in
                  </button>
                </div>
              </div>
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

            <div>
              <label className="text-xs text-slate-500 block mb-2 font-medium">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignUp ? "At least 6 characters" : "Your password"}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 placeholder:text-slate-700 transition-colors"
                />
              </div>
            </div>

            {isSignUp && (
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Referral Code (optional)</label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 placeholder:text-slate-700 transition-colors font-mono tracking-wider"
                />
              </div>
            )}

            {!isSignUp && (
              <div className="flex justify-end -mt-1">
                <a
                  href="/forgot-password"
                  className="text-xs text-slate-500 hover:text-purple-400 transition-colors"
                >
                  Forgot password?
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-all flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {isSignUp ? "Create Account" : "Sign In"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              className="text-sm text-slate-500 hover:text-purple-400 transition-colors"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Sign up"}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

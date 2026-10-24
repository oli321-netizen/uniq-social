"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Fingerprint, Loader2, Mail, Lock, ArrowRight, ShieldCheck, Gift, X, Users, Sparkles } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#010313] flex items-center justify-center"><Loader2 className="h-8 w-8 text-purple-400 animate-spin" /></div>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteEmail = searchParams.get("email") || "";
  const inviteId = searchParams.get("invite") || "";
  const startAsSignUp = searchParams.get("signup") === "true";
  const isInviteFlow = !!(inviteEmail && inviteId);
  const redirectingRef = useRef(false);

  const [isSignUp, setIsSignUp] = useState(startAsSignUp || isInviteFlow);
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [showReferralPopup, setShowReferralPopup] = useState(false);
  const [referralBonus, setReferralBonus] = useState({ credits: 0, referrer: "" });
  const [showPromoPopup, setShowPromoPopup] = useState(false);
  const [promoBonus, setPromoBonus] = useState(0);
  const [showInviteSuccess, setShowInviteSuccess] = useState(false);
  const [inviteTeamName, setInviteTeamName] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Set email from invite params on mount
  useEffect(() => {
    if (inviteEmail) setEmail(inviteEmail);
    if (startAsSignUp || isInviteFlow) setIsSignUp(true);
  }, [inviteEmail, startAsSignUp, isInviteFlow]);

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

      // Code verified — sign them in (with timeout)
      const signInPromise2 = signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      const timeoutPromise2 = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 15000)
      );
      const result = await Promise.race([signInPromise2, timeoutPromise2]);

      if (!result?.ok || result?.error) {
        // Account is verified but sign-in failed — send them to login
        setShowCodeEntry(false);
        setIsSignUp(false);
        setError("Account verified! Please sign in.");
        setVerifying(false);
        return;
      }

      // Show invite success popup if they joined via invite
      if (data.inviteAccepted && data.teamName) {
        setInviteTeamName(data.teamName);
        setShowInviteSuccess(true);
        setVerifying(false);
        return;
      }

      // Show promo code popup if they used a promo code
      if (data.promoApplied && data.promoCredits > 0) {
        setPromoBonus(data.promoCredits);
        setShowPromoPopup(true);
        setVerifying(false);
        return;
      }

      // Show referral welcome popup if they used a referral code
      if (data.referralApplied && data.bonusCredits > 0) {
        setReferralBonus({ credits: data.bonusCredits, referrer: data.referrerEmail || "a friend" });
        setShowReferralPopup(true);
        setVerifying(false);
        return;
      }

      redirectingRef.current = true;
      setVerifying(false);
      router.push("/dashboard");
      setTimeout(() => {
        if (redirectingRef.current) {
          window.location.href = "/dashboard";
        }
      }, 3000);
    } catch (err) {
      if (err instanceof Error && err.message === "timeout") {
        setError("Connection is slow. Please try again.");
      } else {
        setError("Something went wrong. Try again.");
      }
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
          body: JSON.stringify({
            email,
            password,
            referralCode: referralCode.trim() || undefined,
            promoCode: promoCode.trim() || undefined,
            inviteId: inviteId || undefined,
          }),
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

      // Wrap signIn in a timeout so it doesn't hang forever on cold starts
      const signInPromise = signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 15000)
      );
      const result = await Promise.race([signInPromise, timeoutPromise]);

      if (!result?.ok || result?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      // Navigate to dashboard
      redirectingRef.current = true;
      router.push("/dashboard");
      // Fallback: full reload if client-side nav doesn't work within 3s
      setTimeout(() => {
        if (redirectingRef.current) {
          window.location.href = "/dashboard";
        }
      }, 3000);
    } catch (err) {
      if (err instanceof Error && err.message === "timeout") {
        setError("Connection is slow. Please try again.");
      } else {
        setError("Something went wrong. Try again.");
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#010313] flex items-center justify-center px-4">
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />

      {/* Referral welcome popup */}
      {showReferralPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-purple-500/20 bg-[#0a0a1a] p-8 text-center shadow-2xl shadow-purple-500/10 relative">
            <button
              onClick={() => { setShowReferralPopup(false); router.push("/dashboard"); }}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/10 border border-purple-500/20">
              <Gift className="h-8 w-8 text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Welcome Bonus!</h2>
            <p className="text-slate-400 text-sm mb-4">
              You were referred by <span className="text-purple-400 font-medium">{referralBonus.referrer}</span>
            </p>
            <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 py-4 px-6 mb-6">
              <p className="text-3xl font-bold text-purple-400">+{referralBonus.credits}</p>
              <p className="text-xs text-slate-500 mt-1">free credits added to your account</p>
            </div>
            <button
              onClick={() => { router.push("/dashboard"); }}
              className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-6 text-sm transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Promo code popup */}
      {showPromoPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-purple-500/20 bg-[#0a0a1a] p-8 text-center shadow-2xl shadow-purple-500/10 relative">
            <button
              onClick={() => { setShowPromoPopup(false); router.push("/dashboard"); }}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/10 border border-purple-500/20">
              <Sparkles className="h-8 w-8 text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Promo Code Applied!</h2>
            <p className="text-slate-400 text-sm mb-4">
              Your promo code has been redeemed successfully
            </p>
            <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 py-4 px-6 mb-6">
              <p className="text-3xl font-bold text-purple-400">+{promoBonus}</p>
              <p className="text-xs text-slate-500 mt-1">free credits added to your account</p>
            </div>
            <button
              onClick={() => { router.push("/dashboard"); }}
              className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-6 text-sm transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Invite accepted popup */}
      {showInviteSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-purple-500/20 bg-[#0a0a1a] p-8 text-center shadow-2xl shadow-purple-500/10 relative">
            <button
              onClick={() => { setShowInviteSuccess(false); router.push("/dashboard"); }}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20">
              <Users className="h-8 w-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">You&apos;re on the team!</h2>
            <p className="text-slate-400 text-sm mb-6">
              You&apos;ve successfully joined <span className="text-purple-400 font-medium">{inviteTeamName}</span>
            </p>
            <button
              onClick={() => { router.push("/dashboard"); }}
              className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-6 text-sm transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

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
            {showCodeEntry ? "Enter your code" : isInviteFlow ? "Set up your account" : isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-slate-500">
            {showCodeEntry
              ? <>Enter the 6-digit code we emailed to <span className="text-white">{email}</span></>
              : isInviteFlow
              ? "Just set a password to get started"
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
                  readOnly={isInviteFlow}
                  placeholder="you@example.com"
                  className={`w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 placeholder:text-slate-700 transition-colors ${isInviteFlow ? "opacity-60 cursor-not-allowed" : ""}`}
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

            {isSignUp && !isInviteFlow && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1.5">Promo Code (optional)</label>
                  <div className="relative">
                    <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="Enter promo code"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 placeholder:text-slate-700 transition-colors font-mono tracking-wider"
                    />
                  </div>
                </div>
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

          {!isInviteFlow && (
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
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

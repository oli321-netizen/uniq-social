"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Fingerprint,
  ArrowLeft,
  Mail,
  Zap,
  Calendar,
  LogOut,
  Loader2,
  ShoppingCart,
  Plus,
  X,
  CreditCard,
  User,
  Shield,
  Gift,
  Check,
  Sparkles,
  Crown,
  Rocket,
  Building2,
  Star,
} from "lucide-react";

const TOP_UP_PACKS = [
  { credits: 20, price: "5.20" },
  { credits: 50, price: "13" },
  { credits: 100, price: "26" },
  { credits: 250, price: "65" },
  { credits: 500, price: "130" },
  { credits: 1000, price: "260" },
];

type PlanName = "free" | "starter" | "growth" | "pro" | "business" | "agency";

const PLAN_CONFIG: Record<
  PlanName,
  {
    label: string;
    credits: number;
    price: string;
    color: string;
    gradient: string;
    icon: React.ReactNode;
    tagline: string;
    perks: string[];
  }
> = {
  free: {
    label: "Free",
    credits: 5,
    price: "0",
    color: "text-slate-400",
    gradient: "from-slate-500 to-slate-600",
    icon: <User className="h-8 w-8" />,
    tagline: "Getting started",
    perks: ["5 free credits", "Basic processing"],
  },
  starter: {
    label: "Starter",
    credits: 100,
    price: "24",
    color: "text-blue-400",
    gradient: "from-blue-500 to-blue-600",
    icon: <Rocket className="h-8 w-8" />,
    tagline: "Ready for takeoff",
    perks: ["100 credits", "24p per credit", "All processing features"],
  },
  growth: {
    label: "Growth",
    credits: 500,
    price: "75",
    color: "text-emerald-400",
    gradient: "from-emerald-500 to-emerald-600",
    icon: <Sparkles className="h-8 w-8" />,
    tagline: "Scaling up",
    perks: ["500 credits", "15p per credit", "Priority processing"],
  },
  pro: {
    label: "Pro",
    credits: 1500,
    price: "150",
    color: "text-purple-400",
    gradient: "from-purple-500 to-purple-600",
    icon: <Star className="h-8 w-8" />,
    tagline: "Professional grade",
    perks: ["1,500 credits", "10p per credit", "Fast processing"],
  },
  business: {
    label: "Business",
    credits: 5000,
    price: "350",
    color: "text-amber-400",
    gradient: "from-amber-500 to-amber-600",
    icon: <Building2 className="h-8 w-8" />,
    tagline: "Built for scale",
    perks: ["5,000 credits", "7p per credit", "Bulk processing"],
  },
  agency: {
    label: "Agency",
    credits: 15000,
    price: "750",
    color: "text-rose-400",
    gradient: "from-rose-500 via-pink-500 to-purple-500",
    icon: <Crown className="h-8 w-8" />,
    tagline: "Maximum power unlocked",
    perks: ["15,000 credits", "5p per credit", "Unlimited potential"],
  },
};

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [credits, setCredits] = useState(0);
  const [plan, setPlan] = useState<PlanName>("free");
  const [showTopUp, setShowTopUp] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);

  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoSuccess, setPromoSuccess] = useState<{
    plan: PlanName;
    creditsAdded: number;
  } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/credits")
        .then((r) => r.json())
        .then((d) => {
          setCredits(d.credits ?? 0);
          if (d.plan) setPlan(d.plan);
          setHasSubscription(!!d.hasSubscription);
        })
        .catch(() => {});
    }
  }, [status]);

  const handleRedeemCode = async () => {
    if (!promoCode.trim()) return;
    setPromoError("");
    setPromoLoading(true);

    try {
      const res = await fetch("/api/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.error || "Failed to redeem code");
        setPromoLoading(false);
        return;
      }

      // Success — show upgrade popup
      setPlan(data.plan);
      setCredits((prev) => prev + data.creditsAdded);
      setPromoCode("");
      setPromoSuccess({ plan: data.plan, creditsAdded: data.creditsAdded });
    } catch {
      setPromoError("Something went wrong. Try again.");
    } finally {
      setPromoLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#010313] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  const currentPlan = PLAN_CONFIG[plan];

  return (
    <div className="min-h-screen bg-[#010313]">
      {/* Top bar */}
      <header className="border-b border-white/5 bg-[#010313]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Fingerprint className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <span className="text-sm font-semibold tracking-tight">
                Uniq<span className="text-purple-400">Social</span>
              </span>
            </a>
            <span className="text-xs text-slate-600">Account</span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/dashboard"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-bold mb-8">Account Settings</h1>

        {/* Profile */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <User className="h-4 w-4 text-purple-400" />
            Profile
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="text-sm text-white">{session.user?.email}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Member since</p>
                  <p className="text-sm text-white">October 2026</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Credits & Plan */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-purple-400" />
            Credits & Plan
          </h2>
          <div className="flex items-center justify-between py-3 border-b border-white/5">
            <div className="flex items-center gap-3">
              <Zap className="h-4 w-4 text-purple-400" />
              <div>
                <p className="text-xs text-slate-500">Available credits</p>
                <p className="text-sm font-semibold text-white">
                  {credits.toLocaleString()} credits
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowTopUp(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-all"
            >
              <Plus className="h-3 w-3" />
              Top Up
            </button>
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className={currentPlan.color}>
                {plan === "free" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Crown className="h-4 w-4" />
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">Current plan</p>
                <p className={`text-sm font-semibold ${currentPlan.color}`}>
                  {currentPlan.label}
                </p>
              </div>
            </div>
            {hasSubscription ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/stripe/portal", {
                      method: "POST",
                    });
                    const data = await res.json();
                    if (data.url) window.location.href = data.url;
                  } catch {
                    alert("Failed to open billing portal");
                  }
                }}
                className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
              >
                Manage →
              </button>
            ) : plan === "free" ? (
              <button
                type="button"
                onClick={() => (window.location.href = "/#pricing")}
                className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
              >
                Upgrade →
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Are you sure you want to cancel your plan? You\'ll be downgraded to Free but keep your remaining credits.")) return;
                  try {
                    const res = await fetch("/api/account/cancel", { method: "POST" });
                    const data = await res.json();
                    if (data.success) {
                      setPlan("free");
                      alert("Plan cancelled. You\'re now on the Free plan.");
                    } else {
                      alert(data.error || "Failed to cancel plan");
                    }
                  } catch {
                    alert("Something went wrong");
                  }
                }}
                className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
              >
                Cancel Plan
              </button>
            )}
          </div>
        </div>

        {/* Redeem Code */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Gift className="h-4 w-4 text-purple-400" />
            Redeem Code
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Got a promo code? Enter it below to unlock your upgrade.
          </p>

          {promoError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-4">
              {promoError}
            </div>
          )}

          <div className="flex gap-3">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleRedeemCode()}
              placeholder="Enter code"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm uppercase tracking-widest font-mono focus:outline-none focus:border-purple-500/50 placeholder:text-slate-700 placeholder:tracking-normal placeholder:font-sans transition-colors"
            />
            <button
              onClick={handleRedeemCode}
              disabled={promoLoading || !promoCode.trim()}
              className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {promoLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Gift className="h-4 w-4" />
                  Redeem
                </>
              )}
            </button>
          </div>
        </div>

        {/* Security */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-purple-400" />
            Security
          </h2>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm text-white">Password</p>
              <p className="text-xs text-slate-500">Last changed: never</p>
            </div>
            <button className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors">
              Change password
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.02] p-6">
          <h2 className="text-sm font-semibold mb-4 text-red-400">
            Danger Zone
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Sign out</p>
              <p className="text-xs text-slate-500">
                Sign out of your account on this device
              </p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/20 transition-all"
            >
              <LogOut className="h-3 w-3" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Top-up modal */}
      {showTopUp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#010313] p-8 relative">
            <button
              onClick={() => setShowTopUp(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                <ShoppingCart className="h-6 w-6 text-purple-400" />
              </div>
              <h2 className="text-xl font-bold">Top Up Credits</h2>
              <p className="text-sm text-slate-500 mt-1">
                Buy extra credits without changing your plan
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {TOP_UP_PACKS.map((pack) => (
                <button
                  type="button"
                  key={pack.credits}
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const res = await fetch("/api/stripe/checkout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ credits: pack.credits }),
                      });
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else {
                        alert(data.error || "Failed to start checkout");
                      }
                    } catch {
                      alert("Failed to connect to payment service");
                    }
                  }}
                  className="group p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-purple-500/30 hover:bg-purple-500/[0.03] transition-all text-left cursor-pointer"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-lg font-bold text-white">
                      {pack.credits.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-500">26p/ea</span>
                  </div>
                  <div className="text-xs text-slate-500 mb-3">credits</div>
                  <div className="text-sm font-semibold text-purple-400">
                    £{pack.price}
                  </div>
                </button>
              ))}
            </div>

            <p className="text-[11px] text-slate-600 text-center mb-4">
              All top-ups at 26p per credit. Save more with a plan — from
              5p/credit on higher tiers.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowTopUp(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all"
              >
                Cancel
              </button>
              <a
                href="/#pricing"
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white text-center transition-all hover:shadow-lg hover:shadow-purple-500/20"
              >
                View Plans
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade success popup */}
      {promoSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md relative">
            {/* Glow effect behind card */}
            <div
              className={`absolute -inset-1 rounded-3xl bg-gradient-to-r ${PLAN_CONFIG[promoSuccess.plan].gradient} opacity-20 blur-xl`}
            />

            <div className="relative rounded-2xl border border-white/10 bg-[#010313] p-8 overflow-hidden">
              {/* Animated background particles */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-4 left-8 w-2 h-2 rounded-full bg-white/20 animate-pulse" />
                <div
                  className="absolute top-12 right-12 w-1.5 h-1.5 rounded-full bg-white/15 animate-pulse"
                  style={{ animationDelay: "0.5s" }}
                />
                <div
                  className="absolute bottom-16 left-16 w-1 h-1 rounded-full bg-white/10 animate-pulse"
                  style={{ animationDelay: "1s" }}
                />
                <div
                  className="absolute top-20 left-1/2 w-2 h-2 rounded-full bg-white/10 animate-pulse"
                  style={{ animationDelay: "0.3s" }}
                />
                <div
                  className="absolute bottom-8 right-8 w-1.5 h-1.5 rounded-full bg-white/15 animate-pulse"
                  style={{ animationDelay: "0.7s" }}
                />
              </div>

              <div className="relative text-center">
                {/* Plan icon */}
                <div
                  className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${PLAN_CONFIG[promoSuccess.plan].gradient} shadow-lg`}
                >
                  <div className="text-white">
                    {PLAN_CONFIG[promoSuccess.plan].icon}
                  </div>
                </div>

                {/* Checkmark badge */}
                <div className="absolute top-14 left-1/2 translate-x-4 -translate-y-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 border-2 border-[#010313] shadow-lg">
                  <Check className="h-4 w-4 text-white" />
                </div>

                <h2 className="text-2xl font-bold mb-1 mt-2">
                  Welcome to{" "}
                  <span className={PLAN_CONFIG[promoSuccess.plan].color}>
                    {PLAN_CONFIG[promoSuccess.plan].label}
                  </span>
                </h2>
                <p className="text-sm text-slate-400 mb-6">
                  {PLAN_CONFIG[promoSuccess.plan].tagline}
                </p>

                {/* Credits added */}
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-5">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Zap className="h-5 w-5 text-purple-400" />
                    <span className="text-2xl font-bold text-white">
                      +{promoSuccess.creditsAdded.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">credits added to your account</p>
                </div>

                {/* Plan perks */}
                <div className="space-y-2 mb-6">
                  {PLAN_CONFIG[promoSuccess.plan].perks.map((perk, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm text-slate-300"
                    >
                      <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
                      {perk}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setPromoSuccess(null)}
                  className={`w-full py-3.5 rounded-xl font-medium text-sm bg-gradient-to-r ${PLAN_CONFIG[promoSuccess.plan].gradient} text-white transition-all hover:shadow-lg hover:brightness-110`}
                >
                  Let&apos;s Go
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

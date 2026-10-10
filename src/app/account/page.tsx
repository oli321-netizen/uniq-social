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
} from "lucide-react";

const TOP_UP_PACKS = [
  { credits: 20, price: "5.20" },
  { credits: 50, price: "13" },
  { credits: 100, price: "26" },
  { credits: 250, price: "65" },
  { credits: 500, price: "130" },
  { credits: 1000, price: "260" },
];

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [credits, setCredits] = useState(0);
  const [showTopUp, setShowTopUp] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/credits")
        .then((r) => r.json())
        .then((d) => setCredits(d.credits ?? 0))
        .catch(() => {});
    }
  }, [status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#010313] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (!session) return null;

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
                <p className="text-sm font-semibold text-white">{credits} credits</p>
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
            <div>
              <p className="text-xs text-slate-500">Current plan</p>
              <p className="text-sm text-white">Free</p>
            </div>
            <a
              href="/#pricing"
              className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
            >
              Upgrade →
            </a>
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
          <h2 className="text-sm font-semibold mb-4 text-red-400">Danger Zone</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Sign out</p>
              <p className="text-xs text-slate-500">Sign out of your account on this device</p>
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
                  key={pack.credits}
                  className="group p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-purple-500/30 hover:bg-purple-500/[0.03] transition-all text-left"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-lg font-bold text-white">{pack.credits.toLocaleString()}</span>
                    <span className="text-xs text-slate-500">26p/ea</span>
                  </div>
                  <div className="text-xs text-slate-500 mb-3">credits</div>
                  <div className="text-sm font-semibold text-purple-400">£{pack.price}</div>
                </button>
              ))}
            </div>

            <p className="text-[11px] text-slate-600 text-center mb-4">
              All top-ups at 26p per credit. Save more with a plan — from 5p/credit on higher tiers.
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
    </div>
  );
}

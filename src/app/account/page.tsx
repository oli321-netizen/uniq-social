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
  Sun,
  Moon,
  Trash2,
  AlertTriangle,
  Lock,
  Key,
  Copy,
  Users,
  UserPlus,
  UserMinus,
  Send,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/Toast";

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
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();
  const [credits, setCredits] = useState(0);
  const [plan, setPlan] = useState<PlanName>("free");
  const [showTopUp, setShowTopUp] = useState(false);

  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoSuccess, setPromoSuccess] = useState<{
    creditsAdded: number;
  } | null>(null);

  // Change password state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // API keys state
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; key: string; lastUsed: string | null; createdAt: string }[]>([]);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [keyLoading, setKeyLoading] = useState(false);

  // Team state
  const [team, setTeam] = useState<{ id: string; name: string; credits: number; ownerId: string; members: { id: string; email: string; teamRole: string | null; credits: number }[]; invites: { id: string; email: string }[] } | null>(null);
  const [teamRole, setTeamRole] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<{ id: string; team: { id: string; name: string; credits: number; _count: { members: number } } }[]>([]);
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [teamCreditsToAdd, setTeamCreditsToAdd] = useState("");
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
        })
        .catch(() => {});
    }
  }, [status]);

  // Load API keys
  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/keys")
        .then((r) => r.json())
        .then((d) => { if (d.keys) setApiKeys(d.keys); })
        .catch(() => {});
    }
  }, [status]);

  // Load team info and pending invites
  const loadTeamData = () => {
    fetch("/api/team").then((r) => r.json()).then((d) => {
      setTeam(d.team);
      setTeamRole(d.role || null);
    }).catch(() => {});
    fetch("/api/team/invites").then((r) => r.json()).then((d) => {
      if (d.invites) setPendingInvites(d.invites);
    }).catch(() => {});
  };

  useEffect(() => {
    if (status === "authenticated") loadTeamData();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setCredits((prev) => prev + data.creditsAdded);
      setPromoCode("");
      setPromoSuccess({ creditsAdded: data.creditsAdded });
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
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-6">
            <a href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Fingerprint className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <span className="text-sm font-semibold tracking-tight hidden sm:inline">
                Uniq<span className="text-purple-400">Social</span>
              </span>
            </a>
            <span className="text-xs text-slate-600 hidden sm:inline">Account</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="text-slate-500 hover:text-white transition-colors"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
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

      <div className="mx-auto max-w-2xl px-3 sm:px-6 py-6 sm:py-10">
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
            {plan === "free" ? (
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
                  try {
                    const res = await fetch("/api/stripe/portal", {
                      method: "POST",
                    });
                    const data = await res.json();
                    if (data.url) window.location.href = data.url;
                  } catch {
                    addToast("Failed to open billing portal", "error");
                  }
                }}
                className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
              >
                Manage →
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
            <button
              onClick={() => setShowChangePassword(true)}
              className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
            >
              Change password
            </button>
          </div>
        </div>

        {/* API Keys */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Key className="h-4 w-4 text-purple-400" />
              API Keys
            </h2>
            <button
              onClick={() => setShowNewKey(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
            >
              <Plus className="h-3 w-3" />
              New Key
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Use API keys to access video processing programmatically. Send requests with the header: <code className="text-purple-300 bg-purple-500/10 px-1 py-0.5 rounded">Authorization: Bearer your_key</code>
          </p>

          {/* New key form */}
          {showNewKey && !newKeyValue && (
            <div className="mb-4 p-4 rounded-xl border border-purple-500/20 bg-purple-500/[0.03]">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g. Production)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50 placeholder:text-slate-700"
                />
                <button
                  onClick={async () => {
                    if (!newKeyName.trim()) return;
                    setKeyLoading(true);
                    try {
                      const res = await fetch("/api/keys", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: newKeyName.trim() }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        addToast(data.error || "Failed to create key", "error");
                      } else {
                        setNewKeyValue(data.key);
                        addToast("API key created — copy it now, it won't be shown again", "success", 6000);
                      }
                    } catch {
                      addToast("Failed to create key", "error");
                    }
                    setKeyLoading(false);
                  }}
                  disabled={keyLoading || !newKeyName.trim()}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {keyLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                </button>
                <button
                  onClick={() => { setShowNewKey(false); setNewKeyName(""); }}
                  className="px-2 py-2 text-slate-500 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Show newly created key */}
          {newKeyValue && (
            <div className="mb-4 p-4 rounded-xl border border-green-500/20 bg-green-500/[0.03]">
              <p className="text-xs text-green-400 font-medium mb-2">
                Copy your API key now — it won&apos;t be shown again
              </p>
              <div className="flex gap-2">
                <code className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono break-all select-all">
                  {newKeyValue}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(newKeyValue);
                    addToast("API key copied to clipboard", "success");
                  }}
                  className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs border border-white/10 transition-all"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                onClick={() => {
                  setNewKeyValue("");
                  setShowNewKey(false);
                  setNewKeyName("");
                  // Refresh keys list
                  fetch("/api/keys").then((r) => r.json()).then((d) => { if (d.keys) setApiKeys(d.keys); }).catch(() => {});
                }}
                className="mt-3 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Keys list */}
          {apiKeys.length > 0 ? (
            <div className="space-y-2">
              {apiKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.01]">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{k.name}</p>
                    <p className="text-xs text-slate-600 font-mono">{k.key}</p>
                    {k.lastUsed && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        Last used: {new Date(k.lastUsed).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await fetch("/api/keys", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: k.id }),
                        });
                        setApiKeys((prev) => prev.filter((key) => key.id !== k.id));
                        addToast("API key revoked", "info");
                      } catch {
                        addToast("Failed to revoke key", "error");
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors shrink-0 ml-3"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : !showNewKey && (
            <p className="text-xs text-slate-600 text-center py-4">
              No API keys yet. Create one to use the API.
            </p>
          )}
        </div>

        {/* Team */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-6 mb-6">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-purple-400" />
            Team
          </h2>

          {/* Pending invites for this user */}
          {pendingInvites.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-xs text-purple-400 font-medium uppercase tracking-wider">Pending Invitations</p>
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-xl bg-purple-500/5 border border-purple-500/10 p-3">
                  <div>
                    <p className="text-sm text-white font-medium">{inv.team.name}</p>
                    <p className="text-xs text-slate-500">{inv.team._count.members} member{inv.team._count.members !== 1 ? "s" : ""} &middot; {inv.team.credits} team credits</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept", inviteId: inv.id }) });
                        const data = await res.json();
                        if (res.ok) { addToast("Joined team!", "success"); loadTeamData(); }
                        else addToast(data.error || "Failed", "error");
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={async () => {
                        const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decline", inviteId: inv.id }) });
                        if (res.ok) { addToast("Invite declined", "info"); loadTeamData(); }
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!team ? (
            /* Create team */
            <div>
              <p className="text-xs text-slate-500 mb-3">Create a team to share a credit pool with your colleagues.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Team name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50"
                />
                <button
                  onClick={async () => {
                    if (!teamName.trim()) return;
                    setTeamLoading(true);
                    setTeamError("");
                    const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", name: teamName.trim() }) });
                    const data = await res.json();
                    setTeamLoading(false);
                    if (res.ok) { addToast("Team created!", "success"); setTeamName(""); loadTeamData(); }
                    else setTeamError(data.error || "Failed to create team");
                  }}
                  disabled={teamLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {teamLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create
                </button>
              </div>
              {teamError && <p className="mt-2 text-xs text-red-400">{teamError}</p>}
            </div>
          ) : (
            /* Team management */
            <div className="space-y-4">
              {/* Team header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{team.name}</p>
                  <p className="text-xs text-slate-500">{teamRole === "owner" ? "Owner" : "Member"} &middot; {team.members.length} member{team.members.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-purple-400 font-semibold">{team.credits}</p>
                  <p className="text-xs text-slate-500">team credits</p>
                </div>
              </div>

              {/* Add credits to team pool (owner only) */}
              {teamRole === "owner" && (
                <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                  <p className="text-xs text-slate-400 mb-2">Transfer your credits to the team pool</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Amount"
                      value={teamCreditsToAdd}
                      onChange={(e) => setTeamCreditsToAdd(e.target.value.replace(/^0+(?=\d)/, ""))}
                      min="1"
                      className="w-24 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50"
                    />
                    <button
                      onClick={async () => {
                        const amt = parseInt(teamCreditsToAdd);
                        if (!amt || amt <= 0) return;
                        const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add-credits", credits: amt }) });
                        const data = await res.json();
                        if (res.ok) {
                          addToast(`${amt} credits added to team pool`, "success");
                          setTeamCreditsToAdd("");
                          loadTeamData();
                          // Refresh personal credits
                          fetch("/api/credits").then((r) => r.json()).then((d) => { setCredits(d.credits ?? 0); }).catch(() => {});
                        } else addToast(data.error || "Failed", "error");
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                    >
                      Transfer
                    </button>
                  </div>
                </div>
              )}

              {/* Members list */}
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2">Members</p>
                <div className="space-y-1.5">
                  {team.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                          <span className="text-xs text-purple-400 font-medium">{m.email[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-sm text-white">{m.email}</p>
                          <p className="text-xs text-slate-500">{m.teamRole === "owner" ? "Owner" : "Member"} &middot; {m.credits} personal credits</p>
                        </div>
                      </div>
                      {teamRole === "owner" && m.teamRole !== "owner" && (
                        <button
                          onClick={async () => {
                            const res = await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove-member", memberId: m.id }) });
                            if (res.ok) { addToast("Member removed", "info"); loadTeamData(); }
                            else { const d = await res.json(); addToast(d.error || "Failed", "error"); }
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                          title="Remove member"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending invites */}
              {teamRole === "owner" && team.invites.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-2">Pending Invites</p>
                  <div className="space-y-1.5">
                    {team.invites.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Send className="h-3.5 w-3.5 text-slate-500" />
                          <p className="text-sm text-slate-400">{inv.email}</p>
                        </div>
                        <button
                          onClick={async () => {
                            const res = await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel-invite", inviteId: inv.id }) });
                            if (res.ok) { addToast("Invite cancelled", "info"); loadTeamData(); }
                          }}
                          className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invite member (owner only) */}
              {teamRole === "owner" && (
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Invite by email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50"
                  />
                  <button
                    onClick={async () => {
                      if (!inviteEmail.trim()) return;
                      setTeamLoading(true);
                      const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", email: inviteEmail.trim() }) });
                      const data = await res.json();
                      setTeamLoading(false);
                      if (res.ok) { addToast("Invite sent!", "success"); setInviteEmail(""); loadTeamData(); }
                      else addToast(data.error || "Failed to send invite", "error");
                    }}
                    disabled={teamLoading}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {teamLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Invite
                  </button>
                </div>
              )}

              {/* Leave / Disband */}
              <div className="pt-2 border-t border-white/5">
                {teamRole === "owner" ? (
                  <button
                    onClick={async () => {
                      if (!confirm("Disband this team? Team credits will be returned to you.")) return;
                      const res = await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disband" }) });
                      if (res.ok) {
                        addToast("Team disbanded. Credits returned.", "info");
                        loadTeamData();
                        fetch("/api/credits").then((r) => r.json()).then((d) => { setCredits(d.credits ?? 0); }).catch(() => {});
                      } else { const d = await res.json(); addToast(d.error || "Failed", "error"); }
                    }}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Disband team
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (!confirm("Leave this team?")) return;
                      const res = await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave" }) });
                      if (res.ok) { addToast("You left the team", "info"); loadTeamData(); }
                      else { const d = await res.json(); addToast(d.error || "Failed", "error"); }
                    }}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Leave team
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.02] p-6">
          <h2 className="text-sm font-semibold mb-4 text-red-400">
            Danger Zone
          </h2>
          <div className="space-y-4">
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
            <div className="border-t border-red-500/10 pt-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Delete account</p>
                <p className="text-xs text-slate-500">
                  Permanently delete your account and all data
                </p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/20 transition-all"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
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
                        addToast(data.error || "Failed to start checkout", "error");
                      }
                    } catch {
                      addToast("Failed to connect to payment service", "error");
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

      {/* Promo success popup */}
      {promoSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-purple-500/20 bg-[#0a0a1a] p-8 text-center shadow-2xl shadow-purple-500/10 relative">
            <button
              onClick={() => setPromoSuccess(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20">
              <Check className="h-8 w-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Code Redeemed!</h2>
            <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 py-4 px-6 mb-6">
              <p className="text-3xl font-bold text-purple-400">+{promoSuccess.creditsAdded.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">credits added to your account</p>
            </div>
            <button
              onClick={() => setPromoSuccess(null)}
              className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-6 text-sm transition-colors"
            >
              Nice!
            </button>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {showChangePassword && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#010313] p-8 relative">
            <button
              onClick={() => { setShowChangePassword(false); setPasswordError(""); setPasswordSuccess(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                <Shield className="h-6 w-6 text-purple-400" />
              </div>
              <h2 className="text-xl font-bold">Change Password</h2>
            </div>

            {passwordSuccess ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20">
                  <Check className="h-7 w-7 text-green-400" />
                </div>
                <p className="text-sm text-slate-300 mb-6">Password updated successfully.</p>
                <button
                  onClick={() => { setShowChangePassword(false); setPasswordSuccess(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}
                  className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-all"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {passwordError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    {passwordError}
                  </div>
                )}

                <div>
                  <label className="text-xs text-slate-500 block mb-1.5 font-medium">Current password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 block mb-1.5 font-medium">New password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 placeholder:text-slate-700 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 block mb-1.5 font-medium">Confirm new password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>

                <button
                  onClick={async () => {
                    setPasswordError("");
                    if (!currentPassword || !newPassword || !confirmPassword) {
                      setPasswordError("All fields are required");
                      return;
                    }
                    if (newPassword.length < 6) {
                      setPasswordError("New password must be at least 6 characters");
                      return;
                    }
                    if (newPassword !== confirmPassword) {
                      setPasswordError("Passwords don't match");
                      return;
                    }
                    setPasswordLoading(true);
                    try {
                      const res = await fetch("/api/auth/change-password", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ currentPassword, newPassword }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setPasswordError(data.error || "Failed to change password");
                      } else {
                        setPasswordSuccess(true);
                      }
                    } catch {
                      setPasswordError("Something went wrong. Try again.");
                    } finally {
                      setPasswordLoading(false);
                    }
                  }}
                  disabled={passwordLoading}
                  className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {passwordLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Update Password"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete account confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-red-500/20 bg-[#010313] p-6 sm:p-8 relative">
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeletePassword("");
                setDeleteError("");
              }}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <h2 className="text-xl font-bold">Delete Account</h2>
              <p className="text-sm text-slate-500 mt-2">
                This will permanently delete your account, all your data, and cancel any active subscription. This action cannot be undone.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-4">
                {deleteError}
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs text-slate-500 block mb-2 font-medium">
                Enter your password to confirm
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
                <input
                  type="password"
                  required
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-red-500/50 placeholder:text-slate-700 transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword("");
                  setDeleteError("");
                }}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-medium border border-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!deletePassword) {
                    setDeleteError("Password is required");
                    return;
                  }
                  setDeleteLoading(true);
                  setDeleteError("");
                  try {
                    const res = await fetch("/api/account/delete", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ password: deletePassword }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setDeleteError(data.error || "Failed to delete account");
                      setDeleteLoading(false);
                      return;
                    }
                    // Sign out and redirect
                    signOut({ callbackUrl: "/login" });
                  } catch {
                    setDeleteError("Something went wrong. Try again.");
                    setDeleteLoading(false);
                  }
                }}
                disabled={deleteLoading || !deletePassword}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleteLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Forever
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

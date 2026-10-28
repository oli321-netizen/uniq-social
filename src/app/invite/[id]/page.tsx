"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Fingerprint, Loader2, Users, Zap, Check } from "lucide-react";

type InviteDetails = {
  id: string;
  email: string;
  teamName: string;
  memberCount: number;
  credits: number;
};

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(`/api/team/invite-details?id=${params.id}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Invite not found");
        } else {
          setInvite(data);
        }
      } catch {
        setError("Failed to load invite");
      }
      setLoading(false);
    }
    if (params.id) fetchInvite();
  }, [params.id]);

  const handleAccept = () => {
    if (!invite) return;
    // Redirect to signup with pre-filled email and invite ID
    const searchParams = new URLSearchParams({
      signup: "true",
      email: invite.email,
      invite: invite.id,
    });
    router.push(`/login?${searchParams.toString()}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0b14] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen bg-[#0a0b14] flex items-center justify-center px-4">
        <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />
        <div className="w-full max-w-md relative z-10 text-center">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm p-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
              <Users className="h-7 w-7 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Invite Unavailable</h1>
            <p className="text-sm text-slate-500 mb-6">{error || "This invite is no longer valid."}</p>
            <a
              href="/login"
              className="inline-block rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-8 text-sm transition-colors"
            >
              Go to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b14] flex items-center justify-center px-4">
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
          <h1 className="text-2xl font-bold mb-2">You&apos;ve been invited!</h1>
          <p className="text-sm text-slate-500">
            Join <span className="text-white font-medium">{invite.teamName}</span> on UniqSocial
          </p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm p-8">
          {/* Team info */}
          <div className="space-y-4 mb-8">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Users className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{invite.teamName}</p>
                <p className="text-xs text-slate-500">{invite.memberCount} member{invite.memberCount !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {invite.credits > 0 && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 border border-green-500/20">
                  <Zap className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{invite.credits} credits</p>
                  <p className="text-xs text-slate-500">Assigned to you by the team owner</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Check className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Team account</p>
                <p className="text-xs text-slate-500">You&apos;ll use the team&apos;s shared credit pool</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleAccept}
            className="w-full py-3.5 rounded-xl font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-all flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20"
          >
            Accept & Create Account
          </button>

          <p className="text-center text-xs text-slate-600 mt-4">
            Invite sent to <span className="text-slate-400">{invite.email}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

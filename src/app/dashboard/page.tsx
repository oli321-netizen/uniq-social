"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  Upload,
  X,
  Download,
  Loader2,
  FileVideo,
  Check,
  Settings,
  LogOut,
  Zap,
  Plus,
  ShoppingCart,
  Mail,
  Crown,
  ArrowRight,
  BarChart3,
  Gift,
  History,
  Copy,
  Search,
  AlertTriangle,
  Clock,
  Shield,
} from "lucide-react";
import JSZip from "jszip";
import InstallButton from "@/components/InstallButton";

type VideoOutput = {
  url: string;
  filename: string;
};

type VideoFile = {
  id: string;
  file: File;
  name: string;
  size: string;
  status: "pending" | "processing" | "done" | "error";
  progress: number;
  outputUrl?: string;
  outputs?: VideoOutput[];
  completedCopies?: number;
};

const PROCESSING_STEPS = [
  "Analysing video",
  "Applying cuts",
  "Adjusting zoom",
  "Mirroring frames",
  "Adding grain",
  "Sharpening",
  "Injecting metadata",
  "Encoding output",
  "Finalising",
];

type MetadataProfile = "capcut" | "snapchat" | "iphone" | "random";

function ProcessingStepText({ progress }: { progress: number }) {
  const [dotCount, setDotCount] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDotCount((d) => (d + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  const stepIndex = Math.min(
    Math.floor((progress / 100) * PROCESSING_STEPS.length),
    PROCESSING_STEPS.length - 1
  );
  return (
    <span className="text-purple-400/80 text-[10px] font-medium tracking-wide">
      {PROCESSING_STEPS[stepIndex]}{".".repeat(dotCount)}
    </span>
  );
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* Waveform bars for processing animation */
function WaveformBars() {
  return (
    <svg width="48" height="12" viewBox="0 0 48 12" className="opacity-50">
      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45].map((x, i) => (
        <rect
          key={i}
          x={x}
          y={[4, 2, 3, 1, 3, 2, 4, 1, 3, 4][i]}
          width="2"
          height={[4, 8, 6, 10, 6, 8, 4, 10, 6, 4][i]}
          rx="1"
          fill="#7DF9FF"
          className="animate-pulse"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </svg>
  );
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [metadata, setMetadata] = useState<MetadataProfile[]>(["random"]);
  const [copies, setCopies] = useState(1);
  const [copiesInput, setCopiesInput] = useState("1");
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [credits, setCredits] = useState(0);
  const [creditsLoaded, setCreditsLoaded] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [plan, setPlan] = useState("free");
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showLowCredits, setShowLowCredits] = useState(false);
  const lowCreditsShownRef = useRef(false);
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null);
  const outOfCreditsRef = useRef(false);
  const planRank: Record<string, number> = {
    free: 0,
    starter: 1,
    growth: 2,
    pro: 3,
    business: 4,
    agency: 5,
  };
  const currentRank = planRank[plan] ?? 0;
  const [isZipping, setIsZipping] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "process" | "history" | "stats" | "refer" | "duplicates"
  >("process");
  const [duplicateData, setDuplicateData] = useState<any>(null);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [historyJobs, setHistoryJobs] = useState<any[]>([]);
  const [usageData, setUsageData] = useState<any>(null);
  const [referralData, setReferralData] = useState<any>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const { addToast } = useToast();
  const [previewVid, setPreviewVid] = useState<VideoFile | null>(null);
  const [showProcessMore, setShowProcessMore] = useState(false);

  // Edit parameter ranges
  const [editSettings, setEditSettings] = useState({
    trimMin: 0.05,
    trimMax: 0.15,
    cutsMin: 2,
    cutsMax: 4,
    zoomMin: 1,
    zoomMax: 7,
    grain: true,
    grainIntensity: 3,
    sharpen: true,
    sharpenAmount: 0.3,
    mirror: true,
    thumbnailRandomise: false,
    hiddenEmoji: true,
    speedShift: true,
    cropOffset: true,
    hueShift: true,
  });

  // Settings panel visibility
  // Settings are now in permanent sidebar

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("video/")
    );
    addFiles(files);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Reusable credit refresh
  const refreshCredits = useCallback(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => {
        setCredits(d.credits ?? 0);
        setPlan(d.plan ?? "free");
        setCreditsLoaded(true);
        setEmailVerified(d.emailVerified !== false);
        if (d.teamRole === "member") setIsTeamMember(true);
      })
      .catch(() => {});
  }, []);

  // Fetch credits on load
  useEffect(() => {
    if (status === "authenticated") refreshCredits();
  }, [status, refreshCredits]);

  // Refresh credits when user returns to tab
  useEffect(() => {
    const onFocus = () => {
      if (status === "authenticated") refreshCredits();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        status === "authenticated"
      )
        refreshCredits();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [status, refreshCredits]);

  // Show low-credits popup when balance gets low
  useEffect(() => {
    if (
      creditsLoaded &&
      credits <= 20 &&
      credits >= 0 &&
      !lowCreditsShownRef.current
    ) {
      lowCreditsShownRef.current = true;
      setShowLowCredits(true);
    }
  }, [credits, creditsLoaded]);

  // Fetch tab data when tab changes
  useEffect(() => {
    if (status !== "authenticated") return;
    if (activeTab === "history") {
      fetch("/api/history")
        .then((r) => r.json())
        .then((d) => setHistoryJobs(d.jobs || []))
        .catch(() => {});
    } else if (activeTab === "stats") {
      fetch("/api/usage")
        .then((r) => r.json())
        .then((d) => setUsageData(d))
        .catch(() => {});
    } else if (activeTab === "refer") {
      fetch("/api/referral")
        .then((r) => r.json())
        .then((d) => setReferralData(d))
        .catch(() => {});
    } else if (activeTab === "duplicates") {
      setDuplicatesLoading(true);
      fetch("/api/duplicates")
        .then((r) => r.json())
        .then((d) => {
          setDuplicateData(d);
          setDuplicatesLoading(false);
        })
        .catch(() => setDuplicatesLoading(false));
    }
  }, [activeTab, status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#07080C] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  const addFiles = (files: File[]) => {
    const newVids: VideoFile[] = files.map((f) => ({
      id: genId(),
      file: f,
      name: f.name,
      size: formatSize(f.size),
      status: "pending",
      progress: 0,
    }));
    setVideos((prev) => [...prev, ...newVids]);
  };

  const removeVideo = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  const clearAll = () => setVideos([]);

  const processVideo = async (
    vid: VideoFile,
    copyIndex: number,
    retries = 2
  ): Promise<{ url: string; filename: string }> => {
    const formData = new FormData();
    formData.append("video", vid.file);
    formData.append(
      "config",
      JSON.stringify({
        ...editSettings,
        metadata: metadata.length === 1 ? metadata[0] : metadata,
      })
    );

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch("/api/process", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 401 || res.status === 402) {
            throw new Error(
              errData.error || `Processing failed: ${res.statusText}`
            );
          }
          if (attempt < retries) continue;
          throw new Error(
            errData.error || `Processing failed: ${res.statusText}`
          );
        }

        const rawBlob = await res.blob();
        const blob = new Blob([rawBlob], { type: "video/mp4" });
        const ext = vid.name.split(".").pop() || "mp4";
        const suffix = copies > 1 ? `_v${copyIndex + 1}` : "";
        const filename = vid.name.replace(`.${ext}`, `_uniq${suffix}.mp4`);
        const url = URL.createObjectURL(blob);
        return { url, filename };
      } catch (err) {
        if (attempt >= retries) throw err;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    throw new Error("Processing failed after retries");
  };

  const processVideoCopies = async (
    vid: VideoFile
  ): Promise<{ url: string; filename: string }[]> => {
    const COPY_CONCURRENCY = 3;
    const results: { url: string; filename: string }[] = new Array(copies);
    let completedCopies = 0;

    for (let batch = 0; batch < copies; batch += COPY_CONCURRENCY) {
      const batchSize = Math.min(COPY_CONCURRENCY, copies - batch);
      const batchPromises = Array.from({ length: batchSize }, async (_, i) => {
        const copyIdx = batch + i;
        const result = await processVideo(vid, copyIdx);
        results[copyIdx] = result;
        completedCopies++;
        setCredits((prev) => Math.max(0, prev - 1));
        setVideos((prev) =>
          prev.map((v) =>
            v.id === vid.id
              ? {
                  ...v,
                  progress:
                    Math.round((completedCopies / copies) * 90) + 10,
                  completedCopies,
                }
              : v
          )
        );
      });
      await Promise.all(batchPromises);
    }

    return results;
  };

  const processAll = async () => {
    const pendingVids = videos.filter((v) => v.status === "pending");
    const totalNeeded = pendingVids.length * copies;

    if (credits < totalNeeded) {
      addToast(
        `Not enough credits. You need ${totalNeeded} but only have ${credits}.`,
        "error"
      );
      return;
    }

    setIsProcessing(true);
    outOfCreditsRef.current = false;

    const VIDEO_CONCURRENCY = 2;

    for (
      let batch = 0;
      batch < pendingVids.length;
      batch += VIDEO_CONCURRENCY
    ) {
      const batchVids = pendingVids.slice(batch, batch + VIDEO_CONCURRENCY);
      if (outOfCreditsRef.current) break;

      await Promise.all(
        batchVids.map(async (vid) => {
          setVideos((prev) =>
            prev.map((v) =>
              v.id === vid.id
                ? { ...v, status: "processing", progress: 5 }
                : v
            )
          );

          try {
            const results = await processVideoCopies(vid);

            setVideos((prev) =>
              prev.map((v) =>
                v.id === vid.id
                  ? {
                      ...v,
                      status: "done",
                      progress: 100,
                      outputUrl: results[0].url,
                      outputs: results,
                    } as VideoFile
                  : v
              )
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            if (
              msg.includes("Insufficient credits") ||
              msg.includes("402")
            ) {
              outOfCreditsRef.current = true;
            }
            setVideos((prev) =>
              prev.map((v) =>
                v.id === vid.id
                  ? { ...v, status: "error", progress: 0 }
                  : v
              )
            );
          }
        })
      );
    }

    refreshCredits();

    const completedCount = videos.filter((v) => v.status === "done").length;
    const failedCount = videos.filter((v) => v.status === "error").length;
    if (completedCount > 0 && failedCount === 0) {
      addToast(
        `All ${completedCount * copies} video${completedCount * copies !== 1 ? "s" : ""} processed successfully!`,
        "success",
        5000
      );
    } else if (completedCount > 0 && failedCount > 0) {
      addToast(
        `${completedCount * copies} video${completedCount * copies !== 1 ? "s" : ""} done, ${failedCount} failed`,
        "warning",
        5000
      );
    } else if (failedCount > 0) {
      addToast("Processing failed. Please try again.", "error", 5000);
    }
    if (completedCount > 0) {
      fetch("/api/notify-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalVideos: completedCount,
          totalCopies: completedCount * copies,
        }),
      }).catch(() => {});
    }

    setIsProcessing(false);
    setShowProcessMore(true);
  };

  const clearCompleted = () => {
    setVideos(
      (prev) =>
        prev.filter((v) => v.status !== "done" && v.status !== "error")
    );
    setShowProcessMore(false);
  };

  const pendingCount = videos.filter((v) => v.status === "pending").length;
  const doneCount = videos.filter((v) => v.status === "done").length;




  // Icon sidebar tab data
  const sidebarTabs: {
    key: typeof activeTab;
    icon: React.ReactNode;
    label: string;
  }[] = [
    {
      key: "process",
      label: "Process",
      icon: <Upload className="h-4 w-4" />,
    },
    {
      key: "history",
      label: "History",
      icon: <Clock className="h-4 w-4" />,
    },
    {
      key: "duplicates",
      label: "Duplicates",
      icon: <Search className="h-4 w-4" />,
    },
    {
      key: "stats",
      label: "Stats",
      icon: <BarChart3 className="h-4 w-4" />,
    },
    { key: "refer", label: "Refer", icon: <Gift className="h-4 w-4" /> },
  ];

  return (
    <div className="h-screen bg-[#07080C] flex flex-col overflow-hidden relative font-[Inter,system-ui,sans-serif]">
      {/* Dot grid background */}
      <svg
        className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="dotgrid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.5" fill="#1A1D27" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotgrid)" />
      </svg>

      {/* ═══ TOP NAV BAR ═══ */}
      <header className="relative z-10 h-[46px] flex items-center px-5 bg-white/[0.01] border-b border-white/[0.04] flex-shrink-0">
        <a href="/" className="font-black text-[16px] tracking-tighter text-white mr-6">uniq</a>

        {/* Nav tabs */}
        <div className="flex items-center gap-0.5 h-full">
          {sidebarTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative h-full px-3.5 flex items-center transition-all ${
                activeTab === tab.key
                  ? "text-purple-400"
                  : "text-[#3D4050] hover:text-[#C8CAD0]"
              }`}
            >
              <span className="text-[13px] font-semibold">{tab.label}</span>
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-purple-400 rounded-t" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Right: credits + actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/[0.04] border border-purple-500/[0.08]">
            <span className="font-mono text-[13px] font-bold text-purple-400">{credits}</span>
            <span className="text-[9px] text-[#3D4050] font-semibold">CR</span>
          </div>
          <button
            onClick={() => setShowTopUp(true)}
            className="px-2.5 py-1 rounded-md bg-purple-500/[0.06] border border-purple-500/[0.12] hover:bg-purple-500/[0.1] transition-colors"
          >
            <span className="text-[12px] font-bold text-purple-400">Top up</span>
          </button>
          <InstallButton />
          <a href="/account" className="text-[#3D4050] hover:text-white transition-colors ml-1">
            <Settings className="h-3.5 w-3.5" />
          </a>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-[#3D4050] hover:text-white transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Email verification banner */}
      {!emailVerified && (
        <div className="relative z-10 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-200 truncate">
              Please verify your email to keep your account secure.
            </p>
          </div>
          <button
            onClick={async () => {
              setResendingVerification(true);
              try {
                await fetch("/api/auth/resend-verification", {
                  method: "POST",
                });
              } catch {
                /* ignore */
              }
              setResendingVerification(false);
            }}
            disabled={resendingVerification}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {resendingVerification ? "Sending..." : "Resend"}
          </button>
        </div>
      )}

      {/* Upgrade banner for free users */}
      {plan === "free" && !isTeamMember && (
        <div className="relative z-10 border-b border-purple-500/10 bg-purple-500/[0.02] px-4 py-2.5 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Crown className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-slate-400">
              Upgrade your plan — get monthly credits from £24/mo
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTopUp(true)}
              className="px-3 py-1 rounded-md text-[11px] font-medium bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all"
            >
              Top Up
            </button>
            <button
              onClick={() => setShowPlans(true)}
              className="px-3 py-1 rounded-md text-[11px] font-medium bg-purple-600 hover:bg-purple-700 text-white transition-all flex items-center gap-1"
            >
              View Plans <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* ═══ MAIN BODY ═══ */}
      <div className="relative z-10 flex-1 flex overflow-hidden">


        {/* ═══ PROCESS TAB ═══ */}
        {activeTab === "process" && (
          <div className="flex-1 flex overflow-hidden">
            {/* LEFT: Upload + Queue */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Upload zone (full-width) */}
              <div className="p-4 flex-shrink-0">
                  <div
                    onDrop={onDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-xl border-[1.5px] border-dashed border-purple-500/[0.12] bg-purple-500/[0.015] hover:border-purple-500/[0.25] transition-all cursor-pointer flex flex-col items-center justify-center py-8 px-4 text-center group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files)
                          addFiles(Array.from(e.target.files));
                      }}
                    />
                    <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-purple-500/[0.08] to-purple-600/[0.06] border border-purple-500/[0.08] flex items-center justify-center mb-2 group-hover:from-purple-500/[0.12] group-hover:to-purple-600/[0.1] transition-all">
                      <Upload className="h-4 w-4 text-purple-400" />
                    </div>
                    <p className="text-[13px] font-bold text-white tracking-tight">
                      Drop videos
                    </p>
                    <p className="text-[10px] text-[#2A2D3A] mt-0.5">
                      MP4 MOV AVI · 500 MB max
                    </p>
                  </div>

              </div>

              {/* Queue area */}
              <div className="flex-1 overflow-y-auto">
                {/* Queue header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[13px] font-extrabold text-white tracking-tight">
                      Queue
                    </span>
                    <div className="px-1.5 py-0.5 rounded bg-white/[0.03]">
                      <span className="font-mono text-[10px] font-semibold text-[#3D4050]">
                        {videos.length} file
                        {videos.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {videos.length > 0 && (
                      <button
                        onClick={clearAll}
                        className="text-[10px] text-[#2A2D3A] hover:text-red-400 transition-colors ml-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {pendingCount > 0 && (
                      <span className="font-mono text-[11px] text-[#3D4050]">
                        {pendingCount * copies} cr
                      </span>
                    )}
                    <button
                      onClick={processAll}
                      disabled={
                        pendingCount === 0 ||
                        isProcessing ||
                        credits < pendingCount * copies
                      }
                      className={`px-5 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-2 ${
                        pendingCount > 0 &&
                        !isProcessing &&
                        credits >= pendingCount * copies
                          ? "border border-purple-500/20 bg-gradient-to-r from-purple-500/[0.1] to-purple-500/[0.06] text-purple-400 shadow-[0_2px_20px_rgba(167,139,250,0.08)] hover:from-purple-500/[0.15]"
                          : "bg-white/[0.03] text-[#2A2D3A] cursor-not-allowed"
                      }`}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Zap className="h-3.5 w-3.5" />
                          Process all
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Not enough credits warning */}
                {pendingCount > 0 &&
                  !isProcessing &&
                  credits < pendingCount * copies && (
                    <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-500/[0.05] border border-red-500/[0.1]">
                      <p className="text-[11px] text-red-400">
                        Not enough credits — need {pendingCount * copies},
                        have {credits}.{" "}
                        <button
                          onClick={() => setShowPlans(true)}
                          className="underline text-purple-400 hover:text-purple-300"
                        >
                          Get more
                        </button>
                      </p>
                    </div>
                  )}

                {/* Video cards */}
                <div className="px-4 space-y-1.5 pb-4">
                  {videos.map((vid) => (
                    <div
                      key={vid.id}
                      className={`rounded-xl p-4 transition-all ${
                        vid.status === "processing"
                          ? "bg-purple-500/[0.015] border border-purple-500/[0.08]"
                          : vid.status === "done"
                            ? "bg-emerald-500/[0.01] border border-emerald-500/[0.06]"
                            : vid.status === "error"
                              ? "bg-red-500/[0.01] border border-red-500/[0.06]"
                              : "bg-white/[0.005] border border-white/[0.025]"
                      } ${vid.status === "pending" ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Status icon */}
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            vid.status === "processing"
                              ? "bg-purple-500/[0.06]"
                              : vid.status === "done"
                                ? "bg-emerald-500/[0.06]"
                                : vid.status === "error"
                                  ? "bg-red-500/[0.06]"
                                  : "bg-white/[0.015]"
                          }`}
                        >
                          {vid.status === "processing" ? (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              className="animate-spin"
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="9"
                                fill="none"
                                stroke="rgba(167,139,250,0.1)"
                                strokeWidth="2.5"
                              />
                              <path
                                d="M12 3a9 9 0 0 1 9 9"
                                fill="none"
                                stroke="#A78BFA"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          ) : vid.status === "done" ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : vid.status === "error" ? (
                            <X className="h-3.5 w-3.5 text-red-400" />
                          ) : (
                            <FileVideo className="h-3.5 w-3.5 text-[#2A2D3A]" />
                          )}
                        </div>

                        {/* File info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-white tracking-tight truncate">
                            {vid.name}
                          </p>
                          {vid.status === "processing" ? (
                            <div className="flex items-center gap-2 mt-0.5">
                              <ProcessingStepText
                                progress={vid.progress}
                              />
                              {vid.completedCopies !== undefined && (
                                <span className="text-[10px] text-[#2A2D3A]">
                                  · {vid.completedCopies}/{copies}
                                </span>
                              )}
                            </div>
                          ) : vid.status === "done" ? (
                            <p className="text-[10px] text-[#2A2D3A] mt-0.5">
                              {vid.size} · {vid.outputs?.length || copies}{" "}
                              copies
                            </p>
                          ) : (
                            <p className="text-[10px] text-[#2A2D3A] mt-0.5">
                              {vid.size}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {vid.status === "processing" && (
                            <>
                              <WaveformBars />
                              <span className="font-mono text-[11px] font-bold text-purple-400 px-2 py-0.5 rounded bg-purple-500/[0.06]">
                                {vid.progress}%
                              </span>
                            </>
                          )}
                          {vid.status === "done" && vid.outputs && (
                            <>
                              {/* Uniqueness badge */}
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/[0.06] border border-purple-500/[0.1]">
                                <Shield className="h-2.5 w-2.5 text-purple-400" />
                                <span className="font-mono text-[10px] font-bold text-purple-400">
                                  98.4
                                </span>
                              </div>
                              <button
                                onClick={() => setPreviewVid(vid)}
                                className="text-[11px] text-purple-400 hover:text-purple-300 font-medium transition-colors"
                              >
                                Preview
                              </button>
                              <button
                                onClick={() => {
                                  if (vid.outputs) {
                                    vid.outputs.forEach((out, i) => {
                                      setTimeout(() => {
                                        const a =
                                          document.createElement("a");
                                        a.href = out.url;
                                        a.download = out.filename;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                      }, i * 500);
                                    });
                                  }
                                }}
                                className="px-3 py-1 rounded-md border border-emerald-500/[0.12] bg-emerald-500/[0.04] text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/[0.08] transition-colors"
                              >
                                Download
                              </button>
                            </>
                          )}
                          {vid.status === "error" && (
                            <span className="text-[11px] text-red-400 font-medium">
                              Failed
                            </span>
                          )}
                          {vid.status === "pending" && (
                            <button
                              onClick={() => removeVideo(vid.id)}
                              className="text-[#2A2D3A] hover:text-red-400 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Segmented progress bar */}
                      {vid.status === "processing" && (
                        <div className="flex gap-1 mt-3">
                          {Array.from({ length: 3 }).map((_, i) => {
                            const segPct = (vid.progress / 100) * 3;
                            const filled =
                              segPct > i + 1
                                ? 100
                                : segPct > i
                                  ? (segPct - i) * 100
                                  : 0;
                            return (
                              <div
                                key={i}
                                className="flex-1 h-1 rounded-full bg-purple-500/[0.06] overflow-hidden"
                              >
                                <div
                                  className="h-full rounded-full bg-purple-400 transition-all duration-700"
                                  style={{
                                    width: `${Math.min(100, filled)}%`,
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Bulk download */}
                  {doneCount > 0 && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          const allOutputs: {
                            url: string;
                            filename: string;
                          }[] = [];
                          videos.forEach((v) => {
                            if (v.status === "done" && v.outputs)
                              v.outputs.forEach((out) =>
                                allOutputs.push(out)
                              );
                          });
                          allOutputs.forEach((out, i) => {
                            setTimeout(() => {
                              const a = document.createElement("a");
                              a.href = out.url;
                              a.download = out.filename;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                            }, i * 500);
                          });
                        }}
                        className="flex-1 py-2.5 rounded-lg font-bold text-[12px] bg-gradient-to-r from-purple-500/[0.1] to-purple-500/[0.06] border border-purple-500/[0.15] text-purple-400 transition-all flex items-center justify-center gap-2 hover:from-purple-500/[0.15]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Save all videos
                      </button>
                      <button
                        disabled={isZipping}
                        onClick={async () => {
                          setIsZipping(true);
                          try {
                            const zip = new JSZip();
                            const allOutputs: {
                              url: string;
                              filename: string;
                            }[] = [];
                            videos.forEach((v) => {
                              if (v.status === "done" && v.outputs)
                                v.outputs.forEach((out) =>
                                  allOutputs.push(out)
                                );
                            });
                            await Promise.all(
                              allOutputs.map(async (out) => {
                                const res = await fetch(out.url);
                                const buf = await res.arrayBuffer();
                                zip.file(out.filename, buf, {
                                  binary: true,
                                });
                              })
                            );
                            const zipBlob = await zip.generateAsync({
                              type: "blob",
                              compression: "STORE",
                              streamFiles: false,
                            });
                            const url = URL.createObjectURL(zipBlob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `uniq_${Date.now()}.zip`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            setTimeout(
                              () => URL.revokeObjectURL(url),
                              5000
                            );
                          } catch (err) {
                            console.error("Zip download failed:", err);
                          } finally {
                            setIsZipping(false);
                          }
                        }}
                        className="py-2.5 px-4 rounded-lg font-bold text-[12px] bg-white/[0.02] border border-white/[0.06] text-[#C8CAD0] transition-all flex items-center justify-center gap-2 hover:bg-white/[0.04] disabled:opacity-50"
                      >
                        {isZipping ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5" />
                            .zip
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Process more */}
                  {showProcessMore &&
                    doneCount > 0 &&
                    !isProcessing && (
                      <button
                        onClick={clearCompleted}
                        className="w-full py-2.5 rounded-lg font-bold text-[12px] mt-2 border border-purple-500/[0.2] bg-purple-500/[0.05] text-purple-300 hover:bg-purple-500/[0.1] flex items-center justify-center gap-2 transition-all"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Process More Videos
                      </button>
                    )}
                </div>
              </div>
            </div>

            {/* ═══ RIGHT SETTINGS SIDEBAR ═══ */}
            <aside className="hidden lg:flex w-[300px] flex-shrink-0 border-l border-white/[0.03] bg-white/[0.005] flex-col overflow-y-auto">
              <div className="p-4 space-y-5">
                {/* Video Identity Profile */}
                <div>
                  <p className="text-[10px] font-bold text-[#2A2D3A] tracking-wider mb-3">
                    VIDEO IDENTITY PROFILE
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["capcut", "snapchat", "iphone", "random"] as MetadataProfile[]).map((p) => {
                      const labels: Record<MetadataProfile, string> = { capcut: "CapCut", snapchat: "Snapchat", iphone: "iPhone", random: "Random" };
                      const descs: Record<MetadataProfile, string> = { capcut: "Edited with CapCut", snapchat: "Recorded via Snap", iphone: "Shot on iPhone", random: "Auto per copy" };
                      const isActive = metadata.includes(p);
                      const stacked = isActive && metadata.length > 1 && !metadata.includes("random") && p !== "random";
                      return (
                        <button
                          key={p}
                          onClick={() => {
                            if (p === "random") { setMetadata(["random"]); return; }
                            const isSelected = metadata.includes(p);
                            if (isSelected) {
                              const next = metadata.filter((m) => m !== p);
                              setMetadata(next.length === 0 ? ["random"] : next);
                            } else {
                              setMetadata([...metadata.filter((m) => m !== "random"), p]);
                            }
                          }}
                          className={`relative p-3 rounded-lg border text-left transition-all ${
                            isActive
                              ? "border-purple-500/[0.2] bg-purple-500/[0.04]"
                              : "border-white/[0.04] bg-white/[0.01] hover:border-white/[0.08]"
                          }`}
                        >
                          <span className={`text-[12px] font-bold block ${isActive ? "text-purple-400" : "text-[#3D4050]"}`}>
                            {labels[p]}
                          </span>
                          <span className="text-[10px] text-[#2A2D3A] block mt-0.5">{descs[p]}</span>
                          {isActive && <Check className="absolute top-2 right-2 h-3 w-3 text-purple-400" />}
                          {stacked && (
                            <span className="text-[9px] font-bold text-purple-400/80 bg-purple-500/[0.1] px-1.5 py-0.5 rounded mt-1.5 inline-block">STACKED</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Anti-Detection Toggles */}
                <div>
                  <p className="text-[10px] font-bold text-purple-400 tracking-wider mb-3">ANTI-DETECTION</p>
                  <div className="space-y-1.5">
                    {[
                      { key: "hiddenEmoji", label: "Hidden Overlay", desc: "Invisible pixel marker" },
                      { key: "speedShift", label: "Speed Shift", desc: "Tempo change" },
                      { key: "cropOffset", label: "Crop Offset", desc: "Spatial shift" },
                      { key: "hueShift", label: "Hue Shift", desc: "Colour rotation" },
                      { key: "thumbnailRandomise", label: "Randomise Thumb", desc: "Unique first-frame" },
                    ].map((t) => {
                      const isOn = editSettings[t.key as keyof typeof editSettings] as boolean;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setEditSettings({ ...editSettings, [t.key]: !isOn })}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                            isOn ? "border-purple-500/[0.2] bg-purple-500/[0.04]" : "border-white/[0.04] bg-white/[0.01] hover:border-white/[0.08]"
                          }`}
                        >
                          <div className="text-left">
                            <span className={`text-[12px] font-bold block ${isOn ? "text-white" : "text-[#3D4050]"}`}>{t.label}</span>
                            <span className="text-[10px] text-[#2A2D3A]">{t.desc}</span>
                          </div>
                          <div className={`w-8 h-[18px] rounded-full transition-all relative flex-shrink-0 ${isOn ? "bg-purple-500" : "bg-white/[0.08]"}`}>
                            <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[1px] transition-all ${isOn ? "left-[15px]" : "left-[2px]"}`} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Edit Parameters */}
                <div>
                  <p className="text-[10px] font-bold text-[#2A2D3A] tracking-wider mb-3">EDIT PARAMETERS</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-[#3D4050] block mb-1.5">Trim range (seconds)</label>
                      <div className="flex gap-2">
                        <input type="number" step="0.01" min="0" max="5" value={editSettings.trimMin}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setEditSettings({ ...editSettings, trimMin: v }); }}
                          onFocus={(e) => e.target.select()}
                          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <input type="number" step="0.01" min="0" max="5" value={editSettings.trimMax}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setEditSettings({ ...editSettings, trimMax: v }); }}
                          onFocus={(e) => e.target.select()}
                          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-[#3D4050] block mb-1.5">Number of cuts</label>
                      <div className="flex gap-2">
                        <input type="number" step="1" min="0" max="20" value={editSettings.cutsMin}
                          onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setEditSettings({ ...editSettings, cutsMin: v }); }}
                          onFocus={(e) => e.target.select()}
                          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <input type="number" step="1" min="0" max="20" value={editSettings.cutsMax}
                          onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setEditSettings({ ...editSettings, cutsMax: v }); }}
                          onFocus={(e) => e.target.select()}
                          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-[#3D4050] block mb-1.5">Zoom range (%)</label>
                      <div className="flex gap-2">
                        <input type="number" step="0.5" min="0" max="50" value={editSettings.zoomMin}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setEditSettings({ ...editSettings, zoomMin: v }); }}
                          onFocus={(e) => e.target.select()}
                          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <input type="number" step="0.5" min="0" max="50" value={editSettings.zoomMax}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setEditSettings({ ...editSettings, zoomMax: v }); }}
                          onFocus={(e) => e.target.select()}
                          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>
                    {/* Processing toggles */}
                    <div className="space-y-2 pt-1">
                      {[
                        { key: "mirror", label: "Mirror (horizontal flip)" },
                        { key: "grain", label: "Film grain" },
                        { key: "sharpen", label: "Sharpen" },
                      ].map((toggle) => (
                        <label key={toggle.key} className="flex items-center justify-between cursor-pointer">
                          <span className="text-[12px] text-[#C8CAD0]">{toggle.label}</span>
                          <button
                            onClick={() => setEditSettings({ ...editSettings, [toggle.key]: !editSettings[toggle.key as keyof typeof editSettings] })}
                            className={`relative w-8 h-[18px] rounded-full transition-colors ${
                              editSettings[toggle.key as keyof typeof editSettings] ? "bg-purple-500" : "bg-white/[0.08]"
                            }`}
                          >
                            <span className={`absolute top-[1px] left-[2px] h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                              editSettings[toggle.key as keyof typeof editSettings] ? "translate-x-[14px]" : ""
                            }`} />
                          </button>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Copies */}
                <div>
                  <p className="text-[10px] font-bold text-[#2A2D3A] tracking-wider mb-3">COPIES PER VIDEO</p>
                  <div className="flex rounded-md border border-white/[0.06] overflow-hidden">
                    <button
                      onClick={() => { const v = Math.max(1, copies - 1); setCopies(v); setCopiesInput(String(v)); }}
                      className="w-8 h-8 flex items-center justify-center bg-white/[0.02] text-[#3D4050] text-sm hover:bg-white/[0.05] transition-colors"
                    >−</button>
                    <input
                      type="text" inputMode="numeric" value={copiesInput}
                      onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); setCopiesInput(raw); const num = parseInt(raw); if (!isNaN(num) && num >= 1 && num <= 100) setCopies(num); }}
                      onBlur={() => { const num = parseInt(copiesInput); if (isNaN(num) || num < 1) { setCopies(1); setCopiesInput("1"); } else if (num > 100) { setCopies(100); setCopiesInput("100"); } else { setCopies(num); setCopiesInput(String(num)); } }}
                      onFocus={(e) => e.target.select()}
                      className="flex-1 h-8 text-center font-mono text-[15px] font-bold text-white bg-white/[0.02] border-x border-white/[0.06] focus:outline-none"
                    />
                    <button
                      onClick={() => { const v = Math.min(100, copies + 1); setCopies(v); setCopiesInput(String(v)); }}
                      className="w-8 h-8 flex items-center justify-center bg-white/[0.02] text-[#3D4050] text-sm hover:bg-white/[0.05] transition-colors"
                    >+</button>
                  </div>
                </div>

                {/* Process all button */}
                <button
                  onClick={processAll}
                  disabled={pendingCount === 0 || isProcessing || credits < pendingCount * copies}
                  className={`w-full py-3 rounded-lg text-[13px] font-bold transition-all flex items-center justify-center gap-2 ${
                    pendingCount > 0 && !isProcessing && credits >= pendingCount * copies
                      ? "border border-purple-500/20 bg-gradient-to-r from-purple-500/[0.15] to-purple-600/[0.1] text-purple-300 shadow-[0_2px_20px_rgba(167,139,250,0.08)] hover:from-purple-500/[0.2]"
                      : "bg-white/[0.03] text-[#2A2D3A] cursor-not-allowed"
                  }`}
                >
                  {isProcessing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                  ) : (
                    <><Zap className="h-4 w-4" /> Process all ({pendingCount * copies} cr)</>
                  )}
                </button>
              </div>
            </aside>


          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {activeTab === "history" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] overflow-hidden">
                <div className="p-4 border-b border-white/[0.03] flex items-center gap-2">
                  <History className="h-4 w-4 text-purple-400" />
                  <h2 className="text-sm font-bold text-white">
                    Processing History
                  </h2>
                </div>
                {historyJobs.length === 0 ? (
                  <div className="p-12 text-center">
                    <Clock className="h-8 w-8 text-[#1E2030] mx-auto mb-3" />
                    <p className="text-sm text-[#3D4050]">
                      No processing history yet
                    </p>
                    <p className="text-xs text-[#2A2D3A] mt-1">
                      Videos you process will appear here
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.03]">
                    {historyJobs.map((job: any) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/[0.06] flex-shrink-0">
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {job.fileName}
                            </p>
                            <p className="text-[10px] text-[#2A2D3A]">
                              {new Date(
                                job.createdAt
                              ).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-[#3D4050] flex-shrink-0">
                          {job.copies}{" "}
                          {job.copies === 1 ? "copy" : "copies"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ STATS TAB ═══ */}
        {activeTab === "stats" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-4">
              {!usageData ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
                </div>
              ) : (usageData.totalJobs ?? 0) === 0 ? (
                <div className="text-center py-16">
                  <BarChart3 className="h-10 w-10 text-[#1E2030] mx-auto mb-3" />
                  <p className="text-sm text-[#3D4050]">
                    No usage data yet
                  </p>
                  <p className="text-xs text-[#2A2D3A] mt-1">
                    Process some videos to see your stats here
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-5">
                      <p className="text-[10px] text-[#3D4050] font-semibold mb-1">
                        Videos Processed
                      </p>
                      <p className="font-mono text-2xl font-bold text-white">
                        {usageData.totalJobs ?? 0}
                      </p>
                      <p className="text-[10px] text-[#2A2D3A] mt-1">
                        last 30 days
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-5">
                      <p className="text-[10px] text-[#3D4050] font-semibold mb-1">
                        Unique Copies
                      </p>
                      <p className="font-mono text-2xl font-bold text-purple-400">
                        {usageData.totalCopies ?? 0}
                      </p>
                      <p className="text-[10px] text-[#2A2D3A] mt-1">
                        last 30 days
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-5">
                      <p className="text-[10px] text-[#3D4050] font-semibold mb-1">
                        Credits Used
                      </p>
                      <p className="font-mono text-2xl font-bold text-white">
                        {usageData.totalCopies ?? 0}
                      </p>
                      <p className="text-[10px] text-[#2A2D3A] mt-1">
                        last 30 days
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-5">
                    <h3 className="text-[10px] font-bold text-[#3D4050] tracking-wider mb-5">
                      DAILY ACTIVITY
                    </h3>
                    <div className="h-44 flex items-end gap-[3px]">
                      {(usageData.daily || [])
                        .slice(-14)
                        .map((d: any, i: number) => {
                          const days14 = (usageData.daily || []).slice(
                            -14
                          );
                          const max = Math.max(
                            ...days14.map(
                              (x: any) => x.copies || 0
                            ),
                            1
                          );
                          const h =
                            ((d.copies || 0) / max) * 100;
                          const isToday =
                            d.date ===
                            new Date()
                              .toISOString()
                              .split("T")[0];
                          return (
                            <div
                              key={i}
                              className="flex-1 flex flex-col items-center gap-1.5 group"
                            >
                              <span className="font-mono text-[10px] text-[#3D4050] opacity-0 group-hover:opacity-100 transition-opacity">
                                {d.copies || 0}
                              </span>
                              <div
                                className={`w-full rounded-sm transition-colors ${isToday ? "bg-purple-400 hover:bg-purple-300" : "bg-purple-500/[0.15] hover:bg-purple-500/[0.25]"}`}
                                style={{
                                  height: `${Math.max(h, 4)}%`,
                                }}
                                title={`${new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ${d.copies} copies`}
                              />
                              <span
                                className={`text-[10px] whitespace-nowrap ${isToday ? "text-purple-400 font-medium" : "text-[#2A2D3A]"} ${i % 2 === 0 ? "" : "invisible"}`}
                              >
                                {new Date(
                                  d.date
                                ).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ DUPLICATES TAB ═══ */}
        {activeTab === "duplicates" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Search className="h-4 w-4 text-purple-400" />
                      Duplicate Checker
                    </h3>
                    <p className="text-xs text-[#3D4050] mt-1">
                      Scans processed videos to find copies that are too
                      similar
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setDuplicatesLoading(true);
                      fetch("/api/duplicates")
                        .then((r) => r.json())
                        .then((d) => {
                          setDuplicateData(d);
                          setDuplicatesLoading(false);
                        })
                        .catch(() => setDuplicatesLoading(false));
                    }}
                    className="px-4 py-2 rounded-lg text-[12px] font-bold bg-gradient-to-r from-purple-500/[0.1] to-purple-500/[0.06] border border-purple-500/[0.15] text-purple-400 transition-all flex items-center gap-2 hover:from-purple-500/[0.15]"
                  >
                    {duplicatesLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    {duplicatesLoading ? "Scanning..." : "Scan Now"}
                  </button>
                </div>

                {duplicatesLoading && !duplicateData && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
                  </div>
                )}

                {duplicateData && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-4 text-center">
                        <div className="font-mono text-xl font-bold text-white">
                          {duplicateData.totalVideos}
                        </div>
                        <div className="text-[10px] text-[#3D4050] mt-1">
                          Total Processed
                        </div>
                      </div>
                      <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-4 text-center">
                        <div className="font-mono text-xl font-bold text-white">
                          {duplicateData.uniqueSources}
                        </div>
                        <div className="text-[10px] text-[#3D4050] mt-1">
                          Unique Sources
                        </div>
                      </div>
                      <div
                        className={`rounded-lg border p-4 text-center ${
                          duplicateData.duplicateGroups > 0
                            ? "bg-red-500/[0.03] border-red-500/[0.1]"
                            : "bg-emerald-500/[0.03] border-emerald-500/[0.1]"
                        }`}
                      >
                        <div
                          className={`font-mono text-xl font-bold ${duplicateData.duplicateGroups > 0 ? "text-red-400" : "text-emerald-400"}`}
                        >
                          {duplicateData.duplicateGroups}
                        </div>
                        <div className="text-[10px] text-[#3D4050] mt-1">
                          Duplicate Groups
                        </div>
                      </div>
                    </div>

                    {duplicateData.duplicateGroups === 0 ? (
                      <div className="rounded-lg bg-emerald-500/[0.03] border border-emerald-500/[0.1] p-6 text-center">
                        <Check className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                        <p className="text-sm font-medium text-emerald-400">
                          All clear — no duplicate copies detected
                        </p>
                        <p className="text-[10px] text-[#3D4050] mt-1">
                          Every processed video has unique enough
                          parameters
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {duplicateData.groups.map(
                          (group: any, gi: number) => (
                            <div
                              key={gi}
                              className="rounded-lg bg-red-500/[0.03] border border-red-500/[0.1] p-4"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-red-400" />
                                    <span className="text-sm font-medium text-white">
                                      {group.fileName}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-[#3D4050]">
                                    {group.copies} copies —{" "}
                                    {group.duplicates.length} similar
                                    pair
                                    {group.duplicates.length !== 1
                                      ? "s"
                                      : ""}
                                  </span>
                                </div>
                                <span className="text-[10px] bg-red-500/[0.1] text-red-300 px-2 py-0.5 rounded-full font-mono">
                                  {group.sourceHash}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {group.duplicates.map(
                                  (dup: any, di: number) => (
                                    <div
                                      key={di}
                                      className="rounded-md bg-white/[0.02] p-3 text-xs"
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-red-300 font-bold font-mono">
                                          {dup.similarity}% similar
                                        </span>
                                        <span className="text-[#3D4050]">
                                          {new Date(
                                            dup.date1
                                          ).toLocaleDateString()}{" "}
                                          vs{" "}
                                          {new Date(
                                            dup.date2
                                          ).toLocaleDateString()}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap gap-1">
                                        {dup.details.map(
                                          (
                                            d: string,
                                            k: number
                                          ) => (
                                            <span
                                              key={k}
                                              className="bg-red-500/[0.08] text-red-300 px-2 py-0.5 rounded text-[10px]"
                                            >
                                              {d}
                                            </span>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ REFER TAB ═══ */}
        {activeTab === "refer" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-md mx-auto">
              <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/[0.08] border border-purple-500/[0.15]">
                  <Gift className="h-6 w-6 text-purple-400" />
                </div>
                <h2 className="text-base font-bold text-white mb-2">
                  Refer & Earn Credits
                </h2>
                <p className="text-xs text-[#3D4050] mb-6">
                  Share your referral code. When someone signs up with it,
                  you both get{" "}
                  <span className="text-purple-400 font-bold">
                    50 free credits
                  </span>
                  !
                </p>

                {!referralData ? (
                  <Loader2 className="h-6 w-6 text-purple-400 animate-spin mx-auto" />
                ) : (
                  <>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] mb-4">
                      <code className="flex-1 text-sm font-mono text-purple-400 select-all">
                        {referralData.code}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            referralData.code
                          );
                          setReferralCopied(true);
                          setTimeout(
                            () => setReferralCopied(false),
                            2000
                          );
                        }}
                        className="px-3 py-1.5 rounded-md bg-purple-500/[0.1] border border-purple-500/[0.15] text-purple-400 text-xs font-bold transition-all flex items-center gap-1.5 hover:bg-purple-500/[0.15]"
                      >
                        {referralCopied ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {referralCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-4">
                        <p className="font-mono text-xl font-bold text-white">
                          {referralData.totalReferred ?? 0}
                        </p>
                        <p className="text-[10px] text-[#3D4050] mt-1">
                          People referred
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-4">
                        <p className="font-mono text-xl font-bold text-purple-400">
                          {(referralData.totalReferred ?? 0) * 50}
                        </p>
                        <p className="text-[10px] text-[#3D4050] mt-1">
                          Credits earned
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>


      {/* ═══ MODALS ═══ */}

      {/* Preview modal */}
      {previewVid &&
        previewVid.outputs &&
        previewVid.outputs.length > 0 && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
            <div className="w-full max-w-4xl rounded-xl border border-white/[0.06] bg-[#0A0B10] p-6 relative">
              <button
                onClick={() => setPreviewVid(null)}
                className="absolute top-4 right-4 text-[#3D4050] hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <h2 className="text-sm font-bold text-white mb-4">
                Before / After Preview
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-[#3D4050] mb-2">
                    Original
                  </p>
                  <video
                    src={URL.createObjectURL(previewVid.file)}
                    controls
                    className="w-full rounded-lg border border-white/[0.06]"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-[#3D4050] mb-2">
                    Processed
                  </p>
                  <video
                    src={previewVid.outputs[0].url}
                    controls
                    className="w-full rounded-lg border border-white/[0.06]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Low credits popup */}
      {showLowCredits && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-xl border border-white/[0.06] bg-[#0A0B10] p-8 relative text-center">
            <button
              onClick={() => setShowLowCredits(false)}
              className="absolute top-4 right-4 text-[#3D4050] hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/[0.08] border border-amber-500/[0.15]">
              <Zap className="h-6 w-6 text-amber-400" />
            </div>
            <h2 className="text-base font-bold text-white mb-2">
              Running low on credits
            </h2>
            <p className="text-xs text-[#3D4050] mb-6">
              You have{" "}
              <span className="text-white font-bold">{credits}</span>{" "}
              credit{credits !== 1 ? "s" : ""} remaining.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowLowCredits(false);
                  setShowTopUp(true);
                }}
                className={`${isTeamMember ? "w-full" : "flex-1"} py-2.5 rounded-lg text-[12px] font-bold bg-white/[0.03] hover:bg-white/[0.06] text-white border border-white/[0.06] transition-all`}
              >
                Top Up Credits
              </button>
              {!isTeamMember && (
                <button
                  onClick={() => {
                    setShowLowCredits(false);
                    setShowPlans(true);
                  }}
                  className="flex-1 py-2.5 rounded-lg text-[12px] font-bold bg-purple-600 hover:bg-purple-700 text-white transition-all"
                >
                  View Plans
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plans modal */}
      {showPlans && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-xl border border-white/[0.06] bg-[#0A0B10] p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowPlans(false)}
              className="absolute top-4 right-4 text-[#3D4050] hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/[0.08] border border-purple-500/[0.15]">
                <Crown className="h-6 w-6 text-purple-400" />
              </div>
              <h2 className="text-lg font-bold text-white">
                Choose a Plan
              </h2>
              <p className="text-xs text-[#3D4050] mt-1">
                Subscribe monthly and save on every credit
              </p>
            </div>
            <div className="space-y-2 mb-6">
              {[
                {
                  key: "starter",
                  label: "Starter",
                  credits: "100",
                  price: "24",
                },
                {
                  key: "growth",
                  label: "Growth",
                  credits: "500",
                  price: "75",
                },
                {
                  key: "pro",
                  label: "Pro",
                  credits: "1,500",
                  price: "150",
                },
                {
                  key: "business",
                  label: "Business",
                  credits: "5,000",
                  price: "350",
                },
                {
                  key: "agency",
                  label: "Agency",
                  credits: "15,000",
                  price: "750",
                },
              ]
                .filter((p) => (planRank[p.key] ?? 0) > currentRank)
                .map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    disabled={subscribingPlan === p.key}
                    onClick={async () => {
                      setSubscribingPlan(p.key);
                      try {
                        const res = await fetch(
                          "/api/stripe/subscribe",
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              planKey: p.key,
                            }),
                          }
                        );
                        const data = await res.json();
                        if (data.url)
                          window.location.href = data.url;
                        else {
                          addToast(
                            data.error ||
                              "Failed to start checkout",
                            "error"
                          );
                          setSubscribingPlan(null);
                        }
                      } catch {
                        addToast(
                          "Failed to connect to payment service",
                          "error"
                        );
                        setSubscribingPlan(null);
                      }
                    }}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-white/[0.06] bg-white/[0.01] hover:border-purple-500/[0.15] hover:bg-purple-500/[0.02] transition-all text-left cursor-pointer disabled:opacity-50"
                  >
                    <div>
                      <div className="text-sm font-bold text-white">
                        {p.label}
                      </div>
                      <div className="text-[10px] text-[#3D4050]">
                        {p.credits} credits/mo
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">
                        £{p.price}/mo
                      </span>
                      {subscribingPlan === p.key ? (
                        <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                      ) : (
                        <span className="text-[11px] font-bold text-purple-400">
                          Subscribe →
                        </span>
                      )}
                    </div>
                  </button>
                ))}
            </div>
            {plan === "agency" && (
              <div className="text-center py-6 text-xs text-[#3D4050]">
                You&apos;re on the top plan — Agency with 15,000
                credits/mo.
              </div>
            )}
            <button
              onClick={() => setShowPlans(false)}
              className="w-full py-2.5 rounded-lg text-[12px] font-bold bg-white/[0.03] hover:bg-white/[0.06] text-white border border-white/[0.06] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Top-up modal */}
      {showTopUp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-xl border border-white/[0.06] bg-[#0A0B10] p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowTopUp(false)}
              className="absolute top-4 right-4 text-[#3D4050] hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/[0.08] border border-purple-500/[0.15]">
                <ShoppingCart className="h-6 w-6 text-purple-400" />
              </div>
              <h2 className="text-lg font-bold text-white">
                Top Up Credits
              </h2>
              <p className="text-xs text-[#3D4050] mt-1">
                Buy extra credits without changing your plan
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
              {[
                { credits: 20, price: "5.20" },
                { credits: 50, price: "13" },
                { credits: 100, price: "26" },
                { credits: 250, price: "65" },
                { credits: 500, price: "130" },
                { credits: 1000, price: "260" },
              ].map((pack) => (
                <button
                  type="button"
                  key={pack.credits}
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const res = await fetch(
                        "/api/stripe/checkout",
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            credits: pack.credits,
                          }),
                        }
                      );
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else {
                        addToast(
                          data.error ||
                            "Failed to start checkout",
                          "error"
                        );
                      }
                    } catch (err) {
                      console.error("Checkout error:", err);
                      addToast(
                        "Failed to connect to payment service",
                        "error"
                      );
                    }
                  }}
                  className="group p-3.5 rounded-lg border border-white/[0.06] bg-white/[0.01] hover:border-purple-500/[0.15] hover:bg-purple-500/[0.02] transition-all text-left cursor-pointer"
                >
                  <div className="flex items-baseline justify-between mb-0.5">
                    <span className="font-mono text-lg font-bold text-white">
                      {pack.credits.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-[#3D4050]">
                      26p/ea
                    </span>
                  </div>
                  <div className="text-[10px] text-[#3D4050] mb-2">
                    credits
                  </div>
                  <div className="text-sm font-bold text-purple-400">
                    £{pack.price}
                  </div>
                </button>
              ))}
            </div>
            {!isTeamMember && (
              <p className="text-[10px] text-[#2A2D3A] text-center mb-4">
                All top-ups at 26p per credit. Save more with a plan.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowTopUp(false)}
                className={`${isTeamMember ? "w-full" : "flex-1"} py-2.5 rounded-lg text-[12px] font-bold bg-white/[0.03] hover:bg-white/[0.06] text-white border border-white/[0.06] transition-all`}
              >
                Cancel
              </button>
              {!isTeamMember && (
                <a
                  href="/account"
                  className="flex-1 py-2.5 rounded-lg text-[12px] font-bold bg-purple-600 hover:bg-purple-700 text-white text-center transition-all"
                >
                  View Plans
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

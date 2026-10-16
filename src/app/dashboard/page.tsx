"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/Toast";
import {
  Upload,
  Fingerprint,
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
  Sun,
  Moon,
  BarChart3,
  Gift,
  History,
  Copy,
  ImageIcon,
  Shuffle,
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
    <span className="text-purple-400/80 text-[11px] font-medium tracking-wide uppercase">
      {PROCESSING_STEPS[stepIndex]}{".".repeat(dotCount)}
    </span>
  );
}

function CircularProgress({ progress, size = 44 }: { progress: number; size?: number }) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke="currentColor" className="text-white/5"
        strokeWidth={strokeWidth} fill="none"
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke="url(#progressGrad)" strokeWidth={strokeWidth} fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        className="transition-all duration-700 ease-out"
      />
      <defs>
        <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const planRank: Record<string, number> = { free: 0, starter: 1, growth: 2, pro: 3, business: 4, agency: 5 };
  const currentRank = planRank[plan] ?? 0;
  const [isZipping, setIsZipping] = useState(false);
  const [activeTab, setActiveTab] = useState<"process" | "history" | "stats" | "refer">("process");
  const [historyJobs, setHistoryJobs] = useState<any[]>([]);
  const [usageData, setUsageData] = useState<any>(null);
  const [referralData, setReferralData] = useState<any>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();
  const [previewVid, setPreviewVid] = useState<VideoFile | null>(null);

  // Edit parameter ranges
  const [editSettings, setEditSettings] = useState({
    trimMin: 0.3,
    trimMax: 0.7,
    cutsMin: 3,
    cutsMax: 7,
    zoomMin: 1,
    zoomMax: 7,
    grain: true,
    grainIntensity: 3,
    sharpen: true,
    sharpenAmount: 0.3,
    mirror: true,
    thumbnailRandomise: false,
  });

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

  // Refresh credits when user returns to tab (e.g. after Stripe checkout)
  useEffect(() => {
    const onFocus = () => { if (status === "authenticated") refreshCredits(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && status === "authenticated") refreshCredits();
    });
    return () => { window.removeEventListener("focus", onFocus); };
  }, [status, refreshCredits]);

  // Show low-credits popup when balance gets low (once per session)
  useEffect(() => {
    if (creditsLoaded && credits <= 20 && credits >= 0 && !lowCreditsShownRef.current) {
      lowCreditsShownRef.current = true;
      setShowLowCredits(true);
    }
  }, [credits, creditsLoaded]);

  // Fetch tab data when tab changes
  useEffect(() => {
    if (status !== "authenticated") return;
    if (activeTab === "history") {
      fetch("/api/history").then(r => r.json()).then(d => setHistoryJobs(d.jobs || [])).catch(() => {});
    } else if (activeTab === "stats") {
      fetch("/api/usage").then(r => r.json()).then(d => setUsageData(d)).catch(() => {});
    } else if (activeTab === "refer") {
      fetch("/api/referral").then(r => r.json()).then(d => setReferralData(d)).catch(() => {});
    }
  }, [activeTab, status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#010313] flex items-center justify-center">
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

  const processVideo = async (vid: VideoFile, copyIndex: number, retries = 2): Promise<{ url: string; filename: string }> => {
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
          // Don't retry on auth/credit errors
          if (res.status === 401 || res.status === 402) {
            throw new Error(errData.error || `Processing failed: ${res.statusText}`);
          }
          if (attempt < retries) continue; // retry on server errors
          throw new Error(errData.error || `Processing failed: ${res.statusText}`);
        }

        const blob = await res.blob();
        const ext = vid.name.split(".").pop() || "mp4";
        const suffix = copies > 1 ? `_v${copyIndex + 1}` : "";
        const filename = vid.name.replace(`.${ext}`, `_uniq${suffix}.mp4`);
        const url = URL.createObjectURL(blob);
        return { url, filename };
      } catch (err) {
        if (attempt >= retries) throw err;
        // Wait briefly before retry
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    throw new Error("Processing failed after retries");
  };

  // Process copies for a single video concurrently (up to 3 at a time)
  const processVideoCopies = async (vid: VideoFile): Promise<{ url: string; filename: string }[]> => {
    const COPY_CONCURRENCY = 3;
    const results: { url: string; filename: string }[] = new Array(copies);
    let completedCopies = 0;

    // Process copies in batches of COPY_CONCURRENCY
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
              ? { ...v, progress: Math.round((completedCopies / copies) * 90) + 10, completedCopies }
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
      addToast(`Not enough credits. You need ${totalNeeded} but only have ${credits}.`, "error");
      return;
    }

    setIsProcessing(true);
    outOfCreditsRef.current = false;

    // Process 2 videos concurrently to keep server from being overwhelmed
    const VIDEO_CONCURRENCY = 2;

    for (let batch = 0; batch < pendingVids.length; batch += VIDEO_CONCURRENCY) {
      const batchVids = pendingVids.slice(batch, batch + VIDEO_CONCURRENCY);
      if (outOfCreditsRef.current) break;

      await Promise.all(
        batchVids.map(async (vid) => {
          setVideos((prev) =>
            prev.map((v) =>
              v.id === vid.id ? { ...v, status: "processing", progress: 5 } : v
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
            if (msg.includes("Insufficient credits") || msg.includes("402")) {
              outOfCreditsRef.current = true;
            }
            setVideos((prev) =>
              prev.map((v) =>
                v.id === vid.id ? { ...v, status: "error", progress: 0 } : v
              )
            );
          }
        })
      );
    }

    // Refresh credits from server
    refreshCredits();

    // Show completion toast & send email notification
    const completedCount = videos.filter((v) => v.status === "done").length;
    const failedCount = videos.filter((v) => v.status === "error").length;
    if (completedCount > 0 && failedCount === 0) {
      addToast(`All ${completedCount * copies} video${completedCount * copies !== 1 ? "s" : ""} processed successfully!`, "success", 5000);
    } else if (completedCount > 0 && failedCount > 0) {
      addToast(`${completedCount * copies} video${completedCount * copies !== 1 ? "s" : ""} done, ${failedCount} failed`, "warning", 5000);
    } else if (failedCount > 0) {
      addToast("Processing failed. Please try again.", "error", 5000);
    }
    if (completedCount > 0) {
      fetch("/api/notify-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalVideos: completedCount, totalCopies: completedCount * copies }),
      }).catch(() => {});
    }

    setIsProcessing(false);
  };

  const pendingCount = videos.filter((v) => v.status === "pending").length;
  const doneCount = videos.filter((v) => v.status === "done").length;

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
            <span className="text-xs text-slate-600 hidden sm:inline">Dashboard</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Zap className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs sm:text-sm font-medium text-purple-300">
                {credits}
              </span>
            </div>
            <button
              onClick={() => setShowTopUp(true)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-all hover:shadow-lg hover:shadow-purple-500/20"
            >
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">Buy Credits</span>
            </button>
            <InstallButton />
            <button
              onClick={toggleTheme}
              className="text-slate-500 hover:text-white transition-colors"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <a href="/account" className="text-slate-500 hover:text-white transition-colors">
              <Settings className="h-4 w-4" />
            </a>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Email verification banner */}
      {!emailVerified && (
        <div className="bg-amber-500/10 border-b border-amber-500/20">
          <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Mail className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-xs sm:text-sm text-amber-200 truncate">
                Please verify your email to keep your account secure.
              </p>
            </div>
            <button
              onClick={async () => {
                setResendingVerification(true);
                try {
                  await fetch('/api/auth/resend-verification', { method: 'POST' });
                } catch {}
                setResendingVerification(false);
              }}
              disabled={resendingVerification}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
            >
              {resendingVerification ? 'Sending...' : 'Resend code'}
            </button>
          </div>
        </div>
      )}


      {/* Upgrade banner for free users — hidden for team members */}
      {plan === "free" && !isTeamMember && (
        <div className="mx-auto max-w-6xl px-3 sm:px-6 pt-4 sm:pt-6">
          <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-500/[0.08] to-purple-600/[0.04] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 shrink-0">
                  <Crown className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Upgrade your plan</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Get monthly credits from £24/mo
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowTopUp(true)}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all text-center"
                >
                  Top Up
                </button>
                <button
                  onClick={() => setShowPlans(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white transition-all hover:shadow-lg hover:shadow-purple-500/20"
                >
                  View Plans
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Tab bar */}
      <div className="mx-auto max-w-6xl px-3 sm:px-6 pt-4 sm:pt-6">
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5 w-full sm:w-fit overflow-x-auto">
          {([
            { key: "process", label: "Process", icon: "Zap" },
            { key: "history", label: "History", icon: "History" },
            { key: "stats", label: "Stats", icon: "BarChart3" },
            { key: "refer", label: "Refer & Earn", icon: "Gift" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                  : "text-slate-500 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab.key === "process" && <Zap className="h-3.5 w-3.5" />}
              {tab.key === "history" && <History className="h-3.5 w-3.5" />}
              {tab.key === "stats" && <BarChart3 className="h-3.5 w-3.5" />}
              {tab.key === "refer" && <Gift className="h-3.5 w-3.5" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "process" && (
      <div className="mx-auto max-w-6xl px-3 sm:px-6 py-4 sm:py-8">
        <div className="grid lg:grid-cols-[1fr_320px] gap-4 sm:gap-8">
          {/* Main area */}
          <div className="space-y-4 sm:space-y-6">
            {/* Upload zone */}
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="group cursor-pointer rounded-2xl border-2 border-dashed border-white/10 hover:border-purple-500/30 bg-white/[0.01] hover:bg-purple-500/[0.02] transition-all duration-300 p-6 sm:p-12 text-center"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(Array.from(e.target.files));
                }}
              />
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10 border border-purple-500/20 group-hover:bg-purple-500/15 transition-colors">
                <Upload className="h-6 w-6 text-purple-400" />
              </div>
              <p className="text-sm font-medium text-slate-300 mb-1">
                Drop videos here or click to upload
              </p>
              <p className="text-xs text-slate-600">
                MP4, MOV, AVI, MKV — up to 500MB per file
              </p>
            </div>

            {/* Video list */}
            {videos.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-300">
                    {videos.length} video{videos.length !== 1 ? "s" : ""}{" "}
                    {doneCount > 0 && (
                      <span className="text-purple-400">
                        &middot; {doneCount} done
                      </span>
                    )}
                  </h3>
                  <button
                    onClick={clearAll}
                    className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                  >
                    Clear all
                  </button>
                </div>

                {videos.map((vid) => (
                  <div
                    key={vid.id}
                    className={`relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-500 ${
                      vid.status === "processing"
                        ? "border-purple-500/30 bg-purple-500/[0.04] shadow-[0_0_20px_rgba(168,85,247,0.08)]"
                        : vid.status === "done"
                        ? "border-green-500/20 bg-green-500/[0.02]"
                        : vid.status === "error"
                        ? "border-red-500/20 bg-red-500/[0.02]"
                        : "border-white/5 bg-white/[0.02]"
                    }`}
                  >
                    {/* Icon / Progress ring */}
                    <div className="relative flex items-center justify-center flex-shrink-0">
                      {vid.status === "processing" ? (
                        <div className="relative">
                          <CircularProgress progress={vid.progress} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-purple-400">{vid.progress}%</span>
                          </div>
                        </div>
                      ) : vid.status === "done" ? (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20">
                          <Check className="h-5 w-5 text-green-400" />
                        </div>
                      ) : vid.status === "error" ? (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                          <X className="h-5 w-5 text-red-400" />
                        </div>
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 border border-white/10">
                          <FileVideo className="h-5 w-5 text-slate-500" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{vid.name}</p>
                      {vid.status === "processing" ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <ProcessingStepText progress={vid.progress} />
                          {vid.completedCopies !== undefined && (
                            <span className="text-[11px] text-slate-600">
                              · {vid.completedCopies}/{copies} clips
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600">{vid.size}</p>
                      )}
                      {vid.status === "processing" && (
                        <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 bg-[length:200%_100%] animate-shimmer shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                            style={{ width: `${vid.progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {vid.status === "done" && vid.outputs && (
                        <>
                          <button
                            onClick={() => setPreviewVid(vid)}
                            className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                          >
                            Preview
                          </button>
                          <span className="text-xs text-green-400 font-medium">
                            {vid.outputs.length} clip{vid.outputs.length !== 1 ? "s" : ""} ready
                          </span>
                        </>
                      )}
                      {vid.status === "error" && (
                        <span className="text-xs text-red-400">Failed</span>
                      )}
                      {vid.status === "pending" && (
                        <button
                          onClick={() => removeVideo(vid.id)}
                          className="text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Download all as zip — right below the video list */}
                {doneCount > 0 && (
                  <button
                    disabled={isZipping}
                    onClick={async () => {
                      setIsZipping(true);
                      try {
                        const zip = new JSZip();
                        const allOutputs: { url: string; filename: string }[] = [];
                        videos.forEach((v) => {
                          if (v.status === "done" && v.outputs) {
                            v.outputs.forEach((out) => allOutputs.push(out));
                          }
                        });

                        await Promise.all(
                          allOutputs.map(async (out) => {
                            const res = await fetch(out.url);
                            const blob = await res.blob();
                            zip.file(out.filename, blob);
                          })
                        );

                        const zipBlob = await zip.generateAsync({ type: "blob", compression: "STORE" });
                        const url = URL.createObjectURL(zipBlob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `uniq_${Date.now()}.zip`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(url), 5000);
                      } catch (err) {
                        console.error("Zip download failed:", err);
                      } finally {
                        setIsZipping(false);
                      }
                    }}
                    className="w-full py-3 rounded-xl font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-all flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isZipping ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Zipping...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Download all
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sidebar — settings */}
          <div className="space-y-6">
            {/* Metadata profile — redesigned with logos */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
              <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-purple-400" />
                Video Identity
              </h3>
              <p className="text-[11px] text-[--text-muted] mb-4">Choose how your video appears to platforms</p>

              {/* Profile cards grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {/* CapCut */}
                <button
                  onClick={() => {
                    const isSelected = metadata.includes("capcut");
                    if (isSelected) {
                      const next = metadata.filter((m) => m !== "capcut");
                      setMetadata(next.length === 0 ? ["random"] : next);
                    } else {
                      setMetadata([...metadata.filter((m) => m !== "random"), "capcut"]);
                    }
                  }}
                  className={`relative p-3 rounded-xl border text-left transition-all ${
                    metadata.includes("capcut")
                      ? "border-[#00d1ed]/40 bg-[#00d1ed]/10 ring-1 ring-[#00d1ed]/20"
                      : "border-white/5 bg-white/[0.01] hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-7 h-7 rounded-lg bg-black flex items-center justify-center border border-white/10 overflow-hidden">
                      <img src="/capcut-logo.svg" alt="" className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-[--text-primary]">CapCut</span>
                  </div>
                  <span className="text-[10px] text-[--text-muted] leading-tight block">Edited with CapCut</span>
                  {metadata.includes("capcut") && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-3.5 w-3.5 text-[#00d1ed]" />
                    </div>
                  )}
                  {metadata.includes("capcut") && metadata.length > 1 && !metadata.includes("random") && (
                    <span className="absolute bottom-2 right-2 text-[9px] font-bold text-[#00d1ed]/80 bg-[#00d1ed]/10 px-1.5 py-0.5 rounded">STACKED</span>
                  )}
                </button>

                {/* Snapchat */}
                <button
                  onClick={() => {
                    const isSelected = metadata.includes("snapchat");
                    if (isSelected) {
                      const next = metadata.filter((m) => m !== "snapchat");
                      setMetadata(next.length === 0 ? ["random"] : next);
                    } else {
                      setMetadata([...metadata.filter((m) => m !== "random"), "snapchat"]);
                    }
                  }}
                  className={`relative p-3 rounded-xl border text-left transition-all ${
                    metadata.includes("snapchat")
                      ? "border-[#FFFC00]/40 bg-[#FFFC00]/10 ring-1 ring-[#FFFC00]/20"
                      : "border-white/5 bg-white/[0.01] hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-7 h-7 rounded-lg bg-[#FFFC00] flex items-center justify-center overflow-hidden">
                      <img src="/snapchat-logo.svg" alt="" className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-[--text-primary]">Snapchat</span>
                  </div>
                  <span className="text-[10px] text-[--text-muted] leading-tight block">Recorded via Snap</span>
                  {metadata.includes("snapchat") && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-3.5 w-3.5 text-[#FFFC00]" />
                    </div>
                  )}
                  {metadata.includes("snapchat") && metadata.length > 1 && !metadata.includes("random") && (
                    <span className="absolute bottom-2 right-2 text-[9px] font-bold text-[#FFFC00]/80 bg-[#FFFC00]/10 px-1.5 py-0.5 rounded">STACKED</span>
                  )}
                </button>

                {/* iPhone */}
                <button
                  onClick={() => {
                    const isSelected = metadata.includes("iphone");
                    if (isSelected) {
                      const next = metadata.filter((m) => m !== "iphone");
                      setMetadata(next.length === 0 ? ["random"] : next);
                    } else {
                      setMetadata([...metadata.filter((m) => m !== "random"), "iphone"]);
                    }
                  }}
                  className={`relative p-3 rounded-xl border text-left transition-all ${
                    metadata.includes("iphone")
                      ? "border-[#a3a3a3]/40 bg-[#a3a3a3]/10 ring-1 ring-[#a3a3a3]/20"
                      : "border-white/5 bg-white/[0.01] hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-b from-[#555] to-[#333] flex items-center justify-center border border-white/10 overflow-hidden">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-[--text-primary]">iPhone</span>
                  </div>
                  <span className="text-[10px] text-[--text-muted] leading-tight block">Shot on iPhone</span>
                  {metadata.includes("iphone") && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-3.5 w-3.5 text-[#a3a3a3]" />
                    </div>
                  )}
                  {metadata.includes("iphone") && metadata.length > 1 && !metadata.includes("random") && (
                    <span className="absolute bottom-2 right-2 text-[9px] font-bold text-[#a3a3a3]/80 bg-[#a3a3a3]/10 px-1.5 py-0.5 rounded">STACKED</span>
                  )}
                </button>

                {/* Random */}
                <button
                  onClick={() => setMetadata(["random"])}
                  className={`relative p-3 rounded-xl border text-left transition-all ${
                    metadata.includes("random")
                      ? "border-purple-500/40 bg-purple-500/10 ring-1 ring-purple-500/20"
                      : "border-white/5 bg-white/[0.01] hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
                      <Shuffle className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-sm font-semibold text-[--text-primary]">Random</span>
                  </div>
                  <span className="text-[10px] text-[--text-muted] leading-tight block">Auto-selected per copy</span>
                  {metadata.includes("random") && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-3.5 w-3.5 text-purple-400" />
                    </div>
                  )}
                </button>
              </div>

              {/* Thumbnail randomisation toggle */}
              <div className="mt-4 pt-4 border-t border-white/5">
                <button
                  onClick={() =>
                    setEditSettings({
                      ...editSettings,
                      thumbnailRandomise: !editSettings.thumbnailRandomise,
                    })
                  }
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-sm transition-all ${
                    editSettings.thumbnailRandomise
                      ? "border-purple-500/30 bg-purple-500/10"
                      : "border-white/5 bg-white/[0.01] hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      editSettings.thumbnailRandomise ? "bg-purple-500/20" : "bg-white/5"
                    }`}>
                      <ImageIcon className={`h-3.5 w-3.5 ${editSettings.thumbnailRandomise ? "text-purple-400" : "text-slate-500"}`} />
                    </div>
                    <div className="text-left">
                      <span className={`font-medium block ${editSettings.thumbnailRandomise ? "text-[--text-primary]" : "text-[--text-secondary]"}`}>
                        Randomise Thumbnail
                      </span>
                      <span className="text-[10px] text-[--text-muted] block">Unique first-frame fingerprint</span>
                    </div>
                  </div>
                  <div className={`w-9 h-5 rounded-full transition-all relative ${
                    editSettings.thumbnailRandomise ? "bg-purple-500" : "bg-white/10"
                  }`}>
                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${
                      editSettings.thumbnailRandomise ? "left-[18px]" : "left-[3px]"
                    }`} />
                  </div>
                </button>
              </div>
            </div>

            {/* Edit settings */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Settings className="h-4 w-4 text-purple-400" />
                Edit Parameters
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-2">
                    Start Trim Range (seconds)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editSettings.trimMin}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "");
                        setEditSettings({ ...editSettings, trimMin: v === "" ? 0 : parseFloat(v) });
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editSettings.trimMax}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "");
                        setEditSettings({ ...editSettings, trimMax: v === "" ? 0 : parseFloat(v) });
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-500 block mb-2">
                    Number of Cuts (trims milliseconds at each point)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editSettings.cutsMin}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        setEditSettings({ ...editSettings, cutsMin: v === "" ? 0 : parseInt(v) });
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editSettings.cutsMax}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        setEditSettings({ ...editSettings, cutsMax: v === "" ? 0 : parseInt(v) });
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-500 block mb-2">
                    Zoom Range (%)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editSettings.zoomMin}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "");
                        setEditSettings({ ...editSettings, zoomMin: v === "" ? 0 : parseFloat(v) });
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editSettings.zoomMax}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "");
                        setEditSettings({ ...editSettings, zoomMax: v === "" ? 0 : parseFloat(v) });
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { key: "mirror", label: "Mirror (horizontal flip)" },
                    { key: "grain", label: "Film grain" },
                    { key: "sharpen", label: "Sharpen" },
                  ].map((toggle) => (
                    <label
                      key={toggle.key}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="text-sm text-slate-400">{toggle.label}</span>
                      <button
                        onClick={() =>
                          setEditSettings({
                            ...editSettings,
                            [toggle.key]:
                              !editSettings[toggle.key as keyof typeof editSettings],
                          })
                        }
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          editSettings[toggle.key as keyof typeof editSettings]
                            ? "bg-purple-600"
                            : "bg-white/10"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                            editSettings[toggle.key as keyof typeof editSettings]
                              ? "translate-x-4"
                              : ""
                          }`}
                        />
                      </button>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="text-xs text-slate-500 block mb-2">
                    Copies per video
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={copiesInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      setCopiesInput(raw);
                      const num = parseInt(raw);
                      if (!isNaN(num) && num >= 1 && num <= 100) {
                        setCopies(num);
                      }
                    }}
                    onBlur={() => {
                      const num = parseInt(copiesInput);
                      if (isNaN(num) || num < 1) {
                        setCopies(1);
                        setCopiesInput("1");
                      } else if (num > 100) {
                        setCopies(100);
                        setCopiesInput("100");
                      } else {
                        setCopies(num);
                        setCopiesInput(String(num));
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Overall progress during processing */}
            {isProcessing && (() => {
              const done = videos.filter((v) => v.status === "done").length;
              const total = videos.filter((v) => v.status !== "error").length;
              const pct = Math.round((done / Math.max(1, total)) * 100);
              return (
                <div className="relative rounded-2xl overflow-hidden">
                  {/* Animated gradient border */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-indigo-600 bg-[length:300%_100%] animate-shimmer opacity-40" />
                  <div className="relative m-[1px] rounded-2xl bg-[#0a0a1a] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Zap className="h-5 w-5 text-purple-400" />
                          </div>
                          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75 animate-ping" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500" />
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Processing videos</p>
                          <p className="text-xs text-slate-500">{done} of {total} complete</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
                          {pct}%
                        </p>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 bg-[length:200%_100%] animate-shimmer shadow-[0_0_16px_rgba(168,85,247,0.5)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Process button */}
            <button
              onClick={processAll}
              disabled={pendingCount === 0 || isProcessing || credits < pendingCount * copies}
              className={`w-full py-3.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                pendingCount > 0 && !isProcessing && credits >= pendingCount * copies
                  ? "bg-purple-600 hover:bg-purple-700 text-white hover:shadow-lg hover:shadow-purple-500/20"
                  : "bg-white/5 text-slate-600 cursor-not-allowed"
              }`}
            >
              {isProcessing ? (
                <div className="flex items-center gap-3">
                  <div className="relative h-5 w-5">
                    <div className="absolute inset-0 rounded-full border-2 border-purple-400/30" />
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-purple-400 animate-spin" />
                  </div>
                  <span className="text-slate-400">Processing — do not close this tab</span>
                </div>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  {pendingCount > 0
                    ? `Generate ${pendingCount * copies} video${pendingCount * copies !== 1 ? "s" : ""}`
                    : "Process videos"}
                  {pendingCount > 0 && (
                    <span className="text-purple-300 text-xs">
                      ({pendingCount * copies} credit{pendingCount * copies !== 1 ? "s" : ""})
                    </span>
                  )}
                </>
              )}
            </button>
            {pendingCount > 0 && !isProcessing && credits < pendingCount * copies && (
              <p className="text-xs text-red-400 text-center mt-2">
                Not enough credits — you need {pendingCount * copies} but have {credits}.{" "}
                <button onClick={() => setShowPlans(true)} className="underline text-purple-400 hover:text-purple-300">
                  Get more credits
                </button>
              </p>
            )}

          </div>
        </div>
      </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <History className="h-4 w-4 text-purple-400" />
                Processing History
              </h2>
            </div>
            {historyJobs.length === 0 ? (
              <div className="p-12 text-center">
                <History className="h-8 w-8 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No processing history yet</p>
                <p className="text-xs text-slate-600 mt-1">Videos you process will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {historyJobs.map((job: any) => (
                  <div key={job.id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10 border border-green-500/20 flex-shrink-0">
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{job.fileName}</p>
                        <p className="text-xs text-slate-600">
                          {new Date(job.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {job.copies} {job.copies === 1 ? "copy" : "copies"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats tab */}
      {activeTab === "stats" && (
        <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
          {!usageData ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
            </div>
          ) : (usageData.totalJobs ?? 0) === 0 ? (
            <div className="text-center py-16">
              <BarChart3 className="h-10 w-10 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No usage data yet</p>
              <p className="text-xs text-slate-600 mt-1">Process some videos to see your stats here</p>
            </div>
          ) : (
            <>
              {/* Metric cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <p className="text-xs text-slate-500 mb-1">Videos Processed</p>
                  <p className="text-3xl font-bold text-white">{usageData.totalJobs ?? 0}</p>
                  <p className="text-xs text-slate-600 mt-1">last 30 days</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <p className="text-xs text-slate-500 mb-1">Unique Copies</p>
                  <p className="text-3xl font-bold text-purple-400">{usageData.totalCopies ?? 0}</p>
                  <p className="text-xs text-slate-600 mt-1">last 30 days</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <p className="text-xs text-slate-500 mb-1">Credits Used</p>
                  <p className="text-3xl font-bold text-white">{usageData.totalCopies ?? 0}</p>
                  <p className="text-xs text-slate-600 mt-1">last 30 days</p>
                </div>
              </div>

              {/* Activity chart */}
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                <h3 className="text-xs font-medium text-slate-500 mb-5">Daily Activity</h3>
                <div className="h-44 flex items-end gap-[3px]">
                  {(usageData.daily || []).slice(-14).map((d: any, i: number) => {
                    const days14 = (usageData.daily || []).slice(-14);
                    const max = Math.max(...days14.map((x: any) => x.copies || 0), 1);
                    const h = ((d.copies || 0) / max) * 100;
                    const isToday = d.date === new Date().toISOString().split("T")[0];
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                        <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                          {d.copies || 0}
                        </span>
                        <div
                          className={`w-full rounded-md transition-colors ${isToday ? "bg-purple-500 hover:bg-purple-400" : "bg-purple-500/30 hover:bg-purple-500/50"}`}
                          style={{ height: `${Math.max(h, 4)}%` }}
                          title={`${new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ${d.copies} copies`}
                        />
                        <span className={`text-[10px] whitespace-nowrap ${isToday ? "text-purple-400 font-medium" : "text-slate-600"} ${i % 2 === 0 ? "" : "invisible"}`}>
                          {new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Refer & Earn tab */}
      {activeTab === "refer" && (
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="max-w-lg mx-auto space-y-6">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                <Gift className="h-7 w-7 text-purple-400" />
              </div>
              <h2 className="text-lg font-bold mb-2">Refer & Earn Credits</h2>
              <p className="text-sm text-slate-400 mb-6">
                Share your referral code. When someone signs up with it, you both get <span className="text-purple-400 font-semibold">50 free credits</span>!
              </p>

              {!referralData ? (
                <Loader2 className="h-6 w-6 text-purple-400 animate-spin mx-auto" />
              ) : (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 mb-4">
                    <code className="flex-1 text-sm font-mono text-purple-300 select-all">{referralData.code}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(referralData.code);
                        setReferralCopied(true);
                        setTimeout(() => setReferralCopied(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-all flex items-center gap-1.5"
                    >
                      {referralCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {referralCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                      <p className="text-xl font-bold text-white">{referralData.totalReferred ?? 0}</p>
                      <p className="text-xs text-slate-500 mt-1">People referred</p>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                      <p className="text-xl font-bold text-purple-400">{(referralData.totalReferred ?? 0) * 50}</p>
                      <p className="text-xs text-slate-500 mt-1">Credits earned</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Before/after preview modal */}
      {previewVid && previewVid.outputs && previewVid.outputs.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#010313] p-6 relative">
            <button
              onClick={() => setPreviewVid(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-sm font-semibold mb-4">Before / After Preview</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-2">Original</p>
                <video
                  src={URL.createObjectURL(previewVid.file)}
                  controls
                  className="w-full rounded-xl border border-white/10"
                />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-2">Processed</p>
                <video
                  src={previewVid.outputs[0].url}
                  controls
                  className="w-full rounded-xl border border-white/10"
                />
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Plans modal */}
      {/* Low credits popup */}
      {showLowCredits && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#010313] p-8 relative text-center">
            <button
              onClick={() => setShowLowCredits(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Zap className="h-7 w-7 text-amber-400" />
            </div>
            <h2 className="text-lg font-bold mb-2">Running low on credits</h2>
            <p className="text-sm text-slate-400 mb-6">
              You have <span className="text-white font-semibold">{credits}</span> credit{credits !== 1 ? "s" : ""} remaining. Top up or subscribe to keep generating.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowLowCredits(false); setShowTopUp(true); }}
                className={`${isTeamMember ? "w-full" : "flex-1"} py-3 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all`}
              >
                Top Up Credits
              </button>
              {!isTeamMember && (
              <button
                onClick={() => { setShowLowCredits(false); setShowPlans(true); }}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition-all"
              >
                View Plans
              </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showPlans && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#010313] p-4 sm:p-8 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowPlans(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                <Crown className="h-6 w-6 text-purple-400" />
              </div>
              <h2 className="text-xl font-bold">Choose a Plan</h2>
              <p className="text-sm text-slate-500 mt-1">
                Subscribe monthly and save on every credit
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {[
                { key: "starter", label: "Starter", credits: "100", price: "24", icon: "\u2728" },
                { key: "growth", label: "Growth", credits: "500", price: "75", icon: "\u2728" },
                { key: "pro", label: "Pro", credits: "1,500", price: "150", icon: "\u2b50" },
                { key: "business", label: "Business", credits: "5,000", price: "350", icon: "\ud83c\udfe2" },
                { key: "agency", label: "Agency", credits: "15,000", price: "750", icon: "\ud83d\udc51" },
              ].filter((p) => (planRank[p.key] ?? 0) > currentRank).map((p) => (
                <button
                  type="button"
                  key={p.key}
                  disabled={subscribingPlan === p.key}
                  onClick={async () => {
                    setSubscribingPlan(p.key);
                    try {
                      const res = await fetch("/api/stripe/subscribe", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ planKey: p.key }),
                      });
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else {
                        addToast(data.error || "Failed to start checkout", "error");
                        setSubscribingPlan(null);
                      }
                    } catch {
                      addToast("Failed to connect to payment service", "error");
                      setSubscribingPlan(null);
                    }
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-purple-500/30 hover:bg-purple-500/[0.03] transition-all text-left cursor-pointer disabled:opacity-50"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{p.label}</div>
                    <div className="text-xs text-slate-500">{p.credits} credits/mo</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">£{p.price}/mo</span>
                    {subscribingPlan === p.key ? (
                      <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                    ) : (
                      <span className="text-xs font-medium text-purple-400">Subscribe →</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {plan === "agency" && (
              <div className="text-center py-6 text-sm text-slate-400">
                You&apos;re on the top plan — Agency with 15,000 credits/mo.
              </div>
            )}

            <button
              onClick={() => setShowPlans(false)}
              className="w-full py-3 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Top-up credits modal */}
      {showTopUp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#010313] p-4 sm:p-8 relative max-h-[90vh] overflow-y-auto">
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
                    } catch (err) {
                      console.error("Checkout error:", err);
                      addToast("Failed to connect to payment service", "error");
                    }
                  }}
                  className="group p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-purple-500/30 hover:bg-purple-500/[0.03] transition-all text-left cursor-pointer relative z-10"
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

            {!isTeamMember && (
            <p className="text-[11px] text-slate-600 text-center mb-4">
              All top-ups at 26p per credit. Save more with a plan — from 5p/credit on higher tiers.
            </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowTopUp(false)}
                className={`${isTeamMember ? "w-full" : "flex-1"} py-3 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all`}
              >
                Cancel
              </button>
              {!isTeamMember && (
              <a
                href="/account"
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white text-center transition-all hover:shadow-lg hover:shadow-purple-500/20"
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

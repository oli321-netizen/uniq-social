"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  X,
  Loader2,
  Check,
  Zap,
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
} from "lucide-react";
import ProcessView from "@/components/hub/ProcessView";

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
  durationSec?: number;
  chips?: string[];
};

type MetadataProfile = "capcut" | "snapchat" | "iphone" | "random";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function probeDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });
}

function changeChips(
  settings: {
    trimMin: number;
    trimMax: number;
    hiddenEmoji: boolean;
    speedShift: boolean;
    cropOffset: boolean;
    hueShift: boolean;
    thumbnailRandomise: boolean;
    mirror: boolean;
    grain: boolean;
    sharpen: boolean;
  },
  profiles: string[]
) {
  const chips: string[] = profiles.map((name) =>
    name === "capcut" ? "CapCut" : name === "snapchat" ? "Snapchat" : name === "iphone" ? "iPhone" : "Random"
  );
  if (settings.hiddenEmoji) chips.push("Hidden overlay");
  if (settings.speedShift) chips.push("Speed shift");
  if (settings.cropOffset) chips.push("Crop offset");
  if (settings.hueShift) chips.push("Hue shift");
  if (settings.thumbnailRandomise) chips.push("Thumbnail");
  if (settings.mirror) chips.push("Mirror");
  if (settings.grain) chips.push("Grain");
  if (settings.sharpen) chips.push("Sharpen");
  chips.push(`Trim ${settings.trimMin}–${settings.trimMax}s`);
  return chips;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [metadata, setMetadata] = useState<MetadataProfile[]>(["random"]);
  const [copies, setCopies] = useState(1);
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
  const [activeTab, setActiveTab] = useState<"process" | "history" | "stats" | "refer" | "duplicates">("process");
  const [duplicateData, setDuplicateData] = useState<any>(null);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [historyJobs, setHistoryJobs] = useState<any[]>([]);
  const [usageData, setUsageData] = useState<any>(null);
  const [referralData, setReferralData] = useState<any>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const { addToast } = useToast();
  const [previewVid, setPreviewVid] = useState<VideoFile | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showProcessMore, setShowProcessMore] = useState(false);

  // Captions state
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionWords, setCaptionWords] = useState<{ word: string; start: number; end: number }[]>([]);
  const [captionText, setCaptionText] = useState("");
  const [captionStyle, setCaptionStyle] = useState<"classic" | "word" | "karaoke">("classic");
  const [captionPosition, setCaptionPosition] = useState<"bottom" | "center" | "top">("bottom");
  const [captionFontSize, setCaptionFontSize] = useState(24);
  const [captionAllCaps, setCaptionAllCaps] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [captionVariants, setCaptionVariants] = useState<string[]>([]);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [showCaptionSettings, setShowCaptionSettings] = useState(false);

  // Edit parameter ranges
  const [editSettings, setEditSettings] = useState({
    trimMin: 0.05,
    trimMax: 0.15,
    cutsMin: 2,
    cutsMax: 5,
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
        window.dispatchEvent(new Event("uniq-credits"));
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
    } else if (activeTab === "duplicates") {
      setDuplicatesLoading(true);
      fetch("/api/duplicates").then(r => r.json()).then(d => { setDuplicateData(d); setDuplicatesLoading(false); }).catch(() => setDuplicatesLoading(false));
    }
  }, [activeTab, status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0b14] flex items-center justify-center">
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
      status: "pending" as const,
      progress: 0,
      chips: changeChips(editSettings, metadata),
    }));
    setVideos((prev) => [...prev, ...newVids]);
    newVids.forEach((vid) => {
      probeDuration(vid.file).then((durationSec) => {
        setVideos((prev) => prev.map((item) => (item.id === vid.id ? { ...item, durationSec } : item)));
      });
    });
  };

  const removeVideo = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  const clearAll = () => setVideos([]);

  // Transcribe video for captions
  const transcribeVideo = async () => {
    const firstVideo = videos.find((v) => v.status === "pending" || v.status === "done");
    if (!firstVideo) {
      addToast("Upload a video first", "error");
      return;
    }
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("video", firstVideo.file);
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Transcription failed");
      }
      const data = await res.json();
      setCaptionText(data.text || "");
      setCaptionWords(
        (data.words || []).map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        }))
      );
      setCaptionsEnabled(true);
      setShowCaptionSettings(true);
      addToast("Transcription complete", "success");
    } catch (err: any) {
      addToast(err.message || "Transcription failed", "error");
    } finally {
      setIsTranscribing(false);
    }
  };

  // Generate caption variants with AI
  const generateVariants = async () => {
    if (!captionText) {
      addToast("Transcribe a video first", "error");
      return;
    }
    setIsGeneratingVariants(true);
    try {
      const res = await fetch("/api/caption-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: captionText }),
      });
      if (!res.ok) throw new Error("Failed to generate variants");
      const data = await res.json();
      setCaptionVariants(data.variants || []);
      addToast(`${(data.variants || []).length} variants generated`, "success");
    } catch (err: any) {
      addToast(err.message || "Failed to generate variants", "error");
    } finally {
      setIsGeneratingVariants(false);
    }
  };

  const processVideo = async (vid: VideoFile, copyIndex: number, retries = 2): Promise<{ url: string; filename: string }> => {
    const formData = new FormData();
    formData.append("video", vid.file);
    formData.append(
      "config",
      JSON.stringify({
        ...editSettings,
        metadata: metadata.length === 1 ? metadata[0] : metadata,
        ...(captionsEnabled && captionWords.length > 0 ? {
          captions: {
            enabled: true,
            words: captionWords,
            text: captionText,
            style: captionStyle,
            position: captionPosition,
            fontSize: captionFontSize,
            allCaps: captionAllCaps,
          },
        } : {}),
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

        const rawBlob = await res.blob();
        // Force video/mp4 MIME type so OS treats it as a video, not a document
        const blob = new Blob([rawBlob], { type: "video/mp4" });
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
              v.id === vid.id ? { ...v, status: "processing", progress: 5, chips: v.chips?.length ? v.chips : changeChips(editSettings, metadata) } : v
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
    setShowProcessMore(true);
  };

  const clearCompleted = () => {
    setVideos((prev) => prev.filter((v) => v.status !== "done" && v.status !== "error"));
    setShowProcessMore(false);
  };

  const pendingCount = videos.filter((v) => v.status === "pending").length;
  const doneCount = videos.filter((v) => v.status === "done").length;

  return (
    <div className="bg-[#0a0b14] text-[#e7e8ee]">
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
            { key: "duplicates", label: "Duplicates", icon: "Search" },
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
              {tab.key === "duplicates" && <Search className="h-3.5 w-3.5" />}
              {tab.key === "stats" && <BarChart3 className="h-3.5 w-3.5" />}
              {tab.key === "refer" && <Gift className="h-3.5 w-3.5" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "process" && (
        <ProcessView
          videos={videos}
          settings={editSettings}
          setSettings={setEditSettings}
          metadata={metadata}
          setMetadata={setMetadata}
          copies={copies}
          setCopies={setCopies}
          fileRef={fileInputRef}
          onDrop={onDrop}
          addFiles={addFiles}
          removeVideo={removeVideo}
          clearAll={clearAll}
          processAll={processAll}
          isProcessing={isProcessing}
          pendingCount={pendingCount}
          doneCount={doneCount}
          credits={credits}
          selectedRows={selectedRows}
          setSelectedRows={setSelectedRows}
          onPreview={(video, index) => { setPreviewIndex(index); setPreviewVid(video); }}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          showProcessMore={showProcessMore}
          clearCompleted={clearCompleted}
          onNeedCredits={() => setShowPlans(true)}
          captionsEnabled={captionsEnabled}
          setCaptionsEnabled={setCaptionsEnabled}
          captionText={captionText}
          captionStyle={captionStyle}
          setCaptionStyle={setCaptionStyle}
          captionPosition={captionPosition}
          setCaptionPosition={setCaptionPosition}
          captionFontSize={captionFontSize}
          setCaptionFontSize={setCaptionFontSize}
          captionAllCaps={captionAllCaps}
          setCaptionAllCaps={setCaptionAllCaps}
          isTranscribing={isTranscribing}
          transcribeVideo={transcribeVideo}
          captionVariants={captionVariants}
          isGeneratingVariants={isGeneratingVariants}
          generateVariants={generateVariants}
          showCaptionSettings={showCaptionSettings}
          setShowCaptionSettings={setShowCaptionSettings}
          hasVideos={videos.length > 0}
        />
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
      {activeTab === "duplicates" && (
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Search className="h-5 w-5 text-purple-400" />
                    Duplicate Checker
                  </h3>
                  <p className="text-sm text-[--text-muted] mt-1">
                    Scans all processed videos to find copies that are too similar to each other
                  </p>
                </div>
                <button
                  onClick={() => {
                    setDuplicatesLoading(true);
                    fetch("/api/duplicates").then(r => r.json()).then(d => { setDuplicateData(d); setDuplicatesLoading(false); }).catch(() => setDuplicatesLoading(false));
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition-all flex items-center gap-2"
                >
                  {duplicatesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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
                  {/* Summary stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 text-center">
                      <div className="text-2xl font-bold text-[--text-primary]">{duplicateData.totalVideos}</div>
                      <div className="text-xs text-[--text-muted] mt-1">Total Processed</div>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 text-center">
                      <div className="text-2xl font-bold text-[--text-primary]">{duplicateData.uniqueSources}</div>
                      <div className="text-xs text-[--text-muted] mt-1">Unique Sources</div>
                    </div>
                    <div className={`rounded-xl border p-4 text-center ${
                      duplicateData.duplicateGroups > 0
                        ? "bg-red-500/5 border-red-500/20"
                        : "bg-green-500/5 border-green-500/20"
                    }`}>
                      <div className={`text-2xl font-bold ${
                        duplicateData.duplicateGroups > 0 ? "text-red-400" : "text-green-400"
                      }`}>
                        {duplicateData.duplicateGroups}
                      </div>
                      <div className="text-xs text-[--text-muted] mt-1">Duplicate Groups</div>
                    </div>
                  </div>

                  {/* Duplicate groups */}
                  {duplicateData.duplicateGroups === 0 ? (
                    <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-6 text-center">
                      <Check className="h-8 w-8 text-green-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-green-400">All clear — no duplicate copies detected</p>
                      <p className="text-xs text-[--text-muted] mt-1">Every processed video has unique enough parameters</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {duplicateData.groups.map((group: any, gi: number) => (
                        <div key={gi} className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-400" />
                                <span className="text-sm font-medium text-[--text-primary]">{group.fileName}</span>
                              </div>
                              <span className="text-xs text-[--text-muted]">
                                {group.copies} copies — {group.duplicates.length} similar pair{group.duplicates.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <span className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded-full">
                              {group.sourceHash}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {group.duplicates.map((dup: any, di: number) => (
                              <div key={di} className="rounded-lg bg-white/[0.03] p-3 text-xs">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-red-300 font-medium">{dup.similarity}% similar</span>
                                  <span className="text-[--text-muted]">
                                    {new Date(dup.date1).toLocaleDateString()} vs {new Date(dup.date2).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {dup.details.map((d: string, k: number) => (
                                    <span key={k} className="bg-red-500/10 text-red-300 px-2 py-0.5 rounded text-[10px]">
                                      {d}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0a0b14] p-6 relative">
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
                  src={previewVid.outputs[Math.min(previewIndex, previewVid.outputs.length - 1)].url}
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
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0b14] p-8 relative text-center">
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
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0a0b14] p-4 sm:p-8 relative max-h-[90vh] overflow-y-auto">
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
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a0b14] p-4 sm:p-8 relative max-h-[90vh] overflow-y-auto">
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

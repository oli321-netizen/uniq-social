"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Fingerprint,
  X,
  Download,
  Loader2,
  FileVideo,
  Check,
  Sparkles,
  Settings,
  LogOut,
  Zap,
  Plus,
  ShoppingCart,
  Mail,
  Crown,
  ArrowRight,
} from "lucide-react";
import JSZip from "jszip";

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
};

type MetadataProfile = "capcut" | "snapchat" | "iphone" | "random";

const METADATA_PROFILES: { value: MetadataProfile; label: string; desc: string }[] = [
  { value: "capcut", label: "CapCut", desc: "Video edited with CapCut" },
  { value: "snapchat", label: "Snapchat", desc: "Recorded via Snapchat" },
  { value: "iphone", label: "iPhone Camera", desc: "Shot on iPhone" },
  { value: "random", label: "Random", desc: "Randomly selected per video" },
];

const STACKABLE_PROFILES: MetadataProfile[] = ["capcut", "snapchat", "iphone"];

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
  const [showPlans, setShowPlans] = useState(false);
  const [showLowCredits, setShowLowCredits] = useState(false);
  const lowCreditsShownRef = useRef(false);
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null);
  const outOfCreditsRef = useRef(false);
  const planRank: Record<string, number> = { free: 0, starter: 1, growth: 2, pro: 3, business: 4, agency: 5 };
  const currentRank = planRank[plan] ?? 0;
  const [isZipping, setIsZipping] = useState(false);

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

  // Fetch credits
  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/credits")
        .then((r) => r.json())
        .then((d) => {
          setCredits(d.credits ?? 0);
          setPlan(d.plan ?? "free");
          setCreditsLoaded(true);
          setEmailVerified(d.emailVerified !== false);
        })
        .catch(() => {});
    }
  }, [status]);

  // Show low-credits popup when balance gets low (once per session)
  useEffect(() => {
    if (creditsLoaded && credits <= 20 && credits >= 0 && !lowCreditsShownRef.current) {
      lowCreditsShownRef.current = true;
      setShowLowCredits(true);
    }
  }, [credits, creditsLoaded]);

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
              ? { ...v, progress: Math.round((completedCopies / copies) * 90) + 10 }
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
      alert(`Not enough credits. You need ${totalNeeded} but only have ${credits}.`);
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

    // Refresh credits
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => { setCredits(d.credits ?? 0); setPlan(d.plan ?? "free"); })
      .catch(() => {});

    setIsProcessing(false);
  };

  const pendingCount = videos.filter((v) => v.status === "pending").length;
  const doneCount = videos.filter((v) => v.status === "done").length;

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
            <span className="text-xs text-slate-600">Dashboard</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Zap className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-sm font-medium text-purple-300">
                {credits} credits
              </span>
            </div>
            <button
              onClick={() => setShowTopUp(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-all hover:shadow-lg hover:shadow-purple-500/20"
            >
              <Plus className="h-3 w-3" />
              Buy Credits
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
          <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-amber-400" />
              <p className="text-sm text-amber-200">
                Please verify your email address to keep your account secure.
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


      {/* Upgrade banner for free users */}
      {plan === "free" && (
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-500/[0.08] to-purple-600/[0.04] p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <Crown className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Upgrade your plan</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Get monthly credits from £24/mo — save up to 80% vs top-ups
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowTopUp(true)}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all"
                >
                  Top Up Credits
                </button>
                <button
                  onClick={() => setShowPlans(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white transition-all hover:shadow-lg hover:shadow-purple-500/20"
                >
                  View Plans
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Main area */}
          <div className="space-y-6">
            {/* Upload zone */}
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="group cursor-pointer rounded-2xl border-2 border-dashed border-white/10 hover:border-purple-500/30 bg-white/[0.01] hover:bg-purple-500/[0.02] transition-all duration-300 p-12 text-center"
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
                    className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02]"
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${
                        vid.status === "done"
                          ? "bg-green-500/10 border border-green-500/20"
                          : vid.status === "processing"
                          ? "bg-purple-500/10 border border-purple-500/20"
                          : "bg-white/5 border border-white/10"
                      }`}
                    >
                      {vid.status === "done" ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : vid.status === "processing" ? (
                        <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                      ) : (
                        <FileVideo className="h-4 w-4 text-slate-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{vid.name}</p>
                      <p className="text-xs text-slate-600">{vid.size}</p>
                      {vid.status === "processing" && (
                        <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full transition-all duration-300"
                            style={{ width: `${vid.progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {vid.status === "done" && vid.outputs && (
                        <span className="text-xs text-green-400 font-medium">
                          {vid.outputs.length} clip{vid.outputs.length !== 1 ? "s" : ""} ready
                        </span>
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
            {/* Metadata profile */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-400" />
                Metadata Profile
              </h3>
              <p className="text-[11px] text-slate-600 mb-3">Select multiple to stack metadata together</p>
              <div className="space-y-2">
                {METADATA_PROFILES.map((profile) => {
                  const isSelected = metadata.includes(profile.value);
                  const isStackable = STACKABLE_PROFILES.includes(profile.value);

                  return (
                    <button
                      key={profile.value}
                      onClick={() => {
                        if (profile.value === "random") {
                          setMetadata(["random"]);
                        } else {
                          let next: MetadataProfile[];
                          if (isSelected) {
                            next = metadata.filter((m) => m !== profile.value);
                            if (next.length === 0) next = ["random"];
                          } else {
                            next = [...metadata.filter((m) => m !== "random"), profile.value];
                          }
                          setMetadata(next);
                        }
                      }}
                      className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                        isSelected
                          ? "border-purple-500/30 bg-purple-500/10 text-white"
                          : "border-white/5 bg-white/[0.01] text-slate-400 hover:border-white/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{profile.label}</span>
                        {isSelected && isStackable && metadata.length > 1 && (
                          <span className="text-[10px] font-medium text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                            STACKED
                          </span>
                        )}
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-purple-400" />
                        )}
                      </div>
                      <span className="text-xs text-slate-600 block mt-0.5">
                        {profile.desc}
                      </span>
                    </button>
                  );
                })}
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
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
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
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all"
              >
                Top Up Credits
              </button>
              <button
                onClick={() => { setShowLowCredits(false); setShowPlans(true); }}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition-all"
              >
                View Plans
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlans && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#010313] p-8 relative max-h-[90vh] overflow-y-auto">
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
                        alert(data.error || "Failed to start checkout");
                        setSubscribingPlan(null);
                      }
                    } catch {
                      alert("Failed to connect to payment service");
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
                        alert(data.error || "Failed to start checkout");
                      }
                    } catch (err) {
                      console.error("Checkout error:", err);
                      alert("Failed to connect to payment service");
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
                href="/account"
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

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
} from "lucide-react";

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
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [credits, setCredits] = useState(0);
  const [showTopUp, setShowTopUp] = useState(false);

  // Edit parameter ranges
  const [editSettings, setEditSettings] = useState({
    trimMin: 0.3,
    trimMax: 0.7,
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

  const processVideo = async (vid: VideoFile, copyIndex: number) => {
    const formData = new FormData();
    formData.append("video", vid.file);
    formData.append(
      "config",
      JSON.stringify({
        ...editSettings,
        metadata: metadata.length === 1 ? metadata[0] : metadata,
      })
    );

    const res = await fetch("/api/process", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Processing failed: ${res.statusText}`);
    }

    const blob = await res.blob();
    const ext = vid.name.split(".").pop() || "mp4";
    const suffix = copies > 1 ? `_v${copyIndex + 1}` : "";
    const filename = vid.name.replace(`.${ext}`, `_uniq${suffix}.mp4`);
    const url = URL.createObjectURL(blob);
    return { url, filename };
  };

  const processAll = async () => {
    setIsProcessing(true);
    const pendingVids = videos.filter((v) => v.status === "pending");

    for (const vid of pendingVids) {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === vid.id ? { ...v, status: "processing", progress: 10 } : v
        )
      );

      try {
        const results: { url: string; filename: string }[] = [];

        for (let c = 0; c < copies; c++) {
          setVideos((prev) =>
            prev.map((v) =>
              v.id === vid.id
                ? { ...v, progress: Math.round(((c + 0.5) / copies) * 90) + 10 }
                : v
            )
          );

          const result = await processVideo(vid, c);
          results.push(result);
        }

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
      } catch {
        setVideos((prev) =>
          prev.map((v) =>
            v.id === vid.id ? { ...v, status: "error", progress: 0 } : v
          )
        );
      }
    }
    // Refresh credits
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => setCredits(d.credits ?? 0))
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
                        <div className="flex items-center gap-2">
                          {vid.outputs.map((out, idx) => (
                            <a
                              key={idx}
                              href={out.url}
                              download={out.filename}
                              className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {vid.outputs!.length > 1 ? `v${idx + 1}` : "Download"}
                            </a>
                          ))}
                        </div>
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
                      type="number"
                      step="0.1"
                      value={editSettings.trimMin}
                      onChange={(e) =>
                        setEditSettings({ ...editSettings, trimMin: +e.target.value })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={editSettings.trimMax}
                      onChange={(e) =>
                        setEditSettings({ ...editSettings, trimMax: +e.target.value })
                      }
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
                      type="number"
                      step="0.5"
                      value={editSettings.zoomMin}
                      onChange={(e) =>
                        setEditSettings({ ...editSettings, zoomMin: +e.target.value })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={editSettings.zoomMax}
                      onChange={(e) =>
                        setEditSettings({ ...editSettings, zoomMax: +e.target.value })
                      }
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
                    type="number"
                    min="1"
                    max="20"
                    value={copies}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1) setCopies(val);
                      if (e.target.value === "") setCopies(1);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Process button */}
            <button
              onClick={processAll}
              disabled={pendingCount === 0 || isProcessing}
              className={`w-full py-3.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                pendingCount > 0 && !isProcessing
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
                  Process {pendingCount > 0 ? `${pendingCount} video${pendingCount !== 1 ? "s" : ""}` : "videos"}
                  {pendingCount > 0 && (
                    <span className="text-purple-300 text-xs">
                      ({pendingCount * copies} credits)
                    </span>
                  )}
                </>
              )}
            </button>

            {/* Download all */}
            {doneCount > 0 && (
              <button
                onClick={() => {
                  videos.forEach((v) => {
                    if (v.status === "done" && v.outputs) {
                      v.outputs.forEach((out) => {
                        const a = document.createElement("a");
                        a.href = out.url;
                        a.download = out.filename;
                        a.click();
                      });
                    }
                  });
                }}
                className="w-full py-3 rounded-xl font-medium text-sm bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download all ({doneCount})
              </button>
            )}
          </div>
        </div>
      </div>

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

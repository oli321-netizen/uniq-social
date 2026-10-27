"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import type { CreatorDTO, HookDTO } from "@/lib/serialize";
import CaptionStudio from "@/components/hub/CaptionStudio";
import QuickUpload from "@/components/hub/QuickUpload";

const TABS = ["Hook Lab", "Captions", "Reframe", "B-roll", "Metrics"] as const;
type Tab = (typeof TABS)[number];

const SAMPLE = [
  { label: "Views", value: "128.7K", delta: "+24%", note: "Top 3%", winner: true, points: [20, 24, 22, 28, 30, 29, 34, 40, 38, 44, 48, 52] },
  { label: "Watch time (avg)", value: "00:01:42", delta: "+18%", note: "Top 8%", winner: false, points: [12, 14, 13, 16, 18, 17, 19, 18, 21, 22, 20, 24] },
  { label: "Hook rate", value: "74%", delta: "+12%", note: "Top 6%", winner: false, points: [40, 42, 41, 44, 48, 46, 50, 52, 51, 55, 54, 58] },
  { label: "Share rate", value: "2.9%", delta: "+9%", note: "Top 11%", winner: false, points: [8, 9, 8, 10, 11, 10, 12, 11, 13, 12, 14, 15] },
];

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="text-[11px] text-[#8A8A9A]">No estimate curve</span>;
  const w = 96;
  const h = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24" aria-hidden>
      <path d={d} fill="none" stroke="#8B5CF6" strokeWidth="1.6" />
    </svg>
  );
}

function formatWatch(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function HookLab() {
  const search = useSearchParams();
  const initialCreator = search.get("creator") || "";
  const [tab, setTab] = useState<Tab>("Hook Lab");
  const [creators, setCreators] = useState<CreatorDTO[]>([]);
  const [creatorId, setCreatorId] = useState(initialCreator);
  const [hooks, setHooks] = useState<HookDTO[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [transcript, setTranscript] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCreator, setNewCreator] = useState("");
  const [draft, setDraft] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clock, setClock] = useState("00:00:00");

  async function loadCreators() {
    const res = await fetch("/api/creators");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load creators.");
    setCreators(data.creators);
    setCreatorId((current) => current || data.creators[0]?.id || "");
  }

  async function loadHooks(id: string) {
    const query = id ? `?creatorId=${encodeURIComponent(id)}` : "";
    const res = await fetch(`/api/hooks${query}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load hooks.");
    setHooks(data.hooks);
    setSelectedId((current) => current || data.hooks[0]?.id || null);
  }

  useEffect(() => {
    loadCreators().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadHooks(creatorId).catch((err) => setError(err.message));
  }, [creatorId]);

  const selected = hooks?.find((h) => h.id === selectedId) || hooks?.[0] || null;
  const hasResults = (hooks || []).some((h) => h.loggedResults > 0);
  const totals = useMemo(() => {
    const list = hooks || [];
    const views = list.reduce((s, h) => s + h.views, 0);
    const shares = list.reduce((s, h) => s + h.shares, 0);
    const watch = list.length ? list.reduce((s, h) => s + h.watchTimeSec, 0) / list.length : 0;
    const hookRate = list.length ? list.reduce((s, h) => s + h.hookRate, 0) / list.length : 0;
    return { views, shares, watch, hookRate, shareRate: views > 0 ? shares / views : 0 };
  }, [hooks]);

  async function generate(likeText?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/hooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId: creatorId || null,
          topic,
          transcript,
          count: 5,
          likeText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate hooks.");
      setNotice(data.notice);
      await loadHooks(creatorId);
      if (data.hooks?.[0]) setSelectedId(data.hooks[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate hooks.");
    } finally {
      setBusy(false);
    }
  }

  async function saveText(hook: HookDTO, text: string) {
    const next = text.trim();
    if (!next || next === hook.text) return;
    const res = await fetch(`/api/hooks/${hook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not save hook.");
      return;
    }
    setHooks((prev) => prev?.map((h) => (h.id === hook.id ? data.hook : h)) ?? []);
  }

  async function toggleFavourite(hook: HookDTO) {
    const res = await fetch(`/api/hooks/${hook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favourite: !hook.favourite }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not update hook.");
      return;
    }
    setHooks((prev) => prev?.map((h) => (h.id === hook.id ? data.hook : h)) ?? []);
  }

  async function remove(hook: HookDTO) {
    const snapshot = hook;
    setHooks((prev) => prev?.filter((h) => h.id !== hook.id) ?? []);
    const res = await fetch(`/api/hooks/${hook.id}`, { method: "DELETE" });
    if (!res.ok) {
      setHooks((prev) => [snapshot, ...(prev || [])]);
      setError("Could not delete hook.");
    }
  }

  async function addManual(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const res = await fetch("/api/hooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, creatorId: creatorId || null, topic }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not add hook.");
      return;
    }
    setDraft("");
    setHooks((prev) => [data.hook, ...(prev || [])]);
    setSelectedId(data.hook.id);
  }

  async function addCreator(e: FormEvent) {
    e.preventDefault();
    const name = newCreator.trim();
    if (name.length < 2) return;
    const res = await fetch("/api/creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not add creator.");
      return;
    }
    setCreators((prev) => [data.creator, ...prev]);
    setCreatorId(data.creator.id);
    setNewCreator("");
  }

  async function sendToProcessor() {
    const lines = (hooks || []).filter((h) => checked.includes(h.id)).map((h) => h.text);
    const text = (lines.length ? lines : selected ? [selected.text] : []).join("\n");
    if (!text) {
      setError("Select a hook first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Hook text copied. The existing processor is unchanged and does not burn this line into the file. Opening it now.");
    } catch {
      setNotice("Could not copy automatically. The processor does not burn hook text yet.");
    }
    window.location.href = "/dashboard";
  }

  function onPreviewFile(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
  }

  const words = (selected?.text || "Attach a hook to preview the line").split(" ");

  return (
    <div className="flex h-full min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex gap-1 overflow-x-auto border-b border-[#23232F] px-3" role="tablist" aria-label="Editor">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={`shrink-0 border-b-2 px-3 py-3 text-[13px] font-medium ${
              tab === item ? "border-[#8B5CF6] text-[#E8E8F0]" : "border-transparent text-[#8A8A9A] hover:text-[#E8E8F0]"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Captions" && (
        <div className="mx-auto max-w-2xl px-4 py-6" role="tabpanel">
          <h1 className="text-2xl font-medium">Captions</h1>
          <p className="mt-2 mb-4 text-[14px] text-[#8A8A9A]">
            Text only, in the selected creator&apos;s voice. Nothing is burned into the video. Hashtags are not written.
          </p>
          <CaptionStudio creatorId={creatorId} topicDefault={selected?.text || topic} />
        </div>
      )}

      {(tab === "Reframe" || tab === "B-roll") && (
        <div className="mx-auto max-w-lg px-6 py-16" role="tabpanel">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[#8B5CF6]">Coming soon</p>
          <h1 className="mt-2 text-2xl font-medium">{tab}</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[#8A8A9A]">
            {tab} needs processor work this deploy does not change. Hook lines, estimates, and the existing processor stay available.
          </p>
          <button type="button" onClick={() => setTab("Hook Lab")} className="mt-4 rounded-lg bg-[#8B5CF6] px-4 py-2 text-[13px] font-medium text-white">
            Back to Hook Lab
          </button>
        </div>
      )}

      {tab === "Metrics" && (
        <div className="mx-auto max-w-3xl px-4 py-8" role="tabpanel">
          <h1 className="text-2xl font-medium">Metrics</h1>
          <p className="mt-2 text-[14px] text-[#8A8A9A]">
            These numbers come from fields stored on each hook. They stay at zero until results are logged. Scores in the list are still estimates.
          </p>
          {!hasResults && (
            <p className="mt-4 rounded-lg border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-3 py-2 text-[13px] text-[#FBBF24]">
              No logged results for this creator yet.
            </p>
          )}
          <div className="mt-4 overflow-x-auto rounded-[10px] border border-[#23232F]">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[#8A8A9A]">
                <tr>
                  <th className="px-3 py-2 font-medium">Hook</th>
                  <th className="px-3 py-2 font-medium">Views</th>
                  <th className="px-3 py-2 font-medium">Watch</th>
                  <th className="px-3 py-2 font-medium">Hook rate</th>
                  <th className="px-3 py-2 font-medium">Shares</th>
                </tr>
              </thead>
              <tbody>
                {(hooks || []).map((hook) => (
                  <tr key={hook.id} className="border-t border-[#23232F]">
                    <td className="px-3 py-2">{hook.text}</td>
                    <td className="px-3 py-2 font-mono">{hook.views}</td>
                    <td className="px-3 py-2 font-mono">{formatWatch(hook.watchTimeSec)}</td>
                    <td className="px-3 py-2 font-mono">{hook.hookRate.toFixed(1)}%</td>
                    <td className="px-3 py-2 font-mono">{hook.shares}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hooks?.length === 0 && <p className="px-3 py-6 text-[13px] text-[#8A8A9A]">Generate hooks to see them here.</p>}
          </div>
        </div>
      )}

      {tab === "Hook Lab" && (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]" role="tabpanel">
          <aside className="border-b border-[#23232F] lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b border-[#23232F] p-3">
              <label className="block text-[12px] text-[#8A8A9A]">
                Creator
                <select
                  value={creatorId}
                  onChange={(e) => {
                    setCreatorId(e.target.value);
                    setSelectedId(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-[#23232F] bg-[#12121A] px-2 py-2 text-[13px] text-[#E8E8F0]"
                >
                  <option value="">All hooks</option>
                  {creators.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <form onSubmit={addCreator} className="flex gap-2">
                <input
                  value={newCreator}
                  onChange={(e) => setNewCreator(e.target.value)}
                  placeholder="New creator"
                  aria-label="New creator name"
                  className="min-w-0 flex-1 rounded-lg border border-[#23232F] bg-[#0A0A0F] px-2 py-1.5 text-[13px]"
                />
                <button type="submit" className="rounded-lg border border-[#23232F] px-2 text-[12px] text-[#E8E8F0]">
                  Add
                </button>
              </form>
              <label className="block text-[12px] text-[#8A8A9A]">
                Topic
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="What the video is about"
                  className="mt-1 w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-2 py-2 text-[13px] text-[#E8E8F0]"
                />
              </label>
              <label className="block text-[12px] text-[#8A8A9A]">
                Transcript
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={3}
                  placeholder="Optional. Paste the spoken draft."
                  className="mt-1 w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-2 py-2 text-[13px] text-[#E8E8F0]"
                />
              </label>
              <button
                type="button"
                disabled={busy || (!topic.trim() && !transcript.trim())}
                onClick={() => generate()}
                className="w-full rounded-lg bg-[#8B5CF6] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#7C3AED] disabled:opacity-40"
              >
                {busy ? "Generating…" : "Generate hooks"}
              </button>
              <p className="text-[11px] leading-relaxed text-[#8A8A9A]">
                Predicted scores are estimates. They are not measured retention.
              </p>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <h2 className="text-[13px] font-medium">Hook Lab</h2>
              <span className="rounded-full bg-[#8B5CF6]/15 px-2 py-0.5 font-mono text-[11px] text-[#C4B5FD]">
                {hooks?.length ?? 0}
              </span>
            </div>
            {notice && <p className="mx-3 mb-2 text-[12px] leading-relaxed text-[#C4B5FD]">{notice}</p>}
            {error && (
              <p className="mx-3 mb-2 text-[12px] text-[#F87171]" role="alert">
                {error}
              </p>
            )}
            <form onSubmit={addManual} className="flex gap-2 px-3 pb-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write your own hook"
                aria-label="New hook"
                className="min-w-0 flex-1 rounded-lg border border-[#23232F] bg-[#0A0A0F] px-2 py-1.5 text-[13px]"
              />
              <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-[#23232F] px-2 text-[12px]" aria-label="Add hook">
                <Plus className="h-3.5 w-3.5" /> New
              </button>
            </form>
            <div className="space-y-2 px-3 pb-4">
              {hooks === null && (
                <p className="flex items-center gap-2 py-6 text-[13px] text-[#8A8A9A]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading hooks
                </p>
              )}
              {hooks?.length === 0 && (
                <p className="rounded-lg border border-dashed border-[#23232F] px-3 py-6 text-center text-[13px] text-[#8A8A9A]">
                  No hooks for this creator yet. Add a topic and generate a set.
                </p>
              )}
              {hooks?.map((hook) => (
                <article
                  key={hook.id}
                  className={`rounded-[10px] border p-2 ${selected?.id === hook.id ? "border-[#8B5CF6]/50 bg-[#8B5CF6]/10" : "border-[#23232F] bg-[#12121A]"}`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={checked.includes(hook.id)}
                      onChange={() =>
                        setChecked((prev) => (prev.includes(hook.id) ? prev.filter((id) => id !== hook.id) : [...prev, hook.id]))
                      }
                      aria-label={`Select hook ${hook.text}`}
                      className="mt-1"
                    />
                    <button type="button" onClick={() => setSelectedId(hook.id)} className="min-w-0 flex-1 text-left">
                      <textarea
                        defaultValue={hook.text}
                        key={`${hook.id}:${hook.text}`}
                        rows={2}
                        aria-label="Hook text"
                        onBlur={(e) => saveText(hook, e.target.value)}
                        className="w-full resize-none bg-transparent text-[13px] leading-snug text-[#E8E8F0] outline-none"
                      />
                    </button>
                    <span
                      className="rounded-md bg-[#12121A] px-1.5 py-1 font-mono text-[12px] text-[#E8E8F0]"
                      title={hook.score === 0 ? "Added by hand. No estimate yet." : "Estimated score, not a measured result."}
                    >
                      {hook.score === 0 ? "—" : hook.score}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between pl-6">
                    <Sparkline points={hook.sparkline} />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-pressed={hook.favourite}
                        aria-label={hook.favourite ? "Remove favourite" : "Favourite hook"}
                        onClick={() => toggleFavourite(hook)}
                        className={`rounded p-1 ${hook.favourite ? "text-[#FBBF24]" : "text-[#8A8A9A] hover:text-[#E8E8F0]"}`}
                      >
                        <Star className="h-3.5 w-3.5" fill={hook.favourite ? "currentColor" : "none"} />
                      </button>
                      <button type="button" aria-label="Delete hook" onClick={() => remove(hook)} className="rounded p-1 text-[#8A8A9A] hover:text-[#F87171]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </aside>

          <section className="flex min-w-0 flex-col gap-3 p-3">
            <div className="relative flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded-[10px] border border-[#23232F] bg-[#12121A]">
              {previewUrl ? (
                <video
                  ref={videoRef}
                  src={previewUrl}
                  className="max-h-[460px] w-full bg-black"
                  muted
                  playsInline
                  controls
                  onTimeUpdate={(e) => {
                    const t = e.currentTarget.currentTime;
                    const m = Math.floor(t / 60);
                    const s = Math.floor(t % 60);
                    setClock(`00:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
                  }}
                />
              ) : (
                <div className="px-6 text-center">
                  <p className="text-[14px] text-[#E8E8F0]">Preview frame</p>
                  <p className="mt-1 text-[13px] text-[#8A8A9A]">Attach a local clip to play it here. It is not uploaded.</p>
                </div>
              )}
              <div className="pointer-events-none absolute inset-8 rounded-md border border-dashed border-[#8B5CF6]/70" aria-hidden />
              <p className="absolute left-3 top-3 rounded bg-black/50 px-2 py-1 text-[11px] text-[#C4B5FD]">
                Reframe guide is visual only
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {words.map((word, i) => (
                <span
                  key={`${word}-${i}`}
                  className={`rounded-full px-2 py-1 text-[12px] ${i < 2 ? "bg-[#8B5CF6] text-white" : "bg-[#23232F] text-[#E8E8F0]"}`}
                >
                  {word}
                </span>
              ))}
              <span className="ml-auto font-mono text-[12px] text-[#8A8A9A]">{clock}</span>
            </div>
            <div className="rounded-[10px] border border-[#23232F] bg-[#12121A] p-3">
              <div className="mb-2">
              <QuickUpload onFile={onPreviewFile} />
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-[#23232F] px-3 py-1.5 text-[12px] hover:bg-white/5">
                  Attach preview clip
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="sr-only"
                    onChange={(e) => onPreviewFile(e.target.files?.[0] || null)}
                  />
                </label>
                <button
                  type="button"
                  onClick={sendToProcessor}
                  className="rounded-lg bg-[#8B5CF6] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#7C3AED]"
                >
                  Copy hook and open processor
                </button>
                <button
                  type="button"
                  disabled
                  title="Pause removal needs a processor change, which this deploy does not make."
                  className="rounded-lg border border-[#23232F] px-3 py-1.5 text-[12px] text-[#8A8A9A] opacity-60"
                >
                  Remove pauses — coming soon
                </button>
              </div>
              <div className="h-10 rounded bg-[#0A0A0F]">
                <div className="h-full w-2/5 rounded bg-[#8B5CF6]/40" />
              </div>
              <p className="mt-2 text-[11px] text-[#8A8A9A]">
                Timeline marks the selected hook. Silence and filler detection are not running.
              </p>
            </div>
          </section>

          <aside className="border-t border-[#23232F] p-3 lg:border-l lg:border-t-0">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-medium">Live metrics</h2>
              <span className="text-[11px] text-[#34D399]">{hasResults ? "From logged hooks" : "Sample"}</span>
            </div>
            {!hasResults && (
              <p className="mb-3 rounded-lg border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-2 py-2 text-[12px] leading-relaxed text-[#FBBF24]">
                Sample data for layout only. These are not this creator&apos;s results.
              </p>
            )}
            <div className="space-y-2">
              {hasResults ? (
                <>
                  <MetricCard label="Views" value={totals.views.toLocaleString()} delta="Logged" note="Sum" winner points={[totals.views]} />
                  <MetricCard label="Watch time (avg)" value={formatWatch(totals.watch)} delta="Logged" note="Mean" points={[]} />
                  <MetricCard label="Hook rate" value={`${totals.hookRate.toFixed(1)}%`} delta="Logged" note="Mean 3s rate" points={[]} />
                  <MetricCard label="Share rate" value={`${(totals.shareRate * 100).toFixed(1)}%`} delta="Logged" note="Shares / views" points={[]} />
                </>
              ) : (
                SAMPLE.map((card) => (
                  <MetricCard key={card.label} {...card} />
                ))
              )}
            </div>
            <button
              type="button"
              disabled={busy || (!topic.trim() && !transcript.trim() && !selected)}
              onClick={() => generate(selected?.text)}
              className="mt-3 w-full rounded-lg bg-[#8B5CF6] px-3 py-2.5 text-[13px] font-medium text-white hover:bg-[#7C3AED] disabled:opacity-40"
            >
              Make 5 more like this
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-[#8A8A9A]">
              Uses the selected line as a seed. Scores on the new lines are still estimates.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  note,
  winner,
  points,
}: {
  label: string;
  value: string;
  delta: string;
  note: string;
  winner?: boolean;
  points: number[];
}) {
  return (
    <article className="rounded-[10px] border border-[#23232F] bg-[#12121A] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-[#8A8A9A]">{label}</p>
        {winner && <span className="rounded-full bg-[#34D399]/15 px-2 py-0.5 text-[10px] font-medium text-[#34D399]">Winner</span>}
      </div>
      <p className="mt-1 font-mono text-xl">{value}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[12px] text-[#34D399]">{delta}</span>
        <span className="text-[11px] text-[#8A8A9A]">{note}</span>
      </div>
      <div className="mt-2">
        <Sparkline points={points} />
      </div>
    </article>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";

type Draft = { text: string };
type Saved = { id: string; text: string; topic: string; variantId: string | null };

export default function CaptionStudio({
  creatorId,
  topicDefault,
}: {
  creatorId: string;
  topicDefault?: string;
}) {
  const [topic, setTopic] = useState(topicDefault || "");
  const [variantId, setVariantId] = useState("");
  const [variants, setVariants] = useState<{ id: string; name: string }[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (topicDefault && !topic) setTopic(topicDefault);
  }, [topicDefault, topic]);

  useEffect(() => {
    fetch("/api/variants")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.variants)) {
          setVariants(data.variants.map((item: { id: string; name: string }) => ({ id: item.id, name: item.name })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const query = creatorId ? `?creatorId=${encodeURIComponent(creatorId)}` : "";
    fetch(`/api/captions${query}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.captions)) setSaved(data.captions);
      })
      .catch(() => {});
  }, [creatorId]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/captions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, creatorId: creatorId || null, count: 4 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not write captions.");
      setDrafts(data.captions || []);
      setNotice(data.notice || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write captions.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    window.setTimeout(() => setCopied(""), 1200);
  }

  async function save(text: string) {
    setError("");
    const res = await fetch("/api/captions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, topic, creatorId: creatorId || null, variantId: variantId || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not save caption.");
      return;
    }
    setSaved((prev) => [data.caption, ...prev]);
  }

  return (
    <div className="space-y-4">
      <label className="block text-[13px]">
        <span className="mb-1 block text-[#8A8A9A]">Topic or hook line</span>
        <textarea
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-[#1e2130] bg-[#0A0A0F] px-3 py-2 text-[14px] outline-none focus:border-[#7c5cff]"
        />
      </label>
      <label className="block text-[13px]">
        <span className="mb-1 block text-[#8A8A9A]">Save onto a variant</span>
        <select
          value={variantId}
          onChange={(event) => setVariantId(event.target.value)}
          className="w-full rounded-lg border border-[#1e2130] bg-[#0A0A0F] px-3 py-2 text-[14px]"
        >
          <option value="">No variant — keep it on the creator</option>
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>{variant.name}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || topic.trim().length < 2}
        onClick={generate}
        className="inline-flex items-center gap-2 rounded-lg bg-[#7c5cff] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#6d4ef0] disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {drafts.length ? "Regenerate" : "Write captions"}
      </button>
      <p className="text-[12px] text-[#8A8A9A]">Captions are text only. They are not burned into the video, and hashtags are never written.</p>
      {notice && <p className="text-[13px] text-[#C4B5FD]">{notice}</p>}
      {error && <p className="text-[13px] text-[#F87171]" role="alert">{error}</p>}
      <ul className="space-y-2">
        {drafts.map((draft) => (
          <li key={draft.text} className="rounded-[10px] border border-[#1e2130] bg-[#10121c] p-3">
            <p className="text-[14px] leading-relaxed">{draft.text}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => copy(draft.text)} className="inline-flex items-center gap-1 rounded-lg border border-[#1e2130] px-2 py-1 text-[12px]">
                {copied === draft.text ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copy
              </button>
              <button type="button" onClick={() => save(draft.text)} className="rounded-lg border border-[#1e2130] px-2 py-1 text-[12px] hover:border-[#7c5cff]">
                Save
              </button>
            </div>
          </li>
        ))}
      </ul>
      {saved.length > 0 && (
        <div>
          <h3 className="text-[13px] font-medium">Saved</h3>
          <ul className="mt-2 space-y-2">
            {saved.map((caption) => (
              <li key={caption.id} className="rounded-lg border border-[#1e2130] px-3 py-2 text-[13px] text-[#E8E8F0]/90">
                {caption.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

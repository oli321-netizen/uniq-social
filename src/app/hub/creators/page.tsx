"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Trash2 } from "lucide-react";
import type { CreatorDTO } from "@/lib/serialize";
import QuickUpload from "@/components/hub/QuickUpload";
import CaptionStudio from "@/components/hub/CaptionStudio";

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorDTO[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [toneNotes, setToneNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const [handle, setHandle] = useState("");
  const [chips, setChips] = useState("");
  const [slang, setSlang] = useState("");
  const [avoid, setAvoid] = useState("");
  const [posts, setPosts] = useState(["", "", ""]);
  const [strength, setStrength] = useState(60);
  const [voiceNotes, setVoiceNotes] = useState("");

  async function load() {
    const res = await fetch("/api/creators");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not load creators.");
      setCreators([]);
      return;
    }
    setCreators(data.creators);
    setSelectedId((current) => current || data.creators[0]?.id || "");
  }

  useEffect(() => {
    load().catch(() => setError("Could not load creators."));
  }, []);

  const selected = creators?.find((creator) => creator.id === selectedId) || null;

  useEffect(() => {
    if (!selected) return;
    setHandle(selected.handle || "");
    setChips(selected.toneChips.join(", "));
    setSlang(selected.slangPhrases.join(", "));
    setAvoid(selected.avoidWords.join(", "));
    setPosts([selected.examplePosts[0] || "", selected.examplePosts[1] || "", selected.examplePosts[2] || ""]);
    setStrength(selected.voiceStrength ?? 60);
    setVoiceNotes(selected.toneNotes || "");
    setVoiceNote("");
  }, [selected]);

  async function saveVoice(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    const res = await fetch(`/api/creators/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle,
        toneNotes: voiceNotes,
        toneChips: chips.split(",").map((item) => item.trim()).filter(Boolean),
        slangPhrases: slang.split(",").map((item) => item.trim()).filter(Boolean),
        avoidWords: avoid.split(",").map((item) => item.trim()).filter(Boolean),
        examplePosts: posts.map((post) => post.trim()).filter(Boolean),
        voiceStrength: strength,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not save the voice.");
      return;
    }
    setCreators((prev) => prev?.map((item) => (item.id === data.creator.id ? data.creator : item)) ?? []);
    setVoiceNote("Voice saved. Hook Lab and captions use it on the next generate.");
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, niche, toneNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save creator.");
      setName("");
      setNiche("");
      setToneNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save creator.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/creators/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not delete creator.");
      return;
    }
    setCreators((prev) => prev?.filter((c) => c.id !== id) ?? []);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-medium tracking-tight">Creators</h1>
      <p className="mt-2 max-w-xl text-[14px] text-[#8A8A9A]">
        Hook history is stored per creator. Tone notes are passed into Hook Lab when a model key is set. With no key, generation stays in labelled demo mode.
      </p>

      <form onSubmit={onCreate} className="mt-6 space-y-3 rounded-[10px] border border-[#23232F] bg-[#12121A] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[13px]">
            <span className="mb-1 block text-[#8A8A9A]">Name</span>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2 text-[14px] outline-none focus:border-[#8B5CF6]"
            />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block text-[#8A8A9A]">Niche</span>
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2 text-[14px] outline-none focus:border-[#8B5CF6]"
            />
          </label>
        </div>
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#8A8A9A]">Tone notes</span>
          <textarea
            value={toneNotes}
            onChange={(e) => setToneNotes(e.target.value)}
            rows={3}
            placeholder="Direct, specific, no hype words."
            className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2 text-[14px] outline-none focus:border-[#8B5CF6]"
          />
        </label>
        {error && (
          <p className="text-[13px] text-[#F87171]" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#7C3AED] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add creator"}
        </button>
      </form>

      <div className="mt-6 space-y-2">
        {creators === null && (
          <p className="flex items-center gap-2 text-[13px] text-[#8A8A9A]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading creators
          </p>
        )}
        {creators?.length === 0 && (
          <p className="rounded-[10px] border border-dashed border-[#23232F] px-4 py-8 text-center text-[13px] text-[#8A8A9A]">
            No creators yet. Add one to keep Hook Lab history separate.
          </p>
        )}
        {creators?.map((creator) => (
          <article key={creator.id} className={`flex items-start justify-between gap-3 rounded-[10px] border px-4 py-3 ${selectedId === creator.id ? "border-[#8B5CF6] bg-[#12121A]" : "border-[#23232F] bg-[#12121A]"}`}>
            <div>
              <h2 className="text-[14px] font-medium">{creator.name}</h2>
              <p className="text-[12px] text-[#8A8A9A]">{creator.niche || "No niche yet"}</p>
              {creator.toneNotes && <p className="mt-1 text-[13px] text-[#E8E8F0]/80">{creator.toneNotes}</p>}
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={() => setSelectedId(creator.id)} className="text-[13px] text-[#C4B5FD] hover:underline">
                  Brand voice
                </button>
                <Link href={`/hub/hook-lab?creator=${creator.id}`} className="text-[13px] text-[#8B5CF6] hover:underline">
                  Open Hook Lab
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(creator.id)}
              className="rounded-md p-2 text-[#8A8A9A] hover:bg-white/5 hover:text-[#F87171]"
              aria-label={`Delete ${creator.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </article>
        ))}
      </div>

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-medium">Brand voice</h2>
        <QuickUpload />
        {!selected ? (
          <p className="text-[13px] text-[#8A8A9A]">Add a creator to edit tone, words to use, words to avoid, and sample lines.</p>
        ) : (
          <form onSubmit={saveVoice} className="space-y-3 rounded-[10px] border border-[#23232F] bg-[#12121A] p-4">
            <p className="text-[14px] font-medium">{selected.name}</p>
            <label className="block text-[13px]">
              <span className="mb-1 block text-[#8A8A9A]">Handle</span>
              <input value={handle} onChange={(event) => setHandle(event.target.value)} className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2" />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block text-[#8A8A9A]">Tone chips, comma separated</span>
              <input value={chips} onChange={(event) => setChips(event.target.value)} placeholder="direct, specific" className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2" />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block text-[#8A8A9A]">Words and phrases to use</span>
              <input value={slang} onChange={(event) => setSlang(event.target.value)} placeholder="say it plain" className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2" />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block text-[#8A8A9A]">Words to avoid</span>
              <input value={avoid} onChange={(event) => setAvoid(event.target.value)} placeholder="hustle" className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2" />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block text-[#8A8A9A]">Tone notes</span>
              <textarea value={voiceNotes} onChange={(event) => setVoiceNotes(event.target.value)} rows={2} className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2" />
            </label>
            {[0, 1, 2].map((index) => (
              <label key={index} className="block text-[13px]">
                <span className="mb-1 block text-[#8A8A9A]">Sample line {index + 1}</span>
                <textarea value={posts[index]} onChange={(event) => setPosts((prev) => prev.map((post, i) => (i === index ? event.target.value : post)))} rows={2} className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2" />
              </label>
            ))}
            <label className="block text-[13px]">
              <span className="mb-1 flex justify-between text-[#8A8A9A]">Voice strength <span className="font-mono text-[#E8E8F0]">{strength}</span></span>
              <input type="range" min={0} max={100} value={strength} onChange={(event) => setStrength(Number(event.target.value))} className="w-full" />
            </label>
            {voiceNote && <p className="text-[13px] text-[#34D399]">{voiceNote}</p>}
            <button type="submit" className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#7C3AED]">Save voice</button>
          </form>
        )}
        <CaptionStudio creatorId={selectedId} />
      </section>
    </div>
  );
}

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
    setVoiceNote("Voice saved. Editor Lab and captions use it on the next generate.");
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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-medium">Brand voice</h1>
      <p className="mt-2 max-w-2xl text-[16px] text-slate-400">
        Define how a creator sounds, then write captions in that voice. Editor Lab uses the same profile when it tightens a transcript. Transcription needs an OpenAI key and does not invent words.
      </p>

      {error && (
        <p className="mt-4 text-[15px] text-purple-300" role="alert">
          {error}
        </p>
      )}

      <section className="mt-6 grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-md border border-white/10 bg-[#10121c] p-3">
          <h2 className="text-[16px] font-medium">Creators</h2>
          {creators === null && (
            <p className="flex items-center gap-2 text-[15px] text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading
            </p>
          )}
          {creators?.length === 0 && <p className="text-[15px] text-slate-400">No creators yet.</p>}
          <ul className="space-y-2">
            {creators?.map((creator) => (
              <li key={creator.id}>
                <div className={`flex w-full items-start justify-between gap-2 rounded-md border px-3 py-2 text-left ${selectedId === creator.id ? "border-purple-500 bg-purple-500/10" : "border-white/10"}`}>
                  <button type="button" onClick={() => setSelectedId(creator.id)} className="min-w-0 flex-1 text-left">
                    <span className="block text-[15px] font-medium">{creator.name}</span>
                    <span className="block text-[14px] text-slate-400">{creator.handle ? `@${creator.handle.replace(/^@/, "")}` : creator.niche || "No niche yet"}</span>
                  </button>
                  <button type="button" aria-label={`Delete ${creator.name}`} className="rounded p-1 text-slate-400" onClick={() => remove(creator.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <Link href={`/hub/editor-lab?creator=${creator.id}`} className="mt-1 inline-block px-1 text-[14px] text-purple-300">
                  Open Editor Lab
                </Link>
              </li>
            ))}
          </ul>
          <form onSubmit={onCreate} className="space-y-2 border-t border-white/10 pt-3">
            <label className="block text-[15px]">
              Name
              <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 px-2 py-2" />
            </label>
            <label className="block text-[15px]">
              Niche
              <input value={niche} onChange={(e) => setNiche(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 px-2 py-2" />
            </label>
            <label className="block text-[15px]">
              Tone notes
              <textarea value={toneNotes} onChange={(e) => setToneNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-white/10 px-2 py-2" />
            </label>
            <button type="submit" disabled={saving} className="w-full rounded-md bg-purple-600 px-3 py-2 text-[15px] text-white disabled:opacity-50">
              {saving ? "Saving…" : "Add creator"}
            </button>
          </form>
        </div>
        <div className="space-y-4">
        <h2 className="text-[16px] font-medium">Voice profile</h2>
        {!selected ? (
          <p className="text-[13px] text-[#8A8A9A]">Add a creator to edit tone, words to use, words to avoid, and sample lines.</p>
        ) : (
          <form onSubmit={saveVoice} className="space-y-3 rounded-[10px] border border-[#1e2130] bg-[#10121c] p-4">
            <p className="text-[14px] font-medium">{selected.name}</p>
            <label className="block text-[13px]">
              <span className="mb-1 block text-[#8A8A9A]">Handle</span>
              <input value={handle} onChange={(event) => setHandle(event.target.value)} className="w-full rounded-lg border border-[#1e2130] bg-[#0A0A0F] px-3 py-2" />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block text-[#8A8A9A]">Tone chips, comma separated</span>
              <input value={chips} onChange={(event) => setChips(event.target.value)} placeholder="direct, specific" className="w-full rounded-lg border border-[#1e2130] bg-[#0A0A0F] px-3 py-2" />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block text-[#8A8A9A]">Words and phrases to use</span>
              <input value={slang} onChange={(event) => setSlang(event.target.value)} placeholder="say it plain" className="w-full rounded-lg border border-[#1e2130] bg-[#0A0A0F] px-3 py-2" />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block text-[#8A8A9A]">Words to avoid</span>
              <input value={avoid} onChange={(event) => setAvoid(event.target.value)} placeholder="hustle" className="w-full rounded-lg border border-[#1e2130] bg-[#0A0A0F] px-3 py-2" />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block text-[#8A8A9A]">Tone notes</span>
              <textarea value={voiceNotes} onChange={(event) => setVoiceNotes(event.target.value)} rows={2} className="w-full rounded-lg border border-[#1e2130] bg-[#0A0A0F] px-3 py-2" />
            </label>
            {[0, 1, 2].map((index) => (
              <label key={index} className="block text-[13px]">
                <span className="mb-1 block text-[#8A8A9A]">Sample line {index + 1}</span>
                <textarea value={posts[index]} onChange={(event) => setPosts((prev) => prev.map((post, i) => (i === index ? event.target.value : post)))} rows={2} className="w-full rounded-lg border border-[#1e2130] bg-[#0A0A0F] px-3 py-2" />
              </label>
            ))}
            <label className="block text-[13px]">
              <span className="mb-1 flex justify-between text-[#8A8A9A]">Voice strength <span>{strength}</span></span>
              <input type="range" min={0} max={100} value={strength} onChange={(event) => setStrength(Number(event.target.value))} className="w-full" />
            </label>
            {voiceNote && <p className="text-[13px] text-[#34D399]">{voiceNote}</p>}
            <button type="submit" className="rounded-lg bg-[#7c5cff] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#6d4ef0]">Save voice</button>
          </form>
        )}
        </div>
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Captions</h2>
          <CaptionStudio creatorId={selectedId} />
        </div>
        <div className="lg:col-span-3">
          <QuickUpload />
        </div>
      </section>
    </div>
  );
}

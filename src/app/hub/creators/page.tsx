"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Trash2 } from "lucide-react";
import type { CreatorDTO } from "@/lib/serialize";

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorDTO[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [toneNotes, setToneNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/creators");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not load creators.");
      setCreators([]);
      return;
    }
    setCreators(data.creators);
  }

  useEffect(() => {
    load().catch(() => setError("Could not load creators."));
  }, []);

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
          <article key={creator.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-[#23232F] bg-[#12121A] px-4 py-3">
            <div>
              <h2 className="text-[14px] font-medium">{creator.name}</h2>
              <p className="text-[12px] text-[#8A8A9A]">{creator.niche || "No niche yet"}</p>
              {creator.toneNotes && <p className="mt-1 text-[13px] text-[#E8E8F0]/80">{creator.toneNotes}</p>}
              <Link href={`/hub/hook-lab?creator=${creator.id}`} className="mt-2 inline-block text-[13px] text-[#8B5CF6] hover:underline">
                Open Hook Lab
              </Link>
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
    </div>
  );
}

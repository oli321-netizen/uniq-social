"use client";

import { FormEvent, useEffect, useState } from "react";
import type { CreatorDTO, PresetDTO } from "@/lib/serialize";

const DIMENSIONS = ["hook text", "pacing", "crop and zoom", "color grade"];

export default function PresetsPage() {
  const [presets, setPresets] = useState<PresetDTO[]>([]);
  const [creators, setCreators] = useState<CreatorDTO[]>([]);
  const [name, setName] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [dimensions, setDimensions] = useState<string[]>(["hook text", "pacing"]);
  const [count, setCount] = useState(3);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const [presetRes, creatorRes] = await Promise.all([fetch("/api/presets"), fetch("/api/creators")]);
    const presetData = await presetRes.json();
    const creatorData = await creatorRes.json();
    if (!presetRes.ok) throw new Error(presetData.error || "Could not load presets.");
    setPresets(presetData.presets || []);
    if (creatorRes.ok) setCreators(creatorData.creators || []);
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load presets."))
      .finally(() => setLoading(false));
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, creatorId: creatorId || null, dimensions, variantsPerVideo: count }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not save the preset.");
      return;
    }
    setPresets((prev) => [data.preset, ...prev]);
    setName("");
  }

  async function remove(id: string) {
    const res = await fetch(`/api/presets/${id}`, { method: "DELETE" });
    if (res.ok) setPresets((prev) => prev.filter((preset) => preset.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-medium">Presets</h1>
        <p className="mt-1 text-[13px] text-[#8A8A9A]">Save a named set of creative tests and a variant count. Load copies it back into this form. Delete removes it.</p>
      </div>
      <form onSubmit={onCreate} className="space-y-3 rounded-[10px] border border-[#23232F] bg-[#12121A] p-4">
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#8A8A9A]">Name</span>
          <input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2" />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#8A8A9A]">Creator</span>
          <select value={creatorId} onChange={(event) => setCreatorId(event.target.value)} className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2">
            <option value="">Any creator</option>
            {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}
          </select>
        </label>
        <fieldset>
          <legend className="mb-2 text-[13px] text-[#8A8A9A]">Dimensions</legend>
          <div className="flex flex-wrap gap-2">
            {DIMENSIONS.map((dimension) => {
              const on = dimensions.includes(dimension);
              return (
                <button
                  key={dimension}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDimensions((prev) => (on ? prev.filter((item) => item !== dimension) : [...prev, dimension]))}
                  className={`rounded-full px-3 py-1 text-[12px] ${on ? "bg-[#8B5CF6] text-white" : "border border-[#23232F]"}`}
                >
                  {dimension}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="flex items-center justify-between text-[13px]">
          Variants per video
          <input type="number" min={1} max={12} value={count} onChange={(event) => setCount(Number(event.target.value))} className="w-20 rounded-lg border border-[#23232F] bg-[#0A0A0F] px-2 py-1 font-mono" />
        </label>
        {error && <p className="text-[13px] text-[#F87171]" role="alert">{error}</p>}
        <button type="submit" className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#7C3AED]">Save preset</button>
      </form>
      {loading && <p className="text-[13px] text-[#8A8A9A]">Loading presets</p>}
      <ul className="space-y-2">
        {!loading && presets.length === 0 && <li className="rounded-[10px] border border-dashed border-[#23232F] px-4 py-8 text-center text-[13px] text-[#8A8A9A]">No presets yet.</li>}
        {presets.map((preset) => (
          <li key={preset.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#23232F] bg-[#12121A] px-4 py-3">
            <div>
              <p className="text-[14px] font-medium">{preset.name}</p>
              <p className="text-[12px] text-[#8A8A9A]">{preset.dimensions.join(", ")} · {preset.variantsPerVideo} variants</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setName(preset.name);
                  setCreatorId(preset.creatorId || "");
                  setDimensions(preset.dimensions);
                  setCount(preset.variantsPerVideo);
                }}
                className="rounded-lg bg-[#8B5CF6] px-3 py-1.5 text-[12px] font-medium text-white"
              >
                Load
              </button>
              <button type="button" onClick={() => remove(preset.id)} className="rounded-lg border border-[#23232F] px-3 py-1.5 text-[12px]">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

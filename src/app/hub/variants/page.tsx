"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Card = {
  id: string;
  historyId: string;
  name: string;
  testsDimension: string;
  status: string;
  hasFile: boolean;
  startTrim: number;
  zoomPct: number;
  createdAt: string;
};

export default function VariantsPage() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(null);

  async function load() {
    const res = await fetch("/api/variants");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load variants.");
    setCards(data.variants || []);
  }

  useEffect(() => {
    load().catch((err) => {
      setError(err.message);
      setCards([]);
    });
  }, []);

  function toggle(id: string, index: number, shift: boolean) {
    setSelected((prev) => {
      if (shift && anchor !== null && cards) {
        const start = Math.min(anchor, index);
        const end = Math.max(anchor, index);
        const range = cards.slice(start, end + 1).map((card) => card.id);
        return Array.from(new Set([...prev, ...range]));
      }
      setAnchor(index);
      return prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
    });
  }

  async function remove(ids: string[]) {
    setError("");
    const res = await Promise.all(ids.map((id) => fetch(`/api/variants/${id}`, { method: "DELETE" })));
    if (res.some((item) => !item.ok)) setError("Could not delete every selected variant.");
    setSelected([]);
    await load();
  }

  async function attach(historyId: string, file: File | null) {
    if (!file) return;
    setError("");
    const body = new FormData();
    body.append("file", file);
    body.append("historyId", historyId);
    const res = await fetch("/api/variants", { method: "POST", body });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not attach that file.");
      return;
    }
    setNote("File attached. Hover the card to preview it. Rendering itself was not changed.");
    await load();
  }

  const chosen = (cards || []).filter((card) => selected.includes(card.id));

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">Variants</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[#8A8A9A]">
            These cards are the renders already written by the existing processor. The file itself is not stored unless you attach the mp4 you downloaded. Nothing here changes how a render is made.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={selected.length !== 2} onClick={() => setCompare(true)} className="rounded-lg border border-[#23232F] px-3 py-1.5 text-[12px] disabled:opacity-40">
            Compare
          </button>
          <button type="button" disabled={selected.length === 0} onClick={() => remove(selected)} className="rounded-lg border border-[#F87171]/40 px-3 py-1.5 text-[12px] text-[#F87171] disabled:opacity-40">
            Delete
          </button>
        </div>
      </div>
      {error && <p className="mb-3 text-[13px] text-[#F87171]" role="alert">{error}</p>}
      {note && <p className="mb-3 text-[13px] text-[#C4B5FD]">{note}</p>}
      {cards === null && (
        <p className="flex items-center gap-2 text-[13px] text-[#8A8A9A]"><Loader2 className="h-4 w-4 animate-spin" /> Loading variants</p>
      )}
      {cards?.length === 0 && (
        <p className="rounded-[10px] border border-dashed border-[#23232F] px-4 py-10 text-center text-[13px] text-[#8A8A9A]">
          No saved renders yet. Finish one in the video processor and it will show up here.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards?.map((card, index) => (
          <li key={card.id} className="overflow-hidden rounded-[10px] border border-[#23232F] bg-[#12121A]">
            <div className="relative aspect-[9/16] bg-black">
              <label className="absolute left-2 top-2 z-10">
                <input
                  type="checkbox"
                  checked={selected.includes(card.id)}
                  aria-label={`Select ${card.name}`}
                  onChange={(event) => toggle(card.id, index, (event.nativeEvent as MouseEvent).shiftKey)}
                />
              </label>
              {card.hasFile ? (
                <video
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  src={`/api/variants/${card.id}/file`}
                  onMouseEnter={(event) => event.currentTarget.play().catch(() => {})}
                  onMouseLeave={(event) => {
                    event.currentTarget.pause();
                    event.currentTarget.currentTime = 0;
                  }}
                />
              ) : (
                <div className="flex h-full items-center px-3 text-center text-[12px] text-[#8A8A9A]">
                  No file kept. Attach the downloaded mp4 to preview it.
                </div>
              )}
              <p className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-[#C4B5FD]">tests: {card.testsDimension}</p>
            </div>
            <div className="space-y-1 p-2 text-[12px]">
              <p className="truncate font-medium">{card.name}</p>
              <p className="text-[#8A8A9A]">trim {card.startTrim.toFixed(2)}s · zoom {card.zoomPct.toFixed(1)}%</p>
              <div className="flex flex-wrap gap-2">
                {card.hasFile ? (
                  <a className="text-[#C4B5FD] hover:underline" href={`/api/variants/${card.id}/file?download=1`}>Download</a>
                ) : (
                  <label className="cursor-pointer text-[#C4B5FD] hover:underline">
                    Attach file
                    <input type="file" accept="video/mp4" className="sr-only" onChange={(event) => attach(card.historyId, event.target.files?.[0] || null)} />
                  </label>
                )}
                <button type="button" className="text-[#F87171]" onClick={() => remove([card.id])}>Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {compare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="grid w-full max-w-4xl gap-3 rounded-[10px] border border-[#23232F] bg-[#12121A] p-4 sm:grid-cols-2">
            {chosen.map((card) => (
              <div key={card.id}>
                <p className="mb-2 text-[13px] font-medium">{card.name}</p>
                {card.hasFile ? (
                  <video src={`/api/variants/${card.id}/file`} controls className="aspect-[9/16] w-full bg-black" />
                ) : (
                  <p className="text-[13px] text-[#8A8A9A]">No file attached. Trim {card.startTrim.toFixed(2)}s, zoom {card.zoomPct.toFixed(1)}%.</p>
                )}
              </div>
            ))}
            <button type="button" className="sm:col-span-2 rounded-lg border border-[#23232F] py-2 text-[13px]" onClick={() => setCompare(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

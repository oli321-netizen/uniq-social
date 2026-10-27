"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  name: string;
  testsDimension: string;
  hookText: string;
  views: number;
  shares: number;
  saves: number;
  follows: number;
  avgWatchSec: number;
  logs: number;
};

const TEMPLATE = "variant_name,platform,views,view_rate_3s,avg_watch_s,shares,saves,follows,posted_at\nHook A,tiktok,1200,42,8.5,30,12,4,2026-01-15\n";

export default function ResultsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [sort, setSort] = useState<"views" | "watch" | "shares">("views");
  const [variantId, setVariantId] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [views, setViews] = useState("0");
  const [rate, setRate] = useState("0");
  const [watch, setWatch] = useState("0");
  const [shares, setShares] = useState("0");
  const [saves, setSaves] = useState("0");
  const [follows, setFollows] = useState("0");
  const [postedAt, setPostedAt] = useState("");

  async function load() {
    const res = await fetch("/api/results");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load results.");
    setRows(data.rows || []);
    setVariantId((current) => current || data.rows?.[0]?.id || "");
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const ranked = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort === "watch") return b.avgWatchSec - a.avgWatchSec;
      if (sort === "shares") return b.shares - a.shares;
      return b.views - a.views;
    });
    return copy;
  }, [rows, sort]);

  const chart = useMemo(() => {
    const buckets = new Map<string, { watch: number; count: number }>();
    for (const row of rows) {
      const bucket = buckets.get(row.testsDimension) || { watch: 0, count: 0 };
      if (row.logs > 0) {
        bucket.watch += row.avgWatchSec;
        bucket.count += 1;
      }
      buckets.set(row.testsDimension, bucket);
    }
    return Array.from(buckets.entries()).map(([label, bucket]) => ({
      label,
      value: bucket.count ? bucket.watch / bucket.count : 0,
    }));
  }, [rows]);
  const maxWatch = Math.max(1, ...chart.map((item) => item.value));

  async function onManual(event: FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId,
        platform,
        views: Number(views),
        viewRate3s: Number(rate),
        avgWatchSec: Number(watch),
        shares: Number(shares),
        saves: Number(saves),
        follows: Number(follows),
        postedAt: postedAt || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not save the result.");
      return;
    }
    setNote("Result saved. If this variant now leads on views, the bell records a winner.");
    await load();
  }

  async function onCsv(file: File | null) {
    if (!file) return;
    setError("");
    const csv = await file.text();
    const res = await fetch("/api/results/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not import the CSV.");
      return;
    }
    setNote(`Imported ${data.imported}. ${data.errors?.length ? data.errors.slice(0, 3).join(" ") : ""}`);
    await load();
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "uniq-results-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-medium">Results</h1>
        <p className="mt-1 text-[13px] text-[#8A8A9A]">Log views, watch time, shares, saves, and follows by hand or CSV. The chart uses the average watch time you entered.</p>
      </div>
      {loading && <p className="text-[13px] text-[#8A8A9A]">Loading results</p>}
      {error && <p className="text-[13px] text-[#F87171]" role="alert">{error}</p>}
      {note && <p className="text-[13px] text-[#C4B5FD]">{note}</p>}
      <form onSubmit={onManual} className="grid gap-3 rounded-[10px] border border-[#23232F] bg-[#12121A] p-4 sm:grid-cols-2">
        <label className="text-[13px] sm:col-span-2">
          <span className="mb-1 block text-[#8A8A9A]">Variant</span>
          <select value={variantId} onChange={(event) => setVariantId(event.target.value)} className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2">
            {rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        {[
          ["Platform", platform, setPlatform, "text"],
          ["Views", views, setViews, "number"],
          ["3s view rate %", rate, setRate, "number"],
          ["Avg watch seconds", watch, setWatch, "number"],
          ["Shares", shares, setShares, "number"],
          ["Saves", saves, setSaves, "number"],
          ["Follows", follows, setFollows, "number"],
        ].map(([label, value, setter, type]) => (
          <label key={String(label)} className="text-[13px]">
            <span className="mb-1 block text-[#8A8A9A]">{label as string}</span>
            <input type={type as string} value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2" />
          </label>
        ))}
        <label className="text-[13px]">
          <span className="mb-1 block text-[#8A8A9A]">Posted at</span>
          <input type="date" value={postedAt} onChange={(event) => setPostedAt(event.target.value)} className="w-full rounded-lg border border-[#23232F] bg-[#0A0A0F] px-3 py-2" />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#7C3AED]">Save result</button>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[13px]">
          Import CSV
          <input type="file" accept=".csv,text/csv" className="ml-2 text-[12px]" onChange={(event) => onCsv(event.target.files?.[0] || null)} />
        </label>
        <button type="button" onClick={downloadTemplate} className="text-[13px] text-[#C4B5FD] hover:underline">Download template</button>
      </div>
      <section className="rounded-[10px] border border-[#23232F] bg-[#12121A] p-4">
        <h2 className="text-[14px] font-medium">Average watch time by test</h2>
        {!loading && chart.length === 0 && <p className="mt-3 text-[13px] text-[#8A8A9A]">No variants yet.</p>}
        <div className="mt-3 space-y-2">
          {chart.map((item) => (
            <div key={item.label} className="grid grid-cols-[120px_1fr_48px] items-center gap-2 text-[12px]">
              <span className="truncate text-[#8A8A9A]">{item.label}</span>
              <svg viewBox="0 0 100 8" className="h-2 w-full" role="img" aria-label={`${item.label} ${item.value.toFixed(1)} seconds`}>
                <rect width="100" height="8" rx="2" fill="#23232F" />
                <rect width={Math.max(0, (item.value / maxWatch) * 100)} height="8" rx="2" fill="#8B5CF6" />
              </svg>
              <span className="font-mono text-right">{item.value.toFixed(1)}s</span>
            </div>
          ))}
        </div>
      </section>
      <div className="flex gap-2 text-[12px]">
        {(["views", "watch", "shares"] as const).map((key) => (
          <button key={key} type="button" onClick={() => setSort(key)} className={`rounded-full px-3 py-1 ${sort === key ? "bg-[#8B5CF6] text-white" : "border border-[#23232F]"}`}>
            Sort by {key}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-[10px] border border-[#23232F]">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[#8A8A9A]">
            <tr>
              <th className="px-3 py-2 font-medium">Variant</th>
              <th className="px-3 py-2 font-medium">Tests</th>
              <th className="px-3 py-2 font-medium">Views</th>
              <th className="px-3 py-2 font-medium">Watch</th>
              <th className="px-3 py-2 font-medium">Shares</th>
              <th className="px-3 py-2 font-medium">Saves</th>
              <th className="px-3 py-2 font-medium">Follows</th>
            </tr>
          </thead>
          <tbody>
            {!loading && ranked.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-[#8A8A9A]">Finish a render, then log a result.</td></tr>
            )}
            {ranked.map((row, index) => (
              <tr key={row.id} className="border-t border-[#23232F]">
                <td className="px-3 py-2">{index === 0 && row.views > 0 ? "Winner · " : ""}{row.name}</td>
                <td className="px-3 py-2 text-[#8A8A9A]">{row.testsDimension}</td>
                <td className="px-3 py-2 font-mono">{row.views}</td>
                <td className="px-3 py-2 font-mono">{row.avgWatchSec.toFixed(1)}</td>
                <td className="px-3 py-2 font-mono">{row.shares}</td>
                <td className="px-3 py-2 font-mono">{row.saves}</td>
                <td className="px-3 py-2 font-mono">{row.follows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

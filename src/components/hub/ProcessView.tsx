"use client";

import { useEffect, useState, type DragEvent, type RefObject } from "react";
import JSZip from "jszip";
import { ChevronDown, Download, FileText, Loader2, Settings, Upload } from "lucide-react";

export type ProcessorSettings = {
  trimMin: number;
  trimMax: number;
  cutsMin: number;
  cutsMax: number;
  zoomMin: number;
  zoomMax: number;
  grain: boolean;
  grainIntensity: number;
  sharpen: boolean;
  sharpenAmount: number;
  mirror: boolean;
  thumbnailRandomise: boolean;
  hiddenEmoji: boolean;
  speedShift: boolean;
  cropOffset: boolean;
  hueShift: boolean;
};

type Profile = "capcut" | "snapchat" | "iphone" | "random";
type Output = { url: string; filename: string };
type VideoRow = {
  id: string;
  name: string;
  size: string;
  status: "pending" | "processing" | "done" | "error";
  progress: number;
  file: File;
  outputs?: Output[];
  durationSec?: number;
  chips?: string[];
  completedCopies?: number;
};

type PanelTab = "edits" | "presets" | "anti" | "manual";

function clock(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Toggle({ on, label, detail, onClick }: { on: boolean; label: string; detail?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-[13px] text-[#c9cbd8]">
      <span>
        <span className="block">{label}</span>
        {detail ? <span className="block text-[11px] text-[#8a8ea3]">{detail}</span> : null}
      </span>
      <span className={`relative h-4 w-7 shrink-0 rounded-full ${on ? "bg-[#7c5cff]" : "bg-[#2a2e42]"}`} aria-pressed={on}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5 bg-[#9a9eb2]"}`} />
      </span>
    </button>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-2 py-1 text-[12.5px] text-[#c9cbd8]">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        aria-label={label}
        onChange={(event) => {
          const raw = event.target.value.replace(/[^0-9.]/g, "");
          onChange(raw === "" ? 0 : Number(raw));
        }}
        onFocus={(event) => event.target.select()}
        className="w-full rounded-[5px] border border-[#262a3c] bg-[#0d0f19] px-2 py-1 text-right text-[12px] tabular-nums outline-none"
      />
    </label>
  );
}

export default function ProcessView(props: {
  videos: VideoRow[];
  settings: ProcessorSettings;
  setSettings: (next: ProcessorSettings) => void;
  metadata: Profile[];
  setMetadata: (next: Profile[]) => void;
  copies: number;
  setCopies: (next: number) => void;
  fileRef: RefObject<HTMLInputElement>;
  onDrop: (event: DragEvent) => void;
  addFiles: (files: File[]) => void;
  removeVideo: (id: string) => void;
  clearAll: () => void;
  processAll: () => void;
  isProcessing: boolean;
  pendingCount: number;
  doneCount: number;
  credits: number;
  selectedRows: string[];
  setSelectedRows: (next: string[] | ((rows: string[]) => string[])) => void;
  onPreview: (video: VideoRow, index: number) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  showProcessMore: boolean;
  clearCompleted: () => void;
  onNeedCredits: () => void;
}) {
  const [tab, setTab] = useState<PanelTab>("edits");
  const [open, setOpen] = useState({ vary: true, preset: true, anti: true, manual: true });
  const [zipping, setZipping] = useState(false);
  const { settings } = props;

  const rows = props.videos.flatMap((video, videoIndex) => {
    if (video.outputs && video.outputs.length > 0) {
      return video.outputs.map((output, index) => ({
        id: `${video.id}:${index}`,
        video,
        output,
        index,
        title: `Variant ${String(videoIndex + 1).padStart(2, "0")}${video.outputs && video.outputs.length > 1 ? `.${index + 1}` : ""}`,
      }));
    }
    return [{ id: `${video.id}:0`, video, output: undefined as Output | undefined, index: 0, title: video.name }];
  });
  const rowIds = rows.map((row) => row.id);
  const selected = props.selectedRows.filter((id) => rowIds.includes(id));
  const totalOutputs = props.videos.reduce((sum, video) => sum + (video.outputs?.length || 0), 0);
  const processing = props.videos.some((video) => video.status === "processing");

  function patch(partial: Partial<ProcessorSettings>) {
    props.setSettings({ ...settings, ...partial });
  }

  function toggleProfile(name: Profile) {
    if (name === "random") {
      props.setMetadata(["random"]);
      return;
    }
    const on = props.metadata.includes(name);
    if (on) {
      const next = props.metadata.filter((item) => item !== name);
      props.setMetadata(next.length === 0 ? ["random"] : next);
      return;
    }
    props.setMetadata([...props.metadata.filter((item) => item !== "random"), name]);
  }

  function setCopyCount(value: number) {
    props.setCopies(Math.max(1, Math.min(100, value)));
  }

  async function downloadZip() {
    const chosen = rows.filter((row) => row.output && (selected.length === 0 || selected.includes(row.id)));
    if (chosen.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      await Promise.all(chosen.map(async (row) => {
        if (!row.output) return;
        const res = await fetch(row.output.url);
        zip.file(row.output.filename, await res.blob());
      }));
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `uniq_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setZipping(false);
    }
  }

  const cost = props.pendingCount * props.copies;
  const canRun = props.pendingCount > 0 && !props.isProcessing && props.credits >= cost;

  const panel = (
    <aside className={`${props.settingsOpen ? "fixed inset-x-0 bottom-0 z-40 flex max-h-[86vh]" : "hidden"} w-full flex-col rounded-t-[14px] border border-[#1e2130] bg-[#10121c] lg:sticky lg:top-4 lg:z-auto lg:flex lg:max-h-[calc(100vh-84px)] lg:w-[320px] lg:shrink-0 lg:rounded-[10px]`}>
      <div className="flex items-center justify-between px-4 pb-1 pt-3 text-[13px] font-semibold lg:hidden">
        <span>Settings</span>
        <button type="button" className="font-medium text-[#b3a2ff]" onClick={() => props.setSettingsOpen(false)}>Done</button>
      </div>
      <div className="flex border-b border-[#1e2130] px-2" role="tablist" aria-label="Processor settings">
        {([
          ["edits", "Edits"],
          ["presets", "Presets"],
          ["anti", "Anti-detect"],
          ["manual", "Manual"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 border-b-[1.5px] px-2 py-[11px] text-[12.5px] ${tab === id ? "border-[#7c5cff] text-white" : "border-transparent text-[#8a8ea3]"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5">
        {tab === "edits" && (
          <section>
            <button type="button" className="flex w-full items-center justify-between py-2.5 text-[13px] font-medium" onClick={() => setOpen({ ...open, vary: !open.vary })}>
              What to vary <ChevronDown className={`h-4 w-4 text-[#6b6f85] ${open.vary ? "" : "-rotate-90"}`} />
            </button>
            {open.vary && (
              <div className="pb-2">
                <p className="mb-1 text-[12px] text-[#8a8ea3]">Sent with every copy. Ranges are randomised per copy.</p>
                <Toggle label="Mirror (horizontal flip)" on={settings.mirror} onClick={() => patch({ mirror: !settings.mirror })} />
                <Toggle label="Film grain" on={settings.grain} onClick={() => patch({ grain: !settings.grain })} />
                <Toggle label="Sharpen" on={settings.sharpen} onClick={() => patch({ sharpen: !settings.sharpen })} />
              </div>
            )}
          </section>
        )}
        {tab === "presets" && (
          <section>
            <button type="button" className="flex w-full items-center justify-between py-2.5 text-[13px] font-medium" onClick={() => setOpen({ ...open, preset: !open.preset })}>
              Platform preset <ChevronDown className={`h-4 w-4 text-[#6b6f85] ${open.preset ? "" : "-rotate-90"}`} />
            </button>
            {open.preset && (
              <div className="pb-3">
                <div className="grid grid-cols-2 gap-1 rounded-[7px] border border-[#262a3c] bg-[#0d0f19] p-0.5">
                  {([
                    ["iphone", "iPhone"],
                    ["capcut", "CapCut"],
                    ["snapchat", "Snapchat"],
                    ["random", "Random"],
                  ] as const).map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={props.metadata.includes(id)} onClick={() => toggleProfile(id)} className={`rounded-[5px] px-2 py-1.5 text-[12px] ${props.metadata.includes(id) ? "bg-[#1d2034] text-white" : "text-[#9a9eb2]"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-[#8a8ea3]">
                  {props.metadata.includes("random")
                    ? "Auto-selected per copy."
                    : props.metadata.length > 1
                      ? "Stacked. More than one identity is applied."
                      : "Output container, codec and bitrate matched to the preset."}
                </p>
              </div>
            )}
          </section>
        )}
        {tab === "anti" && (
          <section>
            <button type="button" className="flex w-full items-center justify-between py-2.5 text-[13px] font-medium" onClick={() => setOpen({ ...open, anti: !open.anti })}>
              Anti-Detection <ChevronDown className={`h-4 w-4 text-[#6b6f85] ${open.anti ? "" : "-rotate-90"}`} />
            </button>
            {open.anti && (
              <div className="pb-2">
                <Toggle label="Hidden Overlay" detail="Invisible pixel marker — beats hash matching" on={settings.hiddenEmoji} onClick={() => patch({ hiddenEmoji: !settings.hiddenEmoji })} />
                <Toggle label="Speed Shift" detail="0.5–1.5% tempo change — breaks frame timing" on={settings.speedShift} onClick={() => patch({ speedShift: !settings.speedShift })} />
                <Toggle label="Crop Offset" detail="±8px spatial shift — changes position hash" on={settings.cropOffset} onClick={() => patch({ cropOffset: !settings.cropOffset })} />
                <Toggle label="Hue Shift" detail="±2° colour rotation — alters frame colours" on={settings.hueShift} onClick={() => patch({ hueShift: !settings.hueShift })} />
                <Toggle label="Randomise Thumbnail" detail="Unique first-frame fingerprint" on={settings.thumbnailRandomise} onClick={() => patch({ thumbnailRandomise: !settings.thumbnailRandomise })} />
              </div>
            )}
          </section>
        )}
        {tab === "manual" && (
          <section>
            <button type="button" className="flex w-full items-center justify-between py-2.5 text-[13px] font-medium" onClick={() => setOpen({ ...open, manual: !open.manual })}>
              Manual parameters <ChevronDown className={`h-4 w-4 text-[#6b6f85] ${open.manual ? "" : "-rotate-90"}`} />
            </button>
            {open.manual && (
              <div className="pb-3">
                <Num label="Trim min (s)" value={settings.trimMin} onChange={(trimMin) => patch({ trimMin })} />
                <Num label="Trim max (s)" value={settings.trimMax} onChange={(trimMax) => patch({ trimMax })} />
                <Num label="Cuts min" value={settings.cutsMin} onChange={(cutsMin) => patch({ cutsMin: Math.round(cutsMin) })} />
                <Num label="Cuts max" value={settings.cutsMax} onChange={(cutsMax) => patch({ cutsMax: Math.round(cutsMax) })} />
                <Num label="Zoom min (%)" value={settings.zoomMin} onChange={(zoomMin) => patch({ zoomMin })} />
                <Num label="Zoom max (%)" value={settings.zoomMax} onChange={(zoomMax) => patch({ zoomMax })} />
                <Num label="Grain amount" value={settings.grainIntensity} onChange={(grainIntensity) => patch({ grainIntensity })} />
                <Num label="Sharpen amount" value={settings.sharpenAmount} onChange={(sharpenAmount) => patch({ sharpenAmount })} />
              </div>
            )}
          </section>
        )}
      </div>
      <div className="border-t border-[#1e2130] px-3.5 py-3">
        <div className="flex items-center justify-between py-1 text-[13px]">
          <span>Variants per video</span>
          <span className="inline-flex items-center rounded-[6px] border border-[#262a3c]">
            <button type="button" aria-label="Fewer variants" className="h-[22px] w-6 text-[#9a9eb2]" onClick={() => setCopyCount(props.copies - 1)}>−</button>
            <b className="w-6 text-center text-[13px] font-medium">{props.copies}</b>
            <button type="button" aria-label="More variants" className="h-[22px] w-6 text-[#9a9eb2]" onClick={() => setCopyCount(props.copies + 1)}>+</button>
          </span>
        </div>
        <div className="flex items-center justify-between py-1 text-[12px] text-[#8a8ea3]">
          <span>Estimated cost</span>
          <span className="text-[#e6e7ee]">{cost} credit{cost === 1 ? "" : "s"}</span>
        </div>
        <button type="button" disabled={!canRun} onClick={props.processAll} className={`mt-2.5 w-full rounded-[7px] bg-[#7c5cff] py-2 text-[13px] font-medium text-white ${canRun ? "" : "cursor-not-allowed opacity-40"}`}>
          {props.isProcessing ? "Processing — do not close this tab" : "Generate variants"}
        </button>
        {props.pendingCount > 0 && !props.isProcessing && props.credits < cost && (
          <p className="mt-2 text-center text-[12px] text-red-300">
            Not enough credits — you need {cost} but have {props.credits}.{" "}
            <button type="button" className="underline" onClick={props.onNeedCredits}>Get more credits</button>
          </p>
        )}
        {props.showProcessMore && props.doneCount > 0 && !props.isProcessing && (
          <button type="button" onClick={props.clearCompleted} className="mt-2 w-full rounded-[7px] border border-[#262a3c] py-2 text-[12px] text-[#c9cbd8]">
            Process More Videos
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:p-5">
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <div
          onDrop={props.onDrop}
          onDragOver={(event) => event.preventDefault()}
          onClick={() => props.fileRef.current?.click()}
          className="flex cursor-pointer items-center gap-3.5 rounded-[10px] border border-dashed border-[#2c3046] bg-[#0d0f19] px-4 py-4"
        >
          <input ref={props.fileRef} type="file" multiple accept="video/*" className="hidden" onChange={(event) => { if (event.target.files) props.addFiles(Array.from(event.target.files)); }} />
          <Upload className="h-5 w-5 shrink-0 text-[#8a8ea3]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">Upload a video</p>
            <p className="text-[13px] text-[#8a8ea3]">or drag and drop a file</p>
          </div>
          <span className="hidden text-[12px] text-[#8a8ea3] sm:inline">MP4, MOV, AVI, MKV · Max 500MB</span>
        </div>

        {props.videos.map((video) => (
          <div key={video.id} className="flex items-center gap-3 rounded-[10px] border border-[#1e2130] bg-[#10121c] px-3.5 py-2.5">
            <FileText className="h-4 w-4 shrink-0 text-[#8a8ea3]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{video.name} <span className="font-normal text-[#8a8ea3]">· {video.size}{video.durationSec ? ` · ${clock(video.durationSec)}` : ""}</span></p>
              <div className="mt-1.5 h-[3px] overflow-hidden rounded bg-[#1e2130]">
                <div className="h-full bg-[#7c5cff]" style={{ width: `${video.status === "done" ? 100 : video.status === "pending" ? 0 : video.progress}%` }} />
              </div>
            </div>
            <span className="shrink-0 text-[12px] text-[#8a8ea3]">
              {video.status === "done" ? `${video.outputs?.length || 0} ready` : video.status === "processing" ? `${video.completedCopies || 0} of ${props.copies}` : video.status}
            </span>
            {video.status === "pending" && (
              <button type="button" className="text-[12px] text-[#8a8ea3]" onClick={() => props.removeVideo(video.id)}>Remove</button>
            )}
          </div>
        ))}

        <div className="mt-1 flex items-center justify-between">
          <h2 className="text-[13px] font-medium">Generated variants <span className="ml-1.5 rounded border border-[#1e2130] px-1.5 text-[11px] font-normal text-[#8a8ea3]">{rows.length}</span></h2>
          <div>
            <button type="button" className="rounded-md border border-[#1e2130] px-2 py-1 text-[12px] text-[#b4b7c8]" onClick={() => props.setSelectedRows(rowIds)}>Select all</button>
            <button type="button" className="ml-1.5 rounded-md border border-[#1e2130] px-2 py-1 text-[12px] text-[#b4b7c8]" onClick={() => props.setSelectedRows([])}>Clear</button>
          </div>
        </div>

        <div className="overflow-auto rounded-[10px] border border-[#1e2130] bg-[#10121c]">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-[#8a8ea3]">
                <th className="w-8 px-2 py-2 font-medium" />
                <th className="w-12 px-2 py-2 font-medium" />
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Changes</th>
                <th className="hidden px-2 py-2 font-medium sm:table-cell">Duration</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[12px] text-[#8a8ea3]">No variants yet. Upload a video, then generate.</td>
                </tr>
              )}
              {rows.map((row) => {
                const on = selected.includes(row.id);
                const done = Boolean(row.output);
                return (
                  <tr key={row.id} className="border-t border-[#191c2a]">
                    <td className="px-2 py-2">
                      <button type="button" aria-label={on ? `Deselect ${row.title}` : `Select ${row.title}`} aria-pressed={on} onClick={() => props.setSelectedRows((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} className={`inline-block h-3.5 w-3.5 rounded border ${on ? "border-[#7c5cff] bg-[#7c5cff]" : "border-[#3a3f57]"}`} />
                    </td>
                    <td className="px-2 py-2">
                      <Thumb file={row.output ? undefined : row.video.file} src={row.output?.url} />
                    </td>
                    <td className="max-w-[180px] px-2 py-2">
                      <div className="truncate font-medium">{row.title}</div>
                      <div className="truncate text-[12px] text-[#8a8ea3]">{row.output?.filename || row.video.name}</div>
                    </td>
                    <td className="px-2 py-2 whitespace-normal">
                      {(row.video.chips || []).slice(0, 4).map((chip) => (
                        <span key={chip} className="mb-1 mr-1 inline-block rounded border border-[#262a3c] bg-[#141625] px-1.5 py-0.5 text-[11.5px] text-[#c4c7d6]">{chip}</span>
                      ))}
                    </td>
                    <td className="hidden px-2 py-2 tabular-nums text-[#8a8ea3] sm:table-cell">{clock(row.video.durationSec)}</td>
                    <td className="px-2 py-2 text-[12px] whitespace-nowrap">
                      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${row.video.status === "done" ? "bg-[#3ecf8e]" : row.video.status === "error" ? "bg-red-400" : "bg-[#7c5cff]"}`} />
                      {row.video.status === "processing" ? `Processing ${row.video.progress}%` : row.video.status === "done" ? "Done" : row.video.status === "error" ? "Failed" : "Pending"}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {done && row.output ? (
                        <>
                          <button type="button" className="px-2 py-1 text-[12px] text-[#b4b7c8]" onClick={() => props.onPreview(row.video, row.index)}>Preview</button>
                          <a href={row.output.url} download={row.output.filename} className="px-2 py-1 text-[12px] text-[#b4b7c8]">Download</a>
                        </>
                      ) : <span className="text-[#8a8ea3]">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="sticky bottom-16 z-[1] mt-auto flex items-center justify-between rounded-[10px] border border-[#2a2e44] bg-[#10121c] px-3.5 py-2 lg:bottom-3">
          <span className="text-[13px]"><b>{selected.length}</b> selected</span>
          <div className="flex items-center">
            <button type="button" disabled={zipping || totalOutputs === 0} onClick={downloadZip} className="rounded-md border border-[#1e2130] px-2.5 py-1 text-[12px] text-[#b4b7c8] disabled:opacity-40">
              {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Download className="mr-1 inline h-3.5 w-3.5" />Download zip</>}
            </button>
          </div>
        </div>
        {processing && <p className="text-[12px] text-[#8a8ea3]">Processing — do not close this tab.</p>}

        <button type="button" className="fixed bottom-3 left-3 right-3 z-30 flex items-center justify-center gap-2 rounded-[9px] bg-[#7c5cff] py-2.5 text-[13px] font-medium text-white lg:hidden" onClick={() => props.setSettingsOpen(true)}>
          <Settings className="h-4 w-4" /> Settings
        </button>
      </section>
      {props.settingsOpen && <button type="button" aria-label="Close settings" className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={() => props.setSettingsOpen(false)} />}
      {panel}
    </div>
  );
}

function Thumb({ file, src }: { file?: File; src?: string }) {
  const [url, setUrl] = useState(src || "");
  useEffect(() => {
    if (src) {
      setUrl(src);
      return;
    }
    if (!file) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file, src]);
  if (!url) return <div className="h-14 w-10 rounded-[5px] border border-[#1e2130] bg-[#0d0f19]" />;
  return <video src={url} muted playsInline preload="metadata" className="h-14 w-10 rounded-[5px] border border-[#1e2130] bg-black object-cover" />;
}

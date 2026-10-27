"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CaptionStyle } from "@/lib/caption-ass";
import { clampSpeed, composedStart, setSegmentSpeed, splitAt, type Segment } from "@/lib/edit-timeline";
import type { EditorDoc } from "@/lib/editor-doc";

type Tab = "Video" | "Audio" | "Speed" | "Animation" | "Adjustment";

const TABS: Tab[] = ["Video", "Audio", "Speed", "Animation", "Adjustment"];

export default function Inspector(props: {
  clip: Segment | null;
  segments: Segment[];
  editor: EditorDoc;
  style: CaptionStyle;
  onChange: (change: { segments?: Segment[]; editor?: EditorDoc; style?: CaptionStyle }) => void;
  onPreview: (segments: Segment[]) => void;
  onGestureStart: () => void;
  onGestureEnd: (kind: "clips" | "cues") => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("Video");
  const clip = props.clip;

  function patch(partial: Partial<Segment>, commit: boolean) {
    if (!clip) {
      props.onError("Select a clip first.");
      return;
    }
    const segments = props.segments.map((seg) => (seg.id === clip.id ? { ...seg, ...partial } : seg));
    if (commit) props.onChange({ segments });
    else props.onPreview(segments);
  }

  function ramp() {
    if (!clip) {
      props.onError("Select a clip first.");
      return;
    }
    const index = props.segments.findIndex((seg) => seg.id === clip.id);
    const mid = (clip.start + clip.end) / 2;
    const at = composedStart(props.segments, index) + (mid - clip.start) / clampSpeed(clip.speed);
    const split = splitAt(props.segments, at);
    if (split.length === props.segments.length) {
      props.onError("The clip is too short to split for a ramp.");
      return;
    }
    const second = split[index + 1];
    props.onChange({ segments: setSegmentSpeed(split, second.id, 0.5) });
    props.onNotice("Second half plays at 0.5×.");
  }

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-[#2c3038] bg-[#1a1d24]">
      <div className="grid h-9 shrink-0 grid-cols-5 border-b border-[#2c3038]" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            title={name}
            onClick={() => setTab(name)}
            className={`min-w-0 truncate px-0.5 text-center text-[11px] ${tab === name ? "border-b-2 border-[#22d3ee] text-[#f4f4f5]" : "text-[#8e939c]"}`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {tab === "Video" && (
          <>
            <Section title="Transform">
              <Slider
                label="Scale"
                min={40}
                max={160}
                step={1}
                value={Math.round((clip?.scale ?? 1) * 100)}
                display={`${Math.round((clip?.scale ?? 1) * 100)}%`}
                disabled={!clip}
                onStart={props.onGestureStart}
                onChange={(value) => patch({ scale: value / 100 }, false)}
                onEnd={() => props.onGestureEnd("clips")}
              />
              <div className="flex items-center gap-2 text-[11px] text-[#b7bcc4]">
                <span className="w-14 shrink-0">Position</span>
                <Num label="X" value={clip?.x || 0} disabled={!clip} onCommit={(value) => patch({ x: value }, true)} />
                <Num label="Y" value={clip?.y || 0} disabled={!clip} onCommit={(value) => patch({ y: value }, true)} />
              </div>
              <Slider
                label="Rotation"
                min={-180}
                max={180}
                step={1}
                value={clip?.rotate || 0}
                display={`${clip?.rotate || 0}°`}
                disabled={!clip}
                onStart={props.onGestureStart}
                onChange={(value) => patch({ rotate: value }, false)}
                onEnd={() => props.onGestureEnd("clips")}
              />
              <div className="flex gap-1">
                <Toggle on={Boolean(clip?.flipX)} disabled={!clip} onClick={() => patch({ flipX: !clip?.flipX }, true)}>Flip H</Toggle>
                <Toggle on={Boolean(clip?.flipY)} disabled={!clip} onClick={() => patch({ flipY: !clip?.flipY }, true)}>Flip V</Toggle>
              </div>
            </Section>
            <Section title="Compositing">
              <label className="block text-[11px] text-[#b7bcc4]">
                Blend mode
                <select aria-label="Blend mode" className="mt-1 h-7 w-full rounded border border-[#2c3038] bg-[#121418] px-2 text-[12px] text-[#e8e8e8]" defaultValue="normal">
                  <option value="normal">Normal</option>
                </select>
              </label>
              <Slider
                label="Opacity"
                min={0}
                max={100}
                step={1}
                value={Math.round((clip?.opacity ?? 1) * 100)}
                display={`${Math.round((clip?.opacity ?? 1) * 100)}%`}
                disabled={!clip}
                onStart={props.onGestureStart}
                onChange={(value) => patch({ opacity: value / 100 }, false)}
                onEnd={() => props.onGestureEnd("clips")}
              />
            </Section>
            <Section title="Mask">
              {(clip?.crop || 0) > 0 ? (
                <Slider
                  label="Inset"
                  min={0}
                  max={30}
                  step={1}
                  value={Math.round((clip?.crop || 0) * 100)}
                  display={`${Math.round((clip?.crop || 0) * 100)}%`}
                  disabled={!clip}
                  onStart={props.onGestureStart}
                  onChange={(value) => patch({ crop: value / 100 }, false)}
                  onEnd={() => props.onGestureEnd("clips")}
                />
              ) : (
                <button type="button" disabled={!clip} onClick={() => patch({ crop: 0.08 }, true)} className="flex h-7 w-full items-center justify-center rounded border border-[#2c3038] text-[12px] text-[#d5d8de] disabled:opacity-40">
                  + Add Mask
                </button>
              )}
            </Section>
            <Section title="Video Effects">
              <div className="flex flex-wrap gap-1">
                {(["none", "punch", "shake", "blur"] as const).map((effect) => (
                  <Toggle key={effect} on={(clip?.effect || "none") === effect} disabled={!clip} onClick={() => patch({ effect }, true)}>
                    {effect}
                  </Toggle>
                ))}
              </div>
            </Section>
          </>
        )}
        {tab === "Audio" && (
          <Section title="Volume">
            <Slider
              label="Volume"
              min={0}
              max={100}
              step={1}
              value={Math.round((clip?.volume ?? 1) * 100)}
              display={`${Math.round((clip?.volume ?? 1) * 100)}%`}
              disabled={!clip}
              onStart={props.onGestureStart}
              onChange={(value) => patch({ volume: value / 100 }, false)}
              onEnd={() => props.onGestureEnd("clips")}
            />
            <Slider
              label="Fade in"
              min={0}
              max={3}
              step={0.1}
              value={clip?.fadeIn || 0}
              display={`${(clip?.fadeIn || 0).toFixed(1)}s`}
              disabled={!clip}
              onStart={props.onGestureStart}
              onChange={(value) => patch({ fadeIn: value }, false)}
              onEnd={() => props.onGestureEnd("clips")}
            />
            <Slider
              label="Fade out"
              min={0}
              max={3}
              step={0.1}
              value={clip?.fadeOut || 0}
              display={`${(clip?.fadeOut || 0).toFixed(1)}s`}
              disabled={!clip}
              onStart={props.onGestureStart}
              onChange={(value) => patch({ fadeOut: value }, false)}
              onEnd={() => props.onGestureEnd("clips")}
            />
          </Section>
        )}
        {tab === "Speed" && (
          <Section title="Speed">
            <Slider
              label="Speed"
              min={0.25}
              max={4}
              step={0.05}
              value={clampSpeed(clip?.speed)}
              display={`${clampSpeed(clip?.speed).toFixed(2)}×`}
              disabled={!clip}
              onStart={props.onGestureStart}
              onChange={(value) => {
                if (!clip) return;
                props.onPreview(setSegmentSpeed(props.segments, clip.id, value));
              }}
              onEnd={() => props.onGestureEnd("clips")}
            />
            <div className="flex flex-wrap gap-1">
              <Toggle on={false} disabled={!clip} onClick={ramp}>Ramp</Toggle>
              <Toggle on={Boolean(clip?.reverse)} disabled={!clip} onClick={() => patch({ reverse: !clip?.reverse }, true)}>Reverse</Toggle>
              <Toggle on={Boolean(clip?.freeze)} disabled={!clip} onClick={() => patch({ freeze: !clip?.freeze }, true)}>Freeze</Toggle>
            </div>
          </Section>
        )}
        {tab === "Animation" && (
          <>
            <Section title="Transition">
              <div className="flex flex-wrap gap-1">
                {(["none", "fade", "slide"] as const).map((transition) => (
                  <Toggle key={transition} on={(clip?.transition || "none") === transition} disabled={!clip} onClick={() => patch({ transition }, true)}>
                    {transition}
                  </Toggle>
                ))}
              </div>
            </Section>
            <Section title="Caption">
              <div className="flex flex-wrap gap-1">
                {(["none", "pop", "scale"] as const).map((animation) => (
                  <Toggle key={animation} on={props.style.animation === animation} onClick={() => props.onChange({ style: { ...props.style, animation } })}>
                    {animation}
                  </Toggle>
                ))}
              </div>
            </Section>
            <Section title="Keyframes">
              <button
                type="button"
                disabled={!clip}
                onClick={() =>
                  patch(
                    {
                      keyframes: [
                        { t: 0, x: clip?.x || 0, y: clip?.y || 0, scale: clip?.scale || 1 },
                        { t: 1, x: (clip?.x || 0) + 90, y: clip?.y || 0, scale: clip?.scale || 1 },
                      ],
                    },
                    true
                  )
                }
                className="flex h-7 w-full items-center justify-center rounded border border-[#2c3038] text-[12px] text-[#d5d8de] disabled:opacity-40"
              >
                Move right
              </button>
              <p className="text-[11px] text-[#8e939c]">Position moves between the two keys. Scale stays on the first key.</p>
            </Section>
          </>
        )}
        {tab === "Adjustment" && (
          <Section title="Colour">
            <Slider label="Brightness" min={-30} max={30} step={1} value={Math.round((clip?.brightness || 0) * 100)} display={`${Math.round((clip?.brightness || 0) * 100)}`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ brightness: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Contrast" min={40} max={200} step={1} value={Math.round((clip?.contrast ?? 1) * 100)} display={`${Math.round((clip?.contrast ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ contrast: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Saturation" min={0} max={200} step={1} value={Math.round((clip?.saturation ?? 1) * 100)} display={`${Math.round((clip?.saturation ?? 1) * 100)}%`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ saturation: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
            <Slider label="Temperature" min={-100} max={100} step={1} value={Math.round((clip?.temperature || 0) * 100)} display={`${Math.round((clip?.temperature || 0) * 100)}`} disabled={!clip} onStart={props.onGestureStart} onChange={(value) => patch({ temperature: value / 100 }, false)} onEnd={() => props.onGestureEnd("clips")} />
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b border-[#2c3038]">
      <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-[12px] text-[#e4e4e7] [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8e939c] group-open:rotate-180" />
        <span className="truncate">{title}</span>
      </summary>
      <div className="space-y-2 px-3 pb-3">{children}</div>
    </details>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  disabled?: boolean;
  onStart: () => void;
  onChange: (value: number) => void;
  onEnd: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="shrink-0 text-[#b7bcc4]">{props.label}</span>
        <span className="shrink-0 tabular-nums text-[#e8e8e8]">{props.display}</span>
      </span>
      <input
        aria-label={props.label}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onPointerDown={props.onStart}
        onChange={(event) => {
          props.onStart();
          props.onChange(Number(event.target.value));
        }}
        onPointerUp={props.onEnd}
        onKeyUp={props.onEnd}
        onBlur={props.onEnd}
        className="h-1 w-full accent-[#22d3ee] disabled:opacity-40"
      />
    </label>
  );
}

function Num({ label, value, disabled, onCommit }: { label: string; value: number; disabled?: boolean; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : String(value);
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1">
      <span className="shrink-0">{label}</span>
      <input
        aria-label={`Position ${label}`}
        type="number"
        disabled={disabled}
        value={shown}
        onFocus={() => {
          setFocused(true);
          setText(String(value));
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          setFocused(false);
          const next = Number(text);
          if (Number.isFinite(next)) onCommit(Math.max(-800, Math.min(800, Math.round(next))));
        }}
        className="h-7 w-full min-w-0 rounded border border-[#2c3038] bg-[#121418] px-1.5 text-[12px] text-[#e8e8e8] disabled:opacity-40"
      />
    </label>
  );
}

function Toggle({ children, on, disabled, onClick }: { children: React.ReactNode; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`h-7 min-w-0 truncate rounded border px-2 text-[11px] capitalize disabled:opacity-40 ${on ? "border-[#22d3ee] text-[#f4f4f5]" : "border-[#2c3038] text-[#c8ccd2]"}`}
    >
      {children}
    </button>
  );
}

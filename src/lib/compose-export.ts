import path from "path";
import { atempoChain, clampSpeed, composedDuration, playDuration, type Segment } from "@/lib/edit-timeline";
import { canvasSize, type EditorDoc, type TextLayer } from "@/lib/editor-doc";

export type ComposeAsset = {
  id: string;
  path: string;
  kind: "video" | "image" | "audio";
  duration: number;
  audio: boolean;
};

export function composePlan(input: {
  segments: Segment[];
  editor: EditorDoc;
  assets: ComposeAsset[];
  mainAudio: boolean;
  assPath: string;
  fontsDir: string;
}) {
  const canvas = canvasSize(input.editor);
  const fps = input.editor.fps;
  const index = new Map<string, number>();
  const inputArgs: string[] = [];
  input.assets.forEach((asset, assetIndex) => {
    index.set(asset.id, assetIndex + 1);
    if (asset.kind === "image") inputArgs.push("-loop", "1", "-framerate", String(fps), "-t", "30", "-i", asset.path);
    else inputArgs.push("-i", asset.path);
  });
  const lines: string[] = [];
  input.segments.forEach((seg, clip) => {
    const speed = clampSpeed(seg.speed);
    const play = Math.max(0.12, playDuration(seg));
    const src = inputIndex(seg.assetId, index);
    lines.push(...videoLines(seg, clip, src, canvas, fps, play, speed, input.editor));
    lines.push(audioLine(seg, clip, src, play, speed, input.mainAudio, input.assets));
  });
  const pairs = input.segments.map((_, clip) => `[v${clip}][a${clip}]`).join("");
  lines.push(`${pairs}concat=n=${input.segments.length}:v=1:a=1[vc][amain]`);
  let visual = "[vc]";
  input.editor.overlays.forEach((layer, overlay) => {
    const asset = input.assets.find((item) => item.id === layer.assetId);
    const src = index.get(layer.assetId);
    if (!asset || src === undefined || asset.kind === "audio") return;
    const dur = Math.max(0.12, layer.out - layer.in);
    const box = even(canvas.width * (layer.scale || 0.45));
    const head =
      asset.kind === "image"
        ? `[${src}:v]trim=duration=${dur.toFixed(3)},setpts=PTS-STARTPTS+${layer.start.toFixed(3)}/TB`
        : `[${src}:v]trim=start=${layer.in.toFixed(3)}:end=${layer.out.toFixed(3)},setpts=PTS-STARTPTS+${layer.start.toFixed(3)}/TB`;
    lines.push(`${head},scale=${box}:-2,fps=${fps},format=yuv420p[ov${overlay}]`);
    const next = `[ovc${overlay}]`;
    lines.push(
      `${visual}[ov${overlay}]overlay=x='(W-w)/2+${Math.round(layer.x || 0)}':y='(H-h)/2+${Math.round(layer.y || 0)}':eof_action=pass${next}`
    );
    visual = next;
  });
  input.editor.texts.forEach((text, textIndex) => {
    const next = `[tx${textIndex}]`;
    lines.push(`${visual}${drawText(text, canvas.height, input.fontsDir)}${next}`);
    visual = next;
  });
  lines.push(`${visual}subtitles=${escapeFilter(input.assPath)}:fontsdir=${escapeFilter(input.fontsDir)}[vout]`);
  let audio = "[amain]";
  input.editor.audios.forEach((layer, audioIndex) => {
    const asset = input.assets.find((item) => item.id === layer.assetId);
    const src = index.get(layer.assetId);
    if (!asset || src === undefined || asset.kind === "image" || !asset.audio) return;
    const dur = Math.max(0.12, layer.out - layer.in);
    const delay = Math.max(0, Math.round(layer.start * 1000));
    const vol = (layer.volume ?? 0.8).toFixed(3);
    const fades: string[] = [];
    if ((layer.fadeIn || 0) > 0) fades.push(`afade=t=in:st=0:d=${Math.min(layer.fadeIn || 0, dur).toFixed(3)}`);
    if ((layer.fadeOut || 0) > 0) {
      fades.push(`afade=t=out:st=${Math.max(0, dur - (layer.fadeOut || 0)).toFixed(3)}:d=${Math.min(layer.fadeOut || 0, dur).toFixed(3)}`);
    }
    lines.push(
      `[${src}:a]atrim=start=${layer.in.toFixed(3)}:end=${layer.out.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol}${fades.length ? `,${fades.join(",")}` : ""},adelay=${delay}|${delay},aformat=sample_rates=48000:channel_layouts=stereo[mx${audioIndex}]`
    );
    const next = `[amx${audioIndex}]`;
    lines.push(`${audio}[mx${audioIndex}]amix=inputs=2:duration=first:dropout_transition=0:normalize=0${next}`);
    audio = next;
  });
  lines.push(`${audio}anull[aout]`);
  return { inputArgs, filter: lines.join(";"), duration: Math.max(0.2, composedDuration(input.segments)) };
}

function videoLines(
  seg: Segment,
  clip: number,
  src: number,
  canvas: { width: number; height: number },
  fps: number,
  play: number,
  speed: number,
  editor: EditorDoc
) {
  const W = canvas.width;
  const H = canvas.height;
  let chain = head(seg, src, play, speed);
  if (seg.flipX) chain += ",hflip";
  if (seg.flipY) chain += ",vflip";
  if ((seg.crop || 0) > 0.001) {
    const keep = (1 - 2 * (seg.crop || 0)).toFixed(4);
    const off = (seg.crop || 0).toFixed(4);
    chain += `,crop=iw*${keep}:ih*${keep}:iw*${off}:ih*${off}`;
  }
  if (seg.rotate) {
    const rad = ((seg.rotate * Math.PI) / 180).toFixed(5);
    chain += `,rotate=${rad}:ow=iw:oh=ih:c=black`;
  }
  const brightness = seg.brightness || 0;
  const contrast = seg.contrast ?? 1;
  const saturation = seg.saturation ?? 1;
  if (Math.abs(brightness) > 0.001 || Math.abs(contrast - 1) > 0.001 || Math.abs(saturation - 1) > 0.001) {
    chain += `,eq=brightness=${brightness.toFixed(3)}:contrast=${contrast.toFixed(3)}:saturation=${saturation.toFixed(3)}`;
  }
  if (Math.abs(seg.temperature || 0) > 0.02) {
    chain += `,colortemperature=temperature=${Math.round(6500 + (seg.temperature || 0) * 2000)}`;
  }
  if (seg.effect === "blur") chain += ",gblur=sigma=12";
  const fit = fitMode(editor, seg);
  const moved = hasMotion(seg);
  const lines: string[] = [];
  if (seg.effect === "punch" && fit === "cover" && !moved && seg.transition !== "slide") {
    const frames = Math.max(1, Math.round(fps * 0.45));
    chain += `,fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='min(1.16\\,1+0.16*min(1\\,on/${frames}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps},format=yuv420p,setsar=1`;
    if (seg.transition === "fade") chain += ",fade=t=in:st=0:d=0.35";
    lines.push(`${chain}[v${clip}]`);
    return lines;
  }
  if (seg.effect === "shake" && fit === "cover" && !moved && seg.transition !== "slide") {
    const amp = Math.max(4, Math.round(W * 0.02));
    const ampY = Math.max(3, Math.round(H * 0.015));
    chain += `,scale=${even(W * 1.08)}:${even(H * 1.08)}:force_original_aspect_ratio=increase,crop=${W}:${H}:x='(in_w-out_w)/2+${amp}*sin(t*16)':y='(in_h-out_h)/2+${ampY}*cos(t*19)',fps=${fps},format=yuv420p,setsar=1`;
    if (seg.transition === "fade") chain += ",fade=t=in:st=0:d=0.35";
    lines.push(`${chain}[v${clip}]`);
    return lines;
  }
  if (fit === "cover" && !moved && seg.transition !== "slide") {
    chain += `,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p`;
    if (seg.transition === "fade") chain += ",fade=t=in:st=0:d=0.35";
    lines.push(`${chain}[v${clip}]`);
    return lines;
  }
  const scale = seg.keyframes && seg.keyframes.length >= 2 ? seg.keyframes[0].scale : seg.scale ?? 1;
  const boxW = even(W * scale);
  const boxH = even(H * scale);
  if (fit === "blur") {
    lines.push(`${chain},split[bg${clip}][fgraw${clip}]`);
    lines.push(`[bg${clip}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=22,fps=${fps},format=yuv420p[bgf${clip}]`);
    lines.push(`[fgraw${clip}]scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease,${fgTail(seg, fps, clip)}`);
  } else {
    lines.push(`${chain},scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease,${fgTail(seg, fps, clip)}`);
    lines.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${play.toFixed(3)},format=yuv420p[bgf${clip}]`);
  }
  const slide = seg.transition === "slide" ? `+${W}*0.15*max(0\\,(0.35-t)/0.35)` : "";
  lines.push(
    `[bgf${clip}][fg${clip}]overlay=x='(W-w)/2+(${offsetExpr(seg, play, "x")})${slide}':y='(H-h)/2+(${offsetExpr(seg, play, "y")})':eval=frame:eof_action=pass,fps=${fps},format=yuv420p${seg.transition === "fade" ? ",fade=t=in:st=0:d=0.35" : ""}[v${clip}]`
  );
  return lines;
}

function head(seg: Segment, src: number, play: number, speed: number) {
  if (seg.kind === "image") return `[${src}:v]trim=duration=${play.toFixed(3)},setpts=PTS-STARTPTS`;
  if (seg.freeze) {
    const t = seg.start.toFixed(3);
    const t2 = (seg.start + 0.05).toFixed(3);
    return `[${src}:v]trim=start=${t}:end=${t2},setpts=PTS-STARTPTS,loop=loop=-1:size=1:start=0,trim=duration=${play.toFixed(3)},setpts=PTS-STARTPTS`;
  }
  if (seg.reverse) {
    return `[${src}:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS,reverse,setpts=(PTS-STARTPTS)/${speed.toFixed(3)}`;
  }
  return `[${src}:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=(PTS-STARTPTS)/${speed.toFixed(3)}`;
}

function audioLine(
  seg: Segment,
  clip: number,
  src: number,
  play: number,
  speed: number,
  mainAudio: boolean,
  assets: ComposeAsset[]
) {
  const asset = seg.assetId ? assets.find((item) => item.id === seg.assetId) : null;
  const audible = !seg.assetId ? mainAudio : Boolean(asset?.audio);
  if (seg.kind === "image" || seg.freeze || (seg.volume ?? 1) <= 0 || !audible) {
    return `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${play.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[a${clip}]`;
  }
  const fades: string[] = [];
  if ((seg.fadeIn || 0) > 0) fades.push(`afade=t=in:st=0:d=${Math.min(seg.fadeIn || 0, play).toFixed(3)}`);
  if ((seg.fadeOut || 0) > 0) {
    fades.push(`afade=t=out:st=${Math.max(0, play - (seg.fadeOut || 0)).toFixed(3)}:d=${Math.min(seg.fadeOut || 0, play).toFixed(3)}`);
  }
  let chain = `[${src}:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS`;
  if (seg.reverse) chain += ",areverse";
  if (Math.abs(speed - 1) > 0.001) chain += `,${atempoChain(speed)}`;
  chain += `,volume=${(seg.volume ?? 1).toFixed(3)}`;
  if (fades.length) chain += `,${fades.join(",")}`;
  return `${chain},aformat=sample_rates=48000:channel_layouts=stereo[a${clip}]`;
}

function drawText(text: TextLayer, height: number, fontsDir: string) {
  const file = text.emoji ? path.join(fontsDir, "NotoEmoji-Regular.ttf") : path.join(fontsDir, "Montserrat-Bold.ttf");
  const size = Math.max(12, Math.round(text.size * (height / 1920)));
  return `drawtext=fontfile=${escapeFilter(file)}:text='${escapeText(text.text)}':fontsize=${size}:fontcolor=${text.color}:x=(w-text_w)/2+${text.x}:y=(h-text_h)/2+${text.y}:enable='between(t\\,${text.start.toFixed(3)}\\,${text.end.toFixed(3)})':expansion=none`;
}

function fitMode(editor: EditorDoc, seg: Segment) {
  if (opacityOf(seg) < 0.999) return editor.background === "blur" ? "blur" : "contain";
  if (editor.background === "blur") return "blur";
  if (editor.aspect !== "9:16") return "contain";
  if (hasMotion(seg) || (seg.scale && Math.abs(seg.scale - 1) > 0.001) || seg.rotate || (seg.crop || 0) > 0) return "contain";
  return "cover";
}

function opacityOf(seg: Segment) {
  const value = Number(seg.opacity);
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function fgTail(seg: Segment, fps: number, clip: number) {
  const opacity = opacityOf(seg);
  if (opacity >= 0.999) return `fps=${fps},format=yuv420p[fg${clip}]`;
  return `fps=${fps},format=yuva420p,colorchannelmixer=aa=${opacity.toFixed(3)}[fg${clip}]`;
}

function hasMotion(seg: Segment) {
  if ((seg.x || 0) !== 0 || (seg.y || 0) !== 0) return true;
  const keys = seg.keyframes;
  if (!keys || keys.length < 2) return false;
  return keys[0].x !== keys[1].x || keys[0].y !== keys[1].y || Math.abs(keys[0].scale - keys[1].scale) > 0.02;
}

function offsetExpr(seg: Segment, play: number, axis: "x" | "y") {
  const keys = seg.keyframes;
  if (keys && keys.length >= 2) {
    const a = keys[0];
    const b = keys[1];
    const span = b.t - a.t || 1;
    return `${a[axis]}+(${b[axis] - a[axis]})*min(1\\,max(0\\,(t/${play.toFixed(3)}-${a.t.toFixed(3)})/${span.toFixed(3)}))`;
  }
  return String(Math.round(seg[axis] || 0));
}

function inputIndex(assetId: string | undefined, index: Map<string, number>) {
  if (!assetId) return 0;
  return index.get(assetId) ?? 0;
}

function even(value: number) {
  const next = Math.max(2, Math.round(value));
  return next % 2 === 0 ? next : next - 1;
}

function escapeFilter(filePath: string) {
  return filePath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "").replace(/:/g, "\\:").replace(/%/g, "");
}

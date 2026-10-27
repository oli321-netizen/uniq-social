import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import { NextResponse } from "next/server";

export function fileResponse(filePath: string, req: Request, contentType: string, downloadName?: string) {
  const size = statSync(filePath).size;
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
  });
  if (downloadName) {
    headers.set("Content-Disposition", `attachment; filename="${downloadName.replace(/"/g, "")}"`);
  }
  const range = req.headers.get("range");
  if (!range) {
    headers.set("Content-Length", String(size));
    return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream, { status: 200, headers });
  }
  const match = /bytes=(\d+)-(\d*)/.exec(range);
  if (!match) return new NextResponse(null, { status: 416 });
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (start >= size || end >= size || start > end) {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new NextResponse(Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream, {
    status: 206,
    headers,
  });
}

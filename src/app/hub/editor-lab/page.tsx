import { Suspense } from "react";
import HookLab from "@/components/hub/HookLab";

export default function EditorLabPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading Editor Lab…</div>}>
        <HookLab />
      </Suspense>
    </div>
  );
}

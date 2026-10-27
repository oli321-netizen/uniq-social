import { Suspense } from "react";
import HookLab from "@/components/hub/HookLab";

export default function HookLabPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading Hook Lab…</div>}>
        <HookLab />
      </Suspense>
    </div>
  );
}

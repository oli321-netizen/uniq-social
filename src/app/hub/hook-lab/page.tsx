import { Suspense } from "react";
import HookLab from "@/components/hub/HookLab";

export default function HookLabPage() {
  return (
    <div className="flex h-[calc(100dvh-5.75rem)] min-h-0 flex-col overflow-hidden md:h-[calc(100dvh-3.5rem)]">
      <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading Hook Lab…</div>}>
        <HookLab />
      </Suspense>
    </div>
  );
}

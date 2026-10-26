import { Suspense } from "react";
import HookLab from "@/components/hub/HookLab";

export default function HookLabPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[#8A8A9A]">Loading Hook Lab…</div>}>
      <HookLab />
    </Suspense>
  );
}

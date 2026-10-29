import { Suspense } from "react";
import { redirect } from "next/navigation";
import HookLab from "@/components/hub/HookLab";
import LockedFeature from "@/components/hub/LockedFeature";
import { paidAccess } from "@/lib/plan-access";
import { requireUserId } from "@/lib/session";

export default async function EditorLabPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/login?callbackUrl=/hub/editor-lab");
  const access = await paidAccess(userId);
  if (!access.allowed) return <LockedFeature title="Editor Lab" />;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Suspense fallback={<div className="p-6 text-sm text-[#8a8ea3]">Loading Editor Lab…</div>}>
        <HookLab />
      </Suspense>
    </div>
  );
}

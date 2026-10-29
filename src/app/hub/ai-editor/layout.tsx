import { redirect } from "next/navigation";
import LockedFeature from "@/components/hub/LockedFeature";
import { paidAccess } from "@/lib/plan-access";
import { requireUserId } from "@/lib/session";

export default async function AiEditorLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId();
  if (!userId) redirect("/login?callbackUrl=/hub/ai-editor");
  const access = await paidAccess(userId);
  if (!access.allowed) return <LockedFeature title="AI Editor" />;
  return children;
}

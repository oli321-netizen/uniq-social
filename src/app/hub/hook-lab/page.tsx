import { redirect } from "next/navigation";

export default function HookLabRedirect({
  searchParams,
}: {
  searchParams?: { project?: string; creator?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams?.project) params.set("project", searchParams.project);
  if (searchParams?.creator) params.set("creator", searchParams.creator);
  const query = params.toString();
  redirect(query ? `/hub/editor-lab?${query}` : "/hub/editor-lab");
}

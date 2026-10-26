import Soon from "@/components/hub/Soon";

export default function ProcessPage() {
  return (
    <Soon
      title="Process"
      body="Rendering still uses the existing processor, unchanged. Open it to upload a video and run a job with the current controls. The hub variant grid will call that same processor in a follow-up without rewriting it."
      href="/dashboard"
      action="Open the existing processor"
    />
  );
}

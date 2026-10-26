import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
      <p className="text-[14px] leading-relaxed text-[#8A8A9A]">
        Billing, password, and the existing subscription portal stay on the account page. Postiz scheduling is a separate integration and is not connected in this deploy: there is no API key field yet, and nothing is sent to Postiz.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/account"
          className="inline-flex rounded-lg bg-[#8B5CF6] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#7C3AED]"
        >
          Open account
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex rounded-lg border border-[#23232F] px-4 py-2 text-[13px] text-[#E8E8F0] hover:bg-white/5"
        >
          Existing processor
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function LockedFeature({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-10 text-[13px] text-[#e6e7ee]">
      <h1 className="text-[15px] font-medium">{title}</h1>
      <p className="text-[#b4b7c8]">{title} is part of a paid plan. You are on Free.</p>
      <p className="text-[12px] text-[#8a8ea3]">Subscribe to a monthly plan to open it. Processing stays on every plan.</p>
      <Link href="/account#plans" className="mt-2 inline-flex h-10 items-center justify-center rounded-[9px] bg-[#7c5cff] px-4 font-medium text-white">
        View plans
      </Link>
      <Link href="/dashboard" className="text-center text-[12px] text-[#8a8ea3]">Back to Process</Link>
    </div>
  );
}

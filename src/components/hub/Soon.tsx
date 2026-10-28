import Link from "next/link";

export default function Soon({
  title,
  body,
  href,
  action,
}: {
  title: string;
  body: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 px-6 py-16">
      <p className="text-[15px] text-purple-300">Coming soon</p>
      <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
      <p className="text-[14px] leading-relaxed text-[#8A8A9A]">{body}</p>
      {href && action && (
        <Link
          href={href}
          className="mt-2 inline-flex w-fit rounded-lg bg-[#7c5cff] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#6d4ef0]"
        >
          {action}
        </Link>
      )}
    </div>
  );
}

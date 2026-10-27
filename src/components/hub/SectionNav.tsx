"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const SECTIONS = [
  { href: "/dashboard", label: "Process" },
  { href: "/hub/editor-lab", label: "Editor Lab" },
  { href: "/hub/variants", label: "Variants" },
  { href: "/hub/creators", label: "Creators" },
  { href: "/hub/results", label: "Results" },
  { href: "/hub/presets", label: "Presets" },
  { href: "/hub/team", label: "Team" },
  { href: "/hub/settings", label: "Settings" },
];

function active(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SectionNav({ variant }: { variant: "strip" | "sidebar" }) {
  const pathname = usePathname() || "";
  if (variant === "sidebar") {
    return (
      <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Sections">
        {SECTIONS.map((item) => {
          const on = active(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-[14px] ${on ? "bg-purple-500/15 font-medium text-purple-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="flex h-9 items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#0a0a1a] px-2" aria-label="Sections">
      {SECTIONS.map((item) => {
        const on = active(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded px-2.5 py-1 text-[13px] ${on ? "bg-purple-500/15 text-purple-200" : "text-slate-400 hover:text-white"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

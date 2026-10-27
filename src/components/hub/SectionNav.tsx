"use client";

import { useEffect, useState } from "react";
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

export const EDITOR_PROJECT_KEY = "editor-lab-project";
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function editorLabHref(projectId?: string | null) {
  if (!projectId || !PROJECT_ID.test(projectId)) return "/hub/editor-lab";
  return `/hub/editor-lab?project=${projectId}`;
}

export function rememberEditorProject(projectId: string) {
  if (!PROJECT_ID.test(projectId)) return;
  try {
    sessionStorage.setItem(EDITOR_PROJECT_KEY, projectId);
  } catch {
    /* storage can be unavailable */
  }
}

function active(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SectionNav({ variant }: { variant: "strip" | "sidebar" }) {
  const pathname = usePathname() || "";
  const [projectId, setProjectId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(EDITOR_PROJECT_KEY);
      setProjectId(stored && PROJECT_ID.test(stored) ? stored : null);
    } catch {
      setProjectId(null);
    }
  }, [pathname]);

  function hrefFor(href: string) {
    return href === "/hub/editor-lab" ? editorLabHref(projectId) : href;
  }

  if (variant === "sidebar") {
    return (
      <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Sections">
        {SECTIONS.map((item) => {
          const on = active(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={hrefFor(item.href)}
              className={`truncate rounded-md px-3 py-2 text-[14px] ${on ? "bg-purple-500/15 font-medium text-purple-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
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
            href={hrefFor(item.href)}
            className={`shrink-0 whitespace-nowrap rounded px-2.5 py-1 text-[13px] ${on ? "bg-purple-500/15 text-purple-200" : "text-slate-400 hover:text-white"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

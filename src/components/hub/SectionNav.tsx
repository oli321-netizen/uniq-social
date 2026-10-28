"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Clapperboard, Film, LayoutGrid, Settings, SlidersHorizontal, UserRound, Users } from "lucide-react";

export const SECTIONS = [
  { href: "/dashboard", label: "Process", icon: Clapperboard },
  { href: "/hub/editor-lab", label: "Editor Lab", icon: Film },
  { href: "/hub/variants", label: "Variants", icon: LayoutGrid },
  { href: "/hub/creators", label: "Creators", icon: UserRound },
  { href: "/hub/results", label: "Results", icon: BarChart3 },
  { href: "/hub/presets", label: "Presets", icon: SlidersHorizontal },
  { href: "/hub/team", label: "Team", icon: Users },
  { href: "/hub/settings", label: "Settings", icon: Settings },
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

export default function SectionNav({ collapsed }: { collapsed?: boolean }) {
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

  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Sections">
      {SECTIONS.map((item) => {
        const on = active(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={hrefFor(item.href)}
            title={item.label}
            className={`flex items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-[13px] ${
              on ? "bg-[#171a2b] text-white" : "text-[#9a9eb2] hover:bg-white/[0.04] hover:text-white"
            } ${collapsed ? "justify-center px-0" : ""}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${on ? "text-[#7c5cff]" : ""}`} />
            {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

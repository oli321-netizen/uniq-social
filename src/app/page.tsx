import {
  ArrowRight,
  BarChart3,
  Bookmark,
  Clapperboard,
  Fingerprint,
  Layers,
  Settings,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

const SERVICES = [
  {
    href: "/dashboard",
    title: "Video processor",
    body: "Open the existing processor. Upload a video and render it with the controls already on that page.",
    icon: Clapperboard,
  },
  {
    href: "/hub/hook-lab",
    title: "Hook Lab",
    body: "Write hook lines, keep them per creator, and mark the ones you want to try.",
    icon: Sparkles,
  },
  {
    href: "/hub/variants",
    title: "Variants",
    body: "Look through the variants saved from a render.",
    icon: Layers,
  },
  {
    href: "/hub/creators",
    title: "Creators",
    body: "Creator profiles and brand voice.",
    icon: UserRound,
  },
  {
    href: "/hub/results",
    title: "Results",
    body: "Log views, watch time, shares, saves, and follows.",
    icon: BarChart3,
  },
  {
    href: "/hub/presets",
    title: "Presets",
    body: "Save a setup and use it again.",
    icon: Bookmark,
  },
  {
    href: "/hub/team",
    title: "Team",
    body: "People who share this account.",
    icon: Users,
  },
  {
    href: "/hub/settings",
    title: "Settings",
    body: "Account and connected tools.",
    icon: Settings,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#010313] text-white">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />
      <header className="relative z-10 border-b border-white/5 bg-[#010313]/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10">
              <Fingerprint className="h-4 w-4 text-purple-400" />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Uniq<span className="text-purple-400">Social</span>
            </span>
          </a>
          <a href="/login" className="text-sm text-slate-400 transition-colors hover:text-white">
            Log in
          </a>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <p className="mt-2 text-sm text-slate-400">Pick one to open it.</p>
        <ul className="mt-6 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <li key={service.href}>
                <a
                  href={service.href}
                  className="group flex items-center gap-4 px-4 py-4 transition-colors duration-200 hover:bg-white/[0.04] motion-safe:hover:pl-5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10 transition-colors duration-200 group-hover:bg-purple-500/15">
                    <Icon className="h-5 w-5 text-purple-400" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{service.title}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-slate-400">{service.body}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-hover:text-purple-300 motion-safe:group-hover:translate-x-0.5" aria-hidden />
                </a>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

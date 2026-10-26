"use client";

import { useState } from "react";
import { ArrowRight, Check, Clapperboard, LineChart, PenLine, Sparkles } from "lucide-react";

const NAV = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how" },
  { label: "Credits", href: "#pricing" },
];

function Navbar() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-[#23232F] bg-[#0A0A0F]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <a href="/" className="flex items-center gap-2 text-[#E8E8F0]">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#8B5CF6] text-sm font-semibold text-white">u</span>
          <span className="font-semibold tracking-tight">uniq</span>
        </a>
        <div className="hidden items-center gap-6 md:flex">
          {NAV.map((link) => (
            <a key={link.href} href={link.href} className="text-[13px] text-[#8A8A9A] hover:text-[#E8E8F0]">
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <a href="/login" className="px-3 py-2 text-[13px] text-[#8A8A9A] hover:text-[#E8E8F0]">
            Sign in
          </a>
          <a href="/hub" className="rounded-lg bg-[#8B5CF6] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#7C3AED]">
            Open the hub
          </a>
        </div>
      </div>
    </nav>
  );
}

function Pricing() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function subscribe(planKey: string) {
    setLoadingPlan(planKey);
    setMessage("");
    try {
      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (res.status === 401) {
        window.location.href = "/login?callbackUrl=/#pricing";
        return;
      }
      setMessage(data.error || "Checkout needs STRIPE_SECRET_KEY on the server.");
    } catch {
      setMessage("Could not start checkout.");
    } finally {
      setLoadingPlan(null);
    }
  }

  const plans = [
    { key: "starter", name: "Starter", price: "24", credits: "100", features: ["100 credits", "Hook Lab", "Existing processor"] },
    { key: "growth", name: "Growth", price: "75", credits: "500", features: ["500 credits", "Hook Lab", "Existing processor"] },
    { key: "pro", name: "Pro", price: "150", credits: "1,500", features: ["1,500 credits", "Hook Lab", "API access"], popular: true },
    { key: "business", name: "Business", price: "350", credits: "5,000", features: ["5,000 credits", "Hook Lab", "Priority support"] },
    { key: "agency", name: "Agency", price: "750", credits: "15,000", features: ["15,000 credits", "Hook Lab", "Dedicated support"] },
  ];

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-20">
      <p className="text-[12px] font-medium uppercase tracking-wide text-[#8B5CF6]">Credits</p>
      <h2 className="mt-2 text-3xl font-medium tracking-tight">One credit renders one video</h2>
      <p className="mt-3 max-w-xl text-[14px] text-[#8A8A9A]">
        New accounts get 5 credits after email verification. Bigger packs use the same Stripe plans this app already bills.
      </p>
      {message && (
        <p className="mt-4 text-[13px] text-[#F87171]" role="alert">
          {message}
        </p>
      )}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {plans.map((plan) => (
          <article
            key={plan.key}
            className={`rounded-[10px] border p-4 ${plan.popular ? "border-[#8B5CF6]/50 bg-[#8B5CF6]/10" : "border-[#23232F] bg-[#12121A]"}`}
          >
            <h3 className="text-[14px] font-medium">{plan.name}</h3>
            <p className="mt-2 font-mono text-2xl">£{plan.price}</p>
            <p className="text-[12px] text-[#8A8A9A]">{plan.credits} credits</p>
            <ul className="mt-4 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-[12px] text-[#E8E8F0]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8B5CF6]" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => subscribe(plan.key)}
              disabled={loadingPlan === plan.key}
              className="mt-4 w-full rounded-lg bg-[#8B5CF6] py-2 text-[13px] font-medium text-white hover:bg-[#7C3AED] disabled:opacity-50"
            >
              {loadingPlan === plan.key ? "Opening…" : "Get started"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] text-[#E8E8F0]">
      <Navbar />
      <section className="mx-auto max-w-4xl px-4 pb-16 pt-32 text-center">
        <p className="text-[12px] font-medium uppercase tracking-wide text-[#8B5CF6]">Creator hub</p>
        <h1 className="mt-4 text-4xl font-medium tracking-tight sm:text-6xl">
          Write the hook. Test the cut. Keep what holds.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-[#8A8A9A]">
          Uniq is a workspace for short-form video: estimated hook lines for a creator, the existing renderer when you need a file, and a record of what you tried.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="/hub" className="inline-flex items-center gap-2 rounded-lg bg-[#8B5CF6] px-5 py-3 text-[14px] font-medium text-white hover:bg-[#7C3AED]">
            Open the hub
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a href="/login" className="inline-flex items-center rounded-lg border border-[#23232F] px-5 py-3 text-[14px] text-[#E8E8F0] hover:bg-white/5">
            Sign in
          </a>
        </div>
      </section>

      <section id="product" className="mx-auto grid max-w-6xl gap-3 px-4 pb-8 sm:grid-cols-3">
        {[
          {
            icon: PenLine,
            title: "Hook Lab",
            body: "Pick a creator, paste a topic or transcript, and save hook lines with an estimated score. The score is labelled as an estimate. Without an API key the lab uses a local template.",
          },
          {
            icon: Clapperboard,
            title: "The processor you already run",
            body: "Rendering stays on the current pipeline. The hub links to it and does not add a second encoder or any overlay meant to disguise a file.",
          },
          {
            icon: LineChart,
            title: "A place for the result",
            body: "Hooks keep fields for views, watch time, shares, saves, and follows so a later log can show which line was worth repeating.",
          },
        ].map((item) => (
          <article key={item.title} className="rounded-[10px] border border-[#23232F] bg-[#12121A] p-5">
            <item.icon className="h-5 w-5 text-[#8B5CF6]" aria-hidden />
            <h2 className="mt-3 text-[16px] font-medium">{item.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#8A8A9A]">{item.body}</p>
          </article>
        ))}
      </section>

      <section id="how" className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-[12px] font-medium uppercase tracking-wide text-[#8B5CF6]">How it works</p>
        <ol className="mt-6 space-y-3">
          {[
            ["Write", "Add a creator and a topic. Generate five hook lines or type your own."],
            ["Judge the estimate", "Scores and sparklines are a starting rank, not a promise about reach."],
            ["Render when you mean to", "Open the existing processor with the line copied. It still charges one credit per render."],
            ["Come back to the history", "Each creator keeps their hooks, including favourites you want to reuse."],
          ].map(([title, body], index) => (
            <li key={title} className="flex gap-4 rounded-[10px] border border-[#23232F] bg-[#12121A] p-4">
              <span className="font-mono text-[13px] text-[#8B5CF6]">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="text-[15px] font-medium">{title}</h3>
                <p className="mt-1 text-[13px] text-[#8A8A9A]">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <Pricing />

      <section className="mx-auto max-w-4xl px-4 pb-20">
        <div className="rounded-[10px] border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-6 py-10 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-[#C4B5FD]" aria-hidden />
          <h2 className="mt-3 text-3xl font-medium tracking-tight">Start in Hook Lab</h2>
          <p className="mx-auto mt-2 max-w-lg text-[14px] text-[#8A8A9A]">
            Sign in, name a creator, and generate a first set of lines. Demo mode works before any model key is added.
          </p>
          <a href="/login" className="mt-6 inline-flex rounded-lg bg-[#8B5CF6] px-5 py-3 text-[14px] font-medium text-white hover:bg-[#7C3AED]">
            Sign in
          </a>
        </div>
      </section>

      <footer className="border-t border-[#23232F] px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 text-[13px] text-[#8A8A9A] sm:flex-row sm:items-center">
          <span>uniq</span>
          <div className="flex gap-4">
            <a href="/terms" className="hover:text-[#E8E8F0]">Terms</a>
            <a href="/privacy" className="hover:text-[#E8E8F0]">Privacy</a>
            <a href="mailto:support@uniqsocial.com" className="hover:text-[#E8E8F0]">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

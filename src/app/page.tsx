"use client";

import { useState } from "react";
import {
  Zap,
  Shield,
  Layers,
  ArrowRight,
  Check,
  Upload,
  Shuffle,
  Film,
  Fingerprint,
  Sparkles,
  Monitor,
  Clock,
  Download,
} from "lucide-react";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
];

function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#010313]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Fingerprint className="h-4 w-4 text-purple-400" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Uniq<span className="text-purple-400">Social</span>
          </span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2"
          >
            Log in
          </a>
          <a
            href="/login"
            className="text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg transition-all hover:shadow-lg hover:shadow-purple-500/20"
          >
            Get 5 Free Credits
          </a>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 grid-bg overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-700/5 rounded-full blur-[128px] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/5 px-4 py-1.5 text-sm text-purple-300">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Now in public beta</span>
        </div>
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-4 py-1.5 text-sm text-green-300">
          <Zap className="h-3.5 w-3.5" />
          <span>5 free credits on signup — no card required</span>
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
          Make every video{" "}
          <span className="gradient-text glow-text">completely unique</span>
        </h1>

        <p className="mx-auto max-w-2xl text-lg sm:text-xl text-slate-400 leading-relaxed mb-10">
          Upload once, get unlimited unique variations. Randomized edits, metadata
          spoofing, and intelligent processing — all in seconds.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <a
            href="/login"
            className="group flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-medium px-8 py-3.5 rounded-xl transition-all hover:shadow-xl hover:shadow-purple-500/20 text-base"
          >
            Start free — 5 credits included
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="#how-it-works"
            className="flex items-center gap-2 text-slate-400 hover:text-white font-medium px-8 py-3.5 rounded-xl border border-white/10 hover:border-white/20 transition-all text-base"
          >
            See how it works
          </a>
        </div>

        <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto">
          {[
            { value: "<5s", label: "Per video" },
            { value: "100%", label: "Unique output" },
            { value: "50+", label: "Edit parameters" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-sm text-slate-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#010313] to-transparent" />
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: Shuffle,
      title: "Randomized Edits",
      desc: "Every parameter is randomized — start trims, segment cuts, millisecond adjustments, zoom levels. No two outputs are ever the same.",
    },
    {
      icon: Shield,
      title: "Metadata Spoofing",
      desc: "Inject authentic metadata from CapCut, Snapchat, iPhone Camera, and more. Your output looks like a naturally edited video.",
    },
    {
      icon: Layers,
      title: "Batch Processing",
      desc: "Upload 10, 50, or 100 videos at once. Generate multiple unique versions of each. Download everything as a zip.",
    },
    {
      icon: Film,
      title: "Smart Edits",
      desc: "Subtle grain, sharpening, zoom cropping, horizontal mirroring — applied at randomized intensities that stay undetectable.",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      desc: "Server-side processing powered by FFmpeg. Most videos are processed in under 5 seconds, even at 4K resolution.",
    },
    {
      icon: Monitor,
      title: "Dashboard",
      desc: "Track your usage, manage credits, view processing history. Everything you need in one clean interface.",
    },
  ];

  return (
    <section id="features" className="py-32 relative">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-purple-400 tracking-wider uppercase mb-3">
            Features
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Everything you need to{" "}
            <span className="gradient-text">stay unique</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-purple-500/20 transition-all duration-300"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 group-hover:bg-purple-500/15 transition-colors">
                <f.icon className="h-5 w-5 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      step: "01",
      icon: Upload,
      title: "Upload",
      desc: "Drag and drop your videos or select from your device. Upload as many as you need — we handle batches effortlessly.",
    },
    {
      step: "02",
      icon: Shuffle,
      title: "Configure",
      desc: "Choose your edit parameters and metadata profile. Set min/max ranges or let our engine decide everything randomly.",
    },
    {
      step: "03",
      icon: Clock,
      title: "Process",
      desc: "Our servers apply randomized edits to each video — unique cuts, trims, zoom, grain, mirroring, and metadata injection.",
    },
    {
      step: "04",
      icon: Download,
      title: "Download",
      desc: "Get your unique videos back in seconds. Download individually or grab everything as a zip. Each one is completely unique.",
    },
  ];

  return (
    <section id="how-it-works" className="py-32 relative">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-purple-400 tracking-wider uppercase mb-3">
            How it works
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Four steps to{" "}
            <span className="gradient-text">unique content</span>
          </h2>
        </div>

        <div className="space-y-6">
          {steps.map((s) => (
            <div
              key={s.step}
              className="group flex items-start gap-6 p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-purple-500/20 transition-all duration-300"
            >
              <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 font-mono text-sm font-semibold text-purple-400">
                {s.step}
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">{s.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSubscribe = async (planKey: string) => {
    setLoadingPlan(planKey);
    try {
      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (res.status === 401) {
        window.location.href = "/login";
      } else {
        alert(data.error || "Failed to start checkout");
      }
    } catch {
      window.location.href = "/login";
    } finally {
      setLoadingPlan(null);
    }
  };

  const plans = [
    {
      key: "starter",
      name: "Starter",
      price: "24",
      credits: "100",
      perCredit: "24p",
      save: null,
      features: [
        "100 credits",
        "All edit parameters",
        "All metadata profiles",
        "Batch upload up to 10",
        "1080p support",
      ],
      popular: false,
    },
    {
      key: "growth",
      name: "Growth",
      price: "75",
      credits: "500",
      perCredit: "15p",
      save: "38%",
      features: [
        "500 credits",
        "All edit parameters",
        "All metadata profiles",
        "Batch upload up to 25",
        "Up to 4K support",
        "Priority processing",
      ],
      popular: false,
    },
    {
      key: "pro",
      name: "Pro",
      price: "150",
      credits: "1,500",
      perCredit: "10p",
      save: "58%",
      features: [
        "1,500 credits",
        "All edit parameters",
        "All metadata profiles",
        "Batch upload up to 50",
        "Up to 4K support",
        "Priority processing",
        "API access",
      ],
      popular: true,
    },
    {
      key: "business",
      name: "Business",
      price: "350",
      credits: "5,000",
      perCredit: "7p",
      save: "71%",
      features: [
        "5,000 credits",
        "All edit parameters",
        "All metadata profiles",
        "Unlimited batch upload",
        "Up to 4K support",
        "Priority processing",
        "Full API access",
        "Priority support",
      ],
      popular: false,
    },
    {
      key: "agency",
      name: "Agency",
      price: "750",
      credits: "15,000",
      perCredit: "5p",
      save: "79%",
      features: [
        "15,000 credits",
        "All edit parameters",
        "All metadata profiles",
        "Unlimited batch upload",
        "Up to 4K support",
        "Priority processing",
        "Full API access",
        "Dedicated support",
        "Custom metadata profiles",
      ],
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="py-32 relative">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-purple-400 tracking-wider uppercase mb-3">
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Simple, credit-based{" "}
            <span className="gradient-text">pricing</span>
          </h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            1 credit = 1 unique video. Start with 5 free credits, then buy what you need.
            Bigger packs, bigger savings.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative p-6 rounded-2xl border transition-all duration-300 ${
                plan.popular
                  ? "border-purple-500/30 bg-purple-500/[0.03] glow-purple"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                  Most Popular
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-base font-semibold mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">£{plan.price}</span>
                </div>
                <p className="text-slate-500 text-xs mt-1.5">
                  {plan.credits} credits &middot; {plan.perCredit}/credit
                </p>
                {plan.save && (
                  <span className="inline-block mt-2 text-[10px] font-semibold text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full">
                    SAVE {plan.save}
                  </span>
                )}
              </div>

              <ul className="space-y-2.5 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="h-3.5 w-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-300 text-xs">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleSubscribe(plan.key)}
                disabled={loadingPlan === plan.key}
                className={`w-full py-2.5 rounded-xl font-medium text-sm text-center transition-all cursor-pointer disabled:opacity-50 ${
                  plan.popular
                    ? "bg-purple-600 hover:bg-purple-700 text-white hover:shadow-lg hover:shadow-purple-500/20"
                    : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                }`}
              >
                {loadingPlan === plan.key ? "Loading..." : "Get Started"}
              </button>
            </div>
          ))}
        </div>

        {/* Top-up credits */}
        <div className="mt-16 text-center">
          <p className="text-sm font-medium text-purple-400 tracking-wider uppercase mb-3">
            Need more?
          </p>
          <h3 className="text-2xl font-bold tracking-tight mb-3">
            Top up credits <span className="gradient-text">anytime</span>
          </h3>
          <p className="text-slate-400 text-sm mb-8 max-w-lg mx-auto">
            Already on a plan? Buy extra credits without upgrading. Pay-as-you-go at a flexible rate.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 max-w-5xl mx-auto">
            {[
              { credits: "20", price: "5.20", perCredit: "26p" },
              { credits: "50", price: "13", perCredit: "26p" },
              { credits: "100", price: "26", perCredit: "26p" },
              { credits: "250", price: "65", perCredit: "26p" },
              { credits: "500", price: "130", perCredit: "26p" },
              { credits: "1,000", price: "260", perCredit: "26p" },
            ].map((pack) => (
              <div
                key={pack.credits}
                className="p-5 rounded-2xl border border-white/5 bg-white/[0.02] hover:border-purple-500/20 hover:bg-white/[0.04] transition-all duration-300"
              >
                <div className="text-2xl font-bold text-white mb-1">{pack.credits}</div>
                <div className="text-xs text-slate-500 mb-3">credits</div>
                <div className="text-lg font-semibold text-white mb-1">£{pack.price}</div>
                <div className="text-[10px] text-slate-500">{pack.perCredit}/credit</div>
                <a href="/login" className="mt-4 block w-full py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all text-center">
                  Buy
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-32 relative">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="p-12 rounded-3xl border border-purple-500/20 bg-purple-500/[0.03] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Ready to make your content{" "}
              <span className="gradient-text">unique</span>?
            </h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto">
              Join thousands of professionals using Uniq Social to
              generate unique video content at scale.
            </p>
            <a
              href="/login"
              className="group inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-medium px-8 py-3.5 rounded-xl transition-all hover:shadow-xl hover:shadow-purple-500/20"
            >
              Start free — 5 credits included
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Fingerprint className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Uniq<span className="text-purple-400">Social</span>
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="/terms" className="hover:text-white transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            <a href="mailto:support@uniqsocial.com" className="hover:text-white transition-colors">Contact</a>
          </div>
          <p className="text-xs text-slate-600">
            &copy; 2024 Uniq Social. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </main>
  );
}

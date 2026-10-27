const SERVICES = [
  { href: "/dashboard", title: "Video processor", body: "Open the existing processor. Upload a video and render it with the controls already on that page." },
  { href: "/hub/hook-lab", title: "Hook Lab", body: "Transcribe a talking video, cut it, and burn captions that follow the words." },
  { href: "/hub/variants", title: "Variants", body: "Look through renders and caption exports." },
  { href: "/hub/creators", title: "Creators", body: "Brand voice for each creator, and captions in that voice." },
  { href: "/hub/results", title: "Results", body: "Log views, watch time, shares, saves, and follows." },
  { href: "/hub/presets", title: "Presets", body: "Save a setup and load it again." },
  { href: "/hub/team", title: "Team", body: "People who share this account." },
  { href: "/hub/settings", title: "Settings", body: "Account and connected tools." },
];

export default function HomePage() {
  return (
    <div className="surface min-h-screen bg-[#f4efe8] text-[#2c241c]" style={{ fontFamily: '"DM Sans", "Segoe UI", sans-serif' }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" />
      <header className="border-b border-[#e4d5c6] bg-[#fffdfb]">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <a href="/" className="text-[18px] font-medium">UniqSocial</a>
          <a href="/login" className="text-[15px] text-[#6d5e53]">Log in</a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-[28px] font-medium">Services</h1>
        <p className="mt-2 text-[16px] text-[#6d5e53]">Pick one to open it.</p>
        <ul className="mt-6 overflow-hidden rounded-md border border-[#e4d5c6] bg-[#fffdfb]">
          {SERVICES.map((service) => (
            <li key={service.href} className="border-b border-[#e4d5c6] last:border-b-0">
              <a href={service.href} className="block px-4 py-4 hover:bg-[#f7f2eb]">
                <span className="block text-[16px] font-medium">{service.title}</span>
                <span className="mt-1 block text-[15px] leading-relaxed text-[#6d5e53]">{service.body}</span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

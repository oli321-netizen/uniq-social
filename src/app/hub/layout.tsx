"use client";

import AppShell from "@/components/hub/AppShell";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

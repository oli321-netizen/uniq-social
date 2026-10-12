"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import CookieConsent from "@/components/CookieConsent";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>
          {children}
          <CookieConsent />
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

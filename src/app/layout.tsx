import type { Metadata, Viewport } from "next";
import Providers from "./providers";
import "./globals.css";
import "./surface.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Uniq Social",
  description: "Uniq Social services: the video processor, Hook Lab, variants, creators, results, presets, team, and settings.",
  metadataBase: new URL("https://uniqsocial.com"),
  openGraph: {
    title: "Uniq Social",
    description: "Uniq Social services: the video processor, Hook Lab, variants, creators, results, presets, team, and settings.",
    url: "https://uniqsocial.com",
    siteName: "Uniq Social",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Uniq Social",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Uniq Social",
    description: "Uniq Social services.",
    images: ["/og-image.png"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('uniq-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}})();if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}` }} />
      </head>
      <body className="antialiased noise-overlay">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

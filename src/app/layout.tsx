import type { Metadata, Viewport } from "next";
import Providers from "./providers";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Uniq — Hook lab and creator hub",
  description: "Write hook lines, test creative variants of short-form video, and keep the cuts that hold attention.",
  metadataBase: new URL("https://uniqsocial.com"),
  openGraph: {
    title: "Uniq — Hook lab and creator hub",
    description: "Write hook lines, test creative variants of short-form video, and keep the cuts that hold attention.",
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
    title: "Uniq — Hook lab and creator hub",
    description: "Write hook lines, test creative variants, and log what wins.",
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

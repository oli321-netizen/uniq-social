import type { Metadata } from "next";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uniq Social — Make Every Video Unique",
  description: "Transform your videos into unique, ready-to-use content. Batch process with randomized edits, metadata injection, and more.",
  metadataBase: new URL("https://uniqsocial.com"),
  openGraph: {
    title: "Uniq Social — Make Every Video Unique",
    description: "Transform your videos into unique, ready-to-use content. Batch process with randomized edits, metadata injection, and more.",
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
    title: "Uniq Social — Make Every Video Unique",
    description: "Transform your videos into unique, ready-to-use content.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased noise-overlay">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

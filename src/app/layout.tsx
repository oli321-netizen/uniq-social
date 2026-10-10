import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uniq Social — Make Every Video Unique",
  description: "Transform your videos into unique, ready-to-use content. Batch process with randomized edits, metadata injection, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased noise-overlay">
        {children}
      </body>
    </html>
  );
}

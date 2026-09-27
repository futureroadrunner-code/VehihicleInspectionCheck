import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

// Same face as the ASCA Site Survey.
const sans = Schibsted_Grotesk({
  variable: "--font-sans-face",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "ASCA Office Solutions — Vehicle Check",
  description: "Daily vehicle inspection for ASCA technicians. Email each day; Friday rolls up the week.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f8f8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}

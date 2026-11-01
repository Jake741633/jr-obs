import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "../components/AppShell";
import { PasswordRecoveryGate } from "../components/PasswordRecoveryGate";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "JR OS v0.1 Beta", template: "%s · JR OS" },
  description: "JR Electrical Services internal business operating system beta",
  robots: { index: false, follow: false },
  applicationName: "JR OS",
  appleWebApp: { capable: true, title: "JR OS", statusBarStyle: "default" },
  icons: { apple: [{ url: "/icons/jr-os-180.png", sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#020617",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}><body><PasswordRecoveryGate><AppShell>{children}</AppShell></PasswordRecoveryGate></body></html>;
}

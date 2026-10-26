import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import SiteHeader from "./site-header";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Graphical Weather Forecast",
    template: "%s · Graphical Weather Forecast",
  },
  description: "A shared workspace for drawing and publishing SPC Day 1, Day 2, and Day 3 severe and winter weather outlooks.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
      <SiteHeader />
      {children}
    </body>
    </html>
  );
}

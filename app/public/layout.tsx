import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Public Outlook",
  description: "View current Day 1–3 severe and winter weather outlook areas for the United States, Quebec, and Ontario.",
};

export default function PublicOutlookLayout({ children }: { children: React.ReactNode }) {
  return children;
}

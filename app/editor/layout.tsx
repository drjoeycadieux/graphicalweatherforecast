import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Drawing Desk",
  description: "Draw and publish SPC-styled severe and winter weather outlook areas.",
};

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return children;
}

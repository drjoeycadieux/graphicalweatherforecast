import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Console",
  description: "Monitor forecast sources and manage the North American forecast desk.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Public outlook" },
  { href: "/editor", label: "Drawing desk" },
  { href: "/admin", label: "Admin" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname === "/public";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="app-brand" href="/" aria-label="Graphical Weather Forecast home">
          <span className="brand-mark" aria-hidden="true">GW</span>
          <span className="brand-copy">
            <strong>Graphical Weather Forecast</strong>
            <small>Outlook workstation</small>
          </span>
        </Link>

        <nav className="app-nav" aria-label="Primary navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              className={isActive(link.href) ? "app-nav-link active" : "app-nav-link"}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <span className="app-status">
          <span className="live-dot" aria-hidden="true" />
          Outlook desk
        </span>
      </div>
    </header>
  );
}

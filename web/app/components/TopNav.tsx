"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const TABS = [
  { href: "/generate", label: "Generate Kit" },
  { href: "/grade", label: "Grade Extension" },
];

/** Shared header: brand + the two co-equal tool tabs, with a mobile toggle. */
export default function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="nav">
      <Link href="/" className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/zip-icon.png" alt="" className="brand-mark" />
        ZipSnap
      </Link>
      <div className={`nav-links ${open ? "open" : ""}`}>
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={pathname === t.href ? "nav-tab nav-tab--active" : "nav-tab"}
            onClick={() => setOpen(false)}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <button
        className="nav-toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        )}
      </button>
    </nav>
  );
}

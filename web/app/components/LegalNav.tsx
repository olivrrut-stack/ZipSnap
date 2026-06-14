import Link from "next/link";

export default function LegalNav() {
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/zip-icon.png" alt="" className="brand-mark" />
        ZipSnap
      </Link>
      <div className="nav-links">
        <Link href="/">Back to home</Link>
      </div>
    </nav>
  );
}

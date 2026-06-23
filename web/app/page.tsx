"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import TopNav from "./components/TopNav";
import Footer from "./components/Footer";

const Gallery = dynamic(() => import("./components/Gallery"), {
  ssr: false,
  loading: () => <div aria-hidden style={{ minHeight: 470 }} />,
});

export default function Home() {
  return (
    <main>
      <div className="wrap">
        <TopNav />
        <section className="hero">
          <span className="eyebrow">
            <span className="dot" />
            Launch it. Grow it. Sell it.
          </span>
          <h1 className="hero-title">
            Everything your Chrome extension needs <span className="accent">to win.</span>
          </h1>
          <p className="subhead">
            ZipSnap turns your extension .zip into a complete Web Store kit, and grades it for growth and
            acquisition. Two tools, one drop.
          </p>

          <div className="tool-cards">
            <div className="tool-card">
              <div className="tool-card-label">Generate</div>
              <h2 className="tool-card-title">Store kit generator</h2>
              <p className="tool-card-desc">
                Screenshots, promo tiles, icons, and an AI-written listing, captured from your real
                extension in about 30 seconds.
              </p>
              <Link className="btn btn-primary" href="/generate">Generate my kit →</Link>
            </div>
            <div className="tool-card">
              <div className="tool-card-label">Grade</div>
              <h2 className="tool-card-title">Growth &amp; acquisition report</h2>
              <p className="tool-card-desc">
                A score plus specific steps to win more users and make your extension acquisition-ready.
                Free and instant.
              </p>
              <Link className="btn btn-ghost" href="/grade">Grade my extension →</Link>
            </div>
          </div>
        </section>

        <Gallery />
        <Footer />
      </div>
    </main>
  );
}

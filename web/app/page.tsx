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
            Built for Chrome extension makers
          </span>
          <h1 className="hero-title">
            The place you <span className="v v--launch">launch</span>,{" "}
            <span className="v v--grow">grow</span>, and <span className="v v--sell">sell</span>{" "}
            your <span className="accent">Chrome extension</span>.
          </h1>
          <p className="subhead">
            Drop your <span className="mono">.zip</span> once. ZipSnap builds your store kit, then grades
            it for growth and acquisition, with the specific moves to win users and get bought.
          </p>

          <div className="lifecycle" aria-hidden="true">
            <div className="lc-stage">
              <span className="v v--launch">Launch</span>
              <span className="lc-gloss">store kit in minutes</span>
            </div>
            <span className="lc-arrow">→</span>
            <div className="lc-stage">
              <span className="v v--grow">Grow</span>
              <span className="lc-gloss">win more users</span>
            </div>
            <span className="lc-arrow">→</span>
            <div className="lc-stage">
              <span className="v v--sell">Sell</span>
              <span className="lc-gloss">get acquisition-ready</span>
            </div>
          </div>

          <div className="tool-cards">
            <div className="tool-card">
              <div className="tool-card-label tool-card-label--launch">Launch</div>
              <h2 className="tool-card-title">Store kit generator</h2>
              <p className="tool-card-desc">
                Screenshots, promo tiles, icons, and an AI-written listing, captured from your real
                extension in about 30 seconds.
              </p>
              <Link className="btn btn-primary" href="/generate">Generate my kit →</Link>
            </div>
            <div className="tool-card">
              <div className="tool-card-label tool-card-label--grow">Grow &amp; sell</div>
              <h2 className="tool-card-title">Growth &amp; acquisition report</h2>
              <p className="tool-card-desc">
                A score plus specific steps to win more users and make your extension acquisition-ready.
                Free and instant.
              </p>
              <Link className="btn btn-primary" href="/grade">Grade my extension →</Link>
            </div>
          </div>

          <ul className="trust-row">
            {[
              "Captured from your real extension",
              "Exact Web Store sizes",
              "Files deleted within 24 hours",
              "No account needed",
            ].map((t) => (
              <li key={t}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </section>

        <Gallery />
        <Footer />
      </div>
    </main>
  );
}

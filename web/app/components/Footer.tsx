export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/zip-icon.png" alt="" className="brand-mark" />
        <div>
          <div className="mono">ZipSnap</div>
          <div className="footer-tag">Zip it in. Snap your kit out.</div>
        </div>
      </div>
      <div className="footer-links">
        <a href="https://github.com/olivrrut-stack" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://x.com/Y01909" target="_blank" rel="noreferrer">X</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </div>
    </footer>
  );
}

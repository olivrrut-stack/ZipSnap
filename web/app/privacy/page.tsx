import type { Metadata } from "next";
import LegalNav from "../components/LegalNav";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — ZipSnap",
  description: "How ZipSnap handles the files and data you upload.",
};

export default function PrivacyPage() {
  return (
    <main>
      <div className="wrap">
        <LegalNav />
        <div className="legal">
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: 13 June 2026</p>

          <p>
            ZipSnap (&quot;ZipSnap&quot;, &quot;we&quot;, &quot;us&quot;) turns a Chrome extension
            into a ready-to-submit Chrome Web Store kit. This page explains what
            happens to the files and information you give it, in plain language.
          </p>

          <h2>What we collect</h2>
          <p>ZipSnap does not require an account, and we do not use cookies, analytics, or trackers. The only data we handle is:</p>
          <ul>
            <li>
              <strong>The extension package you upload</strong> (a <span className="mono">.zip</span> file
              or folder) — used solely to load your extension and capture screenshots of it.
            </li>
            <li>
              <strong>Metadata from your extension&apos;s manifest</strong> (its name, description,
              and permissions) — used to generate the store listing copy.
            </li>
            <li>
              <strong>Standard server logs</strong> (IP address, timestamps, request data) that any
              web server collects automatically, used only for security and debugging.
            </li>
          </ul>

          <h2>How your upload is processed</h2>
          <p>
            When you upload an extension, our worker service unpacks it, loads it into a headless
            browser, and takes screenshots of its popup, options page, and any on-page UI. It also
            extracts your extension&apos;s brand color from its icon. These screenshots, along with
            your manifest metadata, are sent to Anthropic&apos;s Claude API to generate a suggested
            store listing (short and long descriptions, category, and screenshot headlines).
          </p>
          <p>
            Anthropic processes this data under its own privacy policy and is not permitted to use
            it to train its models when accessed through the API. We do not share your extension
            or its contents with anyone else.
          </p>

          <h2>How long we keep it</h2>
          <p>
            Your uploaded extension, the generated screenshots, and the finished kit are stored
            temporarily on our server so you can view and download them. They are automatically
            and permanently deleted within 24 hours, and sooner if you close the tab without
            generating a kit. We do not keep backups of your files.
          </p>

          <h2>What we don&apos;t do</h2>
          <ul>
            <li>We don&apos;t sell, rent, or share your data with advertisers.</li>
            <li>We don&apos;t inspect your extension&apos;s code for any purpose other than running the pipeline above.</li>
            <li>We don&apos;t require sign-up, so we don&apos;t hold any account or payment information.</li>
          </ul>

          <h2>Your responsibilities</h2>
          <p>
            Only upload extensions you own or have the right to generate marketing assets for.
            Avoid uploading extensions that contain secrets, credentials, or other sensitive data
            you wouldn&apos;t want processed by a third-party AI service, since manifest metadata is
            sent to Anthropic as described above.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            We may update this policy as ZipSnap changes. Material changes will be reflected by
            updating the &quot;Last updated&quot; date above.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy? Reach out via{" "}
            <a href="https://github.com/olivrrut" target="_blank" rel="noreferrer">GitHub</a>{" "}
            or <a href="https://x.com/Y01909" target="_blank" rel="noreferrer">X</a>.
          </p>
        </div>
        <Footer />
      </div>
    </main>
  );
}

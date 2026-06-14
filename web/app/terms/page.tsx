import type { Metadata } from "next";
import LegalNav from "../components/LegalNav";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service — ZipSnap",
  description: "The terms that apply to using ZipSnap.",
};

export default function TermsPage() {
  return (
    <main>
      <div className="wrap">
        <LegalNav />
        <div className="legal">
          <h1>Terms of Service</h1>
          <p className="legal-updated">Last updated: 13 June 2026</p>

          <p>
            These terms govern your use of ZipSnap (&quot;ZipSnap&quot;, &quot;we&quot;,
            &quot;us&quot;). By uploading an extension or otherwise using ZipSnap, you agree to
            these terms. If you don&apos;t agree, please don&apos;t use the service.
          </p>

          <h2>What ZipSnap does</h2>
          <p>
            ZipSnap accepts a Chrome extension package, loads it in an automated browser to
            capture screenshots of its interface, generates promotional images, and uses an AI
            service to draft Chrome Web Store listing text. The output is provided as a
            downloadable kit for you to review, edit, and submit yourself.
          </p>

          <h2>Your content</h2>
          <p>
            You retain all ownership rights to the extension you upload and to the kit ZipSnap
            generates from it. You represent that you own the extension or have the right to
            upload it and to generate marketing materials from it. You&apos;re solely responsible
            for the content of your extension and for reviewing any AI-generated text, images, or
            sizing before submitting them anywhere, including the Chrome Web Store.
          </p>

          <h2>Acceptable use</h2>
          <p>You agree not to use ZipSnap to:</p>
          <ul>
            <li>Upload malware, or any extension you don&apos;t have the right to process;</li>
            <li>Attempt to disrupt, overload, or gain unauthorized access to the service or its infrastructure;</li>
            <li>Use the generated output to misrepresent an extension&apos;s functionality or ownership.</li>
          </ul>
          <p>We may suspend access for anyone who violates these terms.</p>

          <h2>AI-generated content</h2>
          <p>
            Descriptions, categories, and headlines are generated automatically and may be
            inaccurate, incomplete, or unsuitable for your extension. ZipSnap does not guarantee
            the accuracy of AI-generated content, and you are responsible for reviewing and
            editing it before use. Generated images are produced to the pixel dimensions required
            by the Chrome Web Store at the time of writing, but store requirements can change —
            always confirm current requirements before submitting.
          </p>

          <h2>No warranty</h2>
          <p>
            ZipSnap is provided <strong>&quot;as is&quot; and &quot;as available&quot;</strong>,
            without warranties of any kind, whether express, implied, or statutory, including
            warranties of merchantability, fitness for a particular purpose, or non-infringement.
            We don&apos;t guarantee that the service will be uninterrupted, error-free, or that any
            output will be accepted by the Chrome Web Store or any other platform.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, ZipSnap and its operator will not be liable
            for any indirect, incidental, special, consequential, or punitive damages, or any
            loss of data, revenue, or business opportunity, arising from your use of the service —
            even if advised of the possibility of such damages. Our total liability for any claim
            relating to the service will not exceed the amount you paid us in the twelve months
            before the claim arose (which, for a free service, is zero).
          </p>

          <h2>Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless ZipSnap and its operator from any claims,
            damages, or expenses (including reasonable legal fees) arising from your extension,
            your use of the service, or your violation of these terms.
          </p>

          <h2>Changes and availability</h2>
          <p>
            We may modify, suspend, or discontinue ZipSnap, in whole or in part, at any time,
            without notice. We may also update these terms; continued use after an update means
            you accept the revised terms.
          </p>

          <h2>Governing law</h2>
          <p>
            These terms are governed by the laws applicable in the operator&apos;s place of
            residence, without regard to conflict-of-law principles, except where local consumer
            protection law gives you additional rights that cannot be waived.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these terms? Reach out via{" "}
            <a href="https://github.com/olivrrut" target="_blank" rel="noreferrer">GitHub</a>{" "}
            or <a href="https://x.com/Y01909" target="_blank" rel="noreferrer">X</a>.
          </p>
        </div>
        <Footer />
      </div>
    </main>
  );
}

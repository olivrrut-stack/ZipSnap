import type { Metadata } from "next";
import KitGenerator from "../components/KitGenerator";

export const metadata: Metadata = {
  title: "Generate your Chrome Web Store kit | ZipSnap",
  description:
    "Drop your extension .zip. ZipSnap captures the screenshots, builds the promo tiles, writes the listing, and grades it — automatically.",
  alternates: { canonical: "/generate" },
  openGraph: {
    title: "Generate your Chrome Web Store kit — ZipSnap",
    description: "Screenshots, promo tiles, store listing, and a growth grade, generated from your .zip.",
    url: "/generate",
    type: "website",
  },
};

export default function GeneratePage() {
  return <KitGenerator />;
}

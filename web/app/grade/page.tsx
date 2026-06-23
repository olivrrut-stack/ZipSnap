import type { Metadata } from "next";
import Grader from "../components/Grader";

export const metadata: Metadata = {
  title: "Grade your Chrome extension — Growth & Acquisition Report | ZipSnap",
  description:
    "Drop your extension and get an instant score with specific steps to win more users and make it acquisition-ready. Free, no account.",
  alternates: { canonical: "/grade" },
  openGraph: {
    title: "Grade your Chrome extension — free Growth & Acquisition Report",
    description:
      "An instant score plus specific steps to grow your extension and make it acquisition-ready.",
    url: "/grade",
    type: "website",
  },
};

export default function GradePage() {
  return <Grader />;
}

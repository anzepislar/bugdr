import type { Metadata } from "next";
import HeroSection from "@/components/HeroSection";

export const metadata: Metadata = {
  title: "Bugdr — Early access",
  description: "Real production bugs. AI available. Prove you can ship.",
};

export default function WaitlistPage() {
  return <HeroSection />;
}

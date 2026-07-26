import { Roboto, Roboto_Serif } from "next/font/google";
import { LandingPage } from "@/components/landing/LandingPage";

const roboto = Roboto({
  subsets: ["latin"],
  variable: "--landing-font-sans",
  display: "swap",
});

const robotoSerif = Roboto_Serif({
  subsets: ["latin"],
  variable: "--landing-font-serif",
  display: "swap",
});

export default function Home() {
  return (
    <LandingPage
      fontClassName={`${roboto.variable} ${robotoSerif.variable}`}
    />
  );
}

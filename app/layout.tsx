import type { Metadata } from "next";
import { Google_Sans, Roboto_Mono } from "next/font/google";
import { AppProvider } from "@/components/AppProvider";
import "./globals.css";

const googleSans = Google_Sans({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  // No fallback-metric data exists for Google Sans, so skip the size-adjust fallback.
  adjustFontFallback: false,
  variable: "--font-google-sans",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-roboto-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://signalhub.at"),
  title: "SignalHub — Stop renting your status page",
  description:
    "Own your status infrastructure with SignalHub, the Apache-2.0 alternative to recurring status-page application subscriptions.",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "SignalHub",
    title: "Stop renting your status page.",
    description:
      "Apache-2.0 status infrastructure with no application license fee. Your data, deployment, and operations stay yours.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Stop renting your status page.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stop renting your status page.",
    description:
      "Apache-2.0 status infrastructure with no application license fee. Your data, deployment, and operations stay yours.",
    images: ["/og.png"],
  },
};

/* DESIGN CONTRACT
   Direction: Soft and vibrant, light only. An icon rail with a contextual
   panel, colour-tinted icon tiles, generous radii, and short springy motion.
   Tokens live in app/theme.css.
   Public pages retain their owner controls while sharing the same legibility. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${googleSans.variable} ${robotoMono.variable}`}>
      <body className="bg-canvas text-ink antialiased">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { AppProvider } from "@/components/AppProvider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-jakarta",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-jetbrains",
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
   Direction: "Prism", light only. A glass top navigation bar with section
   menus, a violet-fuchsia-orange brand gradient, gradient icon orbs, pill
   controls, and springy staggered motion.
   Tokens live in app/theme.css.
   Public pages retain their owner controls while sharing the same legibility. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable}`}>
      <body className="bg-canvas text-ink antialiased">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}

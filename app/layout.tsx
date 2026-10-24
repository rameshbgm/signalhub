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
  title: "SignalHub",
  description:
    "Service status, incident updates, and your team's workspace.",
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

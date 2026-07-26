import type { Metadata } from "next";
import { FluentAppProvider } from "@/components/FluentAppProvider";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[var(--bg)] text-[var(--fg)] antialiased">
        <FluentAppProvider>{children}</FluentAppProvider>
      </body>
    </html>
  );
}

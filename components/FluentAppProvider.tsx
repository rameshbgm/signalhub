"use client";

import { useEffect, useState } from "react";
import {
  FluentProvider,
  SSRProvider,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import { ButtonInteractionGuard } from "@/components/ButtonInteractionGuard";

export function FluentAppProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    try {
      const stored = localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", stored === "dark" || (!stored && prefersDark));
    } catch {
      // Theme storage can be unavailable in privacy-restricted browsing contexts.
    }
    const syncTheme = () => setDark(root.classList.contains("dark"));
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <SSRProvider>
      <FluentProvider
        theme={dark ? webDarkTheme : webLightTheme}
        className="min-h-screen bg-inherit text-inherit"
      >
        <ButtonInteractionGuard>{children}</ButtonInteractionGuard>
      </FluentProvider>
    </SSRProvider>
  );
}

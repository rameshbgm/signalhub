"use client";

import { ButtonInteractionGuard } from "@/components/ButtonInteractionGuard";

export function AppProvider({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-inherit text-inherit"><ButtonInteractionGuard>{children}</ButtonInteractionGuard></div>;
}

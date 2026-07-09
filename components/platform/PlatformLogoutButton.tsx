"use client";

import { useRouter } from "next/navigation";

export function PlatformLogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/platform-logout", { method: "POST" });
        router.push("/platform/login");
        router.refresh();
      }}
      className="mt-2 font-medium text-white/60 hover:text-white hover:underline"
    >
      Sign out
    </button>
  );
}

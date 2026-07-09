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
      className="mt-2 text-gray-300 hover:underline"
    >
      Sign out
    </button>
  );
}

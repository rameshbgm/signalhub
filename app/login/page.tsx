import { UnifiedLogin } from "@/components/auth/UnifiedLogin";
import { safeReturnTo as sameOriginPath } from "@/lib/public-path";

function safeReturnTo(value: string | undefined) {
  const path = sameOriginPath(value, "");
  return path && !path.startsWith("/api/") ? path : null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  return <UnifiedLogin returnTo={safeReturnTo(params.returnTo)} />;
}

import { UnifiedLogin } from "@/components/auth/UnifiedLogin";

function safeReturnTo(value: string | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/api/")) return null;
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  return <UnifiedLogin returnTo={safeReturnTo(params.returnTo)} />;
}

"use client";

import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card role="alert" className="max-w-2xl">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
        <IconTile icon={AlertTriangle} hue="rose" size="lg" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            The platform action could not be completed
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-ink-soft">
            {error.message || "The underlying state changed or the operation failed."}
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-ink-dim">Reference <span className="font-mono">{error.digest}</span></p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={reset} variant="secondary" size="sm">
              <RotateCw aria-hidden size={14} />
              Reload current state
            </Button>
            <Link href="/organization/platform" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Platform overview
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

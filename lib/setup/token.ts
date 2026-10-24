import { createHash, timingSafeEqual } from "node:crypto";

export const SETUP_COOKIE = "signalhub_setup";

/** The supervisor passes a random token only to the web process in setup mode. */
export function validSetupToken(candidate: string | undefined) {
  const expected = process.env.SIGNALHUB_SETUP_TOKEN;
  if (!expected || expected.length < 32 || !candidate || candidate.length > 256) return false;
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

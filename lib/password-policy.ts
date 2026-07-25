const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "123456789012",
  "qwertyuiop123",
  "letmein123456",
  "administrator",
]);

export function passwordMinimumLength() {
  const configured = Number(process.env.PASSWORD_MIN_LENGTH ?? 14);
  return Number.isInteger(configured) ? Math.min(128, Math.max(12, configured)) : 14;
}

export function newPasswordError(password: string, identityParts: string[] = []) {
  const minimum = passwordMinimumLength();
  if (password.length < minimum) return `Choose a password containing at least ${minimum} characters`;
  if (password.length > 1024) return "Password must not exceed 1024 characters";
  const normalized = password.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (COMMON_PASSWORDS.has(normalized)) return "Choose a password that is not commonly used";
  if (
    identityParts
      .map((part) => part.toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter((part) => part.length >= 4)
      .some((part) => normalized.includes(part))
  ) {
    return "Password must not contain your name or email address";
  }
  return null;
}

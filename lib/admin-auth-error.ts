export class AdminAuthError extends Error {
  constructor(
    message: string,
    public readonly status = 403,
    public readonly code = "FORBIDDEN"
  ) {
    super(message);
  }
}

export function isPlatformAuthenticationError(error: unknown): error is AdminAuthError {
  return error instanceof AdminAuthError && (error.status === 401 || error.status === 403);
}

import { getAdminAuth } from "@/lib/firebase-admin";

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
};

/**
 * Verify Firebase ID token from Authorization: Bearer <token>.
 * Never log the full token.
 */
export async function verifyAuthenticatedRequest(
  request: Request,
): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    throw Object.assign(new Error("Missing auth token"), { status: 401 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email || null,
      emailVerified: Boolean(decoded.email_verified),
    };
  } catch {
    throw Object.assign(new Error("Invalid or expired auth token"), {
      status: 401,
    });
  }
}

export function authErrorResponse(err: unknown) {
  const status =
    typeof err === "object" && err && "status" in err
      ? Number((err as { status?: number }).status) || 500
      : 500;
  const message =
    err instanceof Error ? err.message : "Authentication failed.";
  return {
    status: status === 401 || status === 403 ? status : 500,
    message:
      status === 401 || status === 403
        ? message
        : "We could not verify your session. Please sign in again.",
  };
}

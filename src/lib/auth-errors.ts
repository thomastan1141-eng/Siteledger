/** Map Firebase Auth errors to user-friendly copy. */
export function friendlyAuthError(err: unknown, fallback: string): string {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code?: string }).code || "")
      : "";

  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support if you need help.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/requires-recent-login":
      return "Please sign in again to continue.";
    default:
      if (err instanceof Error && err.message && !err.message.includes("Firebase")) {
        return err.message;
      }
      return fallback;
  }
}

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  type User,
} from "firebase/auth";

/** Firebase default policy surface — keep copy in sync with Auth console. */
export const PASSWORD_REQUIREMENTS = [
  "At least 6 characters",
  "Different from your current password",
];

export function hasPasswordProvider(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === "password");
}

export function primaryProviderLabel(user: User | null | undefined): string {
  if (!user?.providerData?.length) return "your sign-in provider";
  const id = user.providerData[0]?.providerId || "";
  if (id === "google.com") return "Google";
  if (id === "apple.com") return "Apple";
  if (id === "facebook.com") return "Facebook";
  if (id === "password") return "Email and password";
  return id.replace(/\.com$/, "") || "your sign-in provider";
}

export function validatePasswordChange(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): string | null {
  const currentPassword = input.currentPassword;
  const newPassword = input.newPassword;
  const confirmPassword = input.confirmPassword;

  if (!currentPassword) return "Enter your current password.";
  if (!newPassword) return "Enter a new password.";
  if (!confirmPassword) return "Confirm your new password.";
  if (newPassword !== confirmPassword) {
    return "New password and confirmation do not match.";
  }
  if (newPassword.length < 6) {
    return "Use a stronger new password.";
  }
  if (newPassword === currentPassword) {
    return "Choose a new password that is different from your current password.";
  }
  return null;
}

export function friendlyPasswordChangeError(err: unknown): string {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code?: string }).code || "")
      : "";

  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "The current password is incorrect.";
    case "auth/weak-password":
      return "Use a stronger new password.";
    case "auth/requires-recent-login":
      return "Please sign in again before changing your password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    case "auth/network-request-failed":
      return "We could not change your password. Check your connection and try again.";
    default:
      if (
        err instanceof Error &&
        err.message &&
        !err.message.includes("Firebase") &&
        !err.message.includes("auth/")
      ) {
        return err.message;
      }
      return "We could not change your password. Please try again.";
  }
}

/**
 * Reauthenticate with the current password, then set a new password.
 * Passwords are never persisted outside Firebase Auth.
 */
export async function changePasswordWithReauth(input: {
  user: User;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const { user, currentPassword, newPassword } = input;
  if (!user.email) {
    throw new Error("No authenticated email user.");
  }
  const credential = EmailAuthProvider.credential(
    user.email,
    currentPassword,
  );
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

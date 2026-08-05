"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User,
} from "firebase/auth";
import { AUTH_BYPASS, DEMO_ADMIN, DEMO_CLIENT } from "./demo";
import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";
import { friendlyAuthError } from "./auth-errors";
import {
  broadcastAuthEvent,
  clearSessionMarkers,
  setSessionMode,
} from "./session";
import {
  completeOnboardingClient,
  getUserProfile,
} from "./services/users";
import type { AppUser, UserRole } from "./types";

type SignupInput = {
  email: string;
  password: string;
  displayName?: string;
  studioName?: string;
};

type LoginOptions = {
  trustDevice?: boolean;
};

type AuthContextValue = {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
  emailVerified: boolean;
  needsEmailVerification: boolean;
  needsOnboarding: boolean;
  needsPasswordChange: boolean;
  login: (
    email: string,
    password: string,
    options?: LoginOptions,
  ) => Promise<AppUser | null>;
  signup: (input: SignupInput) => Promise<User>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  reloadVerified: () => Promise<boolean>;
  completeOnboarding: (input?: {
    studioName?: string;
    displayName?: string;
  }) => Promise<string>;
  refreshProfile: () => Promise<AppUser | null>;
  hasRole: (...roles: UserRole[]) => boolean;
  isStaffSide: boolean;
  isClient: boolean;
  /** Demo-only helper to preview client UI without login. */
  previewAs: (role: "admin" | "client") => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function verificationActionCodeSettings() {
  if (typeof window === "undefined") return undefined;
  return {
    url: `${window.location.origin}/verify-email`,
    handleCodeInApp: false,
  };
}

function errorCode(err: unknown): string {
  return typeof err === "object" && err && "code" in err
    ? String((err as { code?: string }).code || "")
    : "";
}

const VERIFICATION_SEND_FAILED_KEY = "siteledger.verificationSendFailed";

/**
 * Sends the verification email, falling back to Firebase's default action
 * (no custom continueUrl) if the app's own origin is not on the project's
 * Auth "Authorized domains" allowlist (auth/unauthorized-continue-uri).
 * That misconfiguration previously caused every production signup to fail
 * to send a verification email while createUserWithEmailAndPassword still
 * "succeeded" — see docs/firebase-remediation-roadmap.md.
 */
async function sendVerificationEmailWithFallback(
  user: User,
  stage: "signup" | "resend",
): Promise<void> {
  try {
    await sendEmailVerification(user, verificationActionCodeSettings());
    console.info(`[auth:${stage}] verification email sent (custom continueUrl)`);
    return;
  } catch (err) {
    const code = errorCode(err);
    console.error(`[auth:${stage}] send_verification failed code=${code || "unknown"}`);
    if (code !== "auth/unauthorized-continue-uri") throw err;
  }
  // Custom continueUrl's origin isn't authorized in Firebase Auth settings.
  // Retry with Firebase's default action handler so the user still gets an
  // email, instead of silently failing.
  await sendEmailVerification(user);
  console.info(`[auth:${stage}] verification email sent (default action, fallback)`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(
    AUTH_BYPASS ? DEMO_ADMIN : null,
  );
  const [loading, setLoading] = useState(!AUTH_BYPASS);

  async function loadProfile(next: User | null) {
    if (!next) {
      setProfile(null);
      return null;
    }
    const p = await getUserProfile(next.uid);
    setProfile(p);
    return p;
  }

  useEffect(() => {
    if (AUTH_BYPASS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- AUTH_BYPASS bootstrap
      setProfile({
        ...DEMO_ADMIN,
        defaultWorkspaceId: DEMO_ADMIN.companyId,
        onboardingComplete: true,
        emailVerified: true,
      });
      setLoading(false);
      return;
    }
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(getFirebaseAuth(), async (next) => {
      setUser(next);
      await loadProfile(next);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const emailVerified = AUTH_BYPASS ? true : Boolean(user?.emailVerified);
  const needsEmailVerification = Boolean(
    user &&
      !emailVerified &&
      !(
        profile?.active &&
        (profile.role === "admin" ||
          profile.role === "staff" ||
          profile.role === "client")
      ),
  );
  const needsOnboarding = Boolean(
    user &&
      !needsEmailVerification &&
      profile?.role !== "client" &&
      (!profile || profile.onboardingComplete === false),
  );
  const needsPasswordChange = Boolean(
    user && profile?.active && profile.mustChangePassword === true,
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: AUTH_BYPASS ? ({ uid: profile?.uid || "demo" } as User) : user,
      profile,
      loading,
      emailVerified,
      needsEmailVerification,
      needsOnboarding,
      needsPasswordChange,
      async login(email, password, options) {
        if (AUTH_BYPASS) return profile || DEMO_ADMIN;
        if (!isFirebaseConfigured) {
          throw new Error("Firebase is not configured. Add .env.local first.");
        }
        try {
          const trustDevice = Boolean(options?.trustDevice);
          const auth = getFirebaseAuth();
          await setPersistence(
            auth,
            trustDevice ? browserLocalPersistence : browserSessionPersistence,
          );
          const cred = await signInWithEmailAndPassword(
            auth,
            email,
            password,
          );
          setSessionMode(trustDevice ? "trusted" : "session");

          const p = await getUserProfile(cred.user.uid);
          if (p && !p.active) {
            clearSessionMarkers();
            await signOut(auth);
            throw new Error(
              "This account has been disabled. Contact support if you need help.",
            );
          }
          // Workspace owners are created via Signup + onboarding — never auto-provision on login.
          setUser(cred.user);
          setProfile(p);
          broadcastAuthEvent("login");
          return p;
        } catch (err) {
          throw new Error(
            friendlyAuthError(
              err,
              "We could not sign you in. Please try again.",
            ),
          );
        }
      },
      async signup(input) {
        if (AUTH_BYPASS) {
          throw new Error("Signup is disabled in preview mode.");
        }
        if (!isFirebaseConfigured) {
          throw new Error("Firebase is not configured. Add .env.local first.");
        }

        // Stage 1: create the Firebase Auth account. Any failure here means
        // no account exists, so it's safe to surface a fatal error.
        let cred: { user: User };
        try {
          const auth = getFirebaseAuth();
          await setPersistence(auth, browserSessionPersistence);
          setSessionMode("session");
          cred = await createUserWithEmailAndPassword(
            auth,
            input.email.trim(),
            input.password,
          );
        } catch (err) {
          console.error(`[auth:signup] create_account failed code=${errorCode(err) || "unknown"}`);
          throw new Error(
            friendlyAuthError(
              err,
              "We could not create your account. Please check the information and try again.",
            ),
          );
        }

        // Stage 2: cosmetic profile update. Non-fatal — the account already
        // exists, so we log and continue rather than fail the whole signup.
        if (input.displayName?.trim()) {
          try {
            await updateProfile(cred.user, {
              displayName: input.displayName.trim(),
            });
          } catch (err) {
            console.error(`[auth:signup] update_display_name failed code=${errorCode(err) || "unknown"}`);
          }
        }

        // Stage 3: send the verification email. The account already exists
        // at this point, so a failure here must NOT be reported as "account
        // creation failed" (that previously hid the real cause). Instead we
        // record that the send failed so /verify-email can show an accurate
        // state instead of falsely claiming an email was sent.
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(VERIFICATION_SEND_FAILED_KEY);
        }
        try {
          await sendVerificationEmailWithFallback(cred.user, "signup");
        } catch (err) {
          const code = errorCode(err) || "unknown";
          console.error(`[auth:signup] send_verification failed permanently code=${code}`);
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(VERIFICATION_SEND_FAILED_KEY, code);
          }
        }

        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            "siteledger.pendingSignup",
            JSON.stringify({
              studioName: input.studioName?.trim() || "",
              displayName: input.displayName?.trim() || "",
            }),
          );
        }
        setUser(cred.user);
        setProfile(null);
        return cred.user;
      },
      async logout() {
        if (AUTH_BYPASS) {
          setProfile(DEMO_ADMIN);
          return;
        }
        clearSessionMarkers();
        broadcastAuthEvent("logout");
        await signOut(getFirebaseAuth());
        setProfile(null);
        setUser(null);
      },
      async resetPassword(email) {
        if (AUTH_BYPASS) return;
        try {
          await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
        } catch (err) {
          console.error("[resetPassword]", err);
          const code =
            typeof err === "object" && err && "code" in err
              ? String((err as { code?: string }).code)
              : "";
          if (code === "auth/too-many-requests") {
            throw new Error(
              "Too many attempts. Please wait a moment and try again.",
            );
          }
          if (code === "auth/network-request-failed") {
            throw new Error(
              "Network error. Check your connection and try again.",
            );
          }
        }
      },
      async resendVerification() {
        const current = getFirebaseAuth().currentUser;
        if (!current) throw new Error("Please sign in again.");
        try {
          await sendVerificationEmailWithFallback(current, "resend");
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem(VERIFICATION_SEND_FAILED_KEY);
          }
        } catch (err) {
          throw new Error(
            friendlyAuthError(
              err,
              "We could not resend the verification email. Please try again.",
            ),
          );
        }
      },
      async reloadVerified() {
        const current = getFirebaseAuth().currentUser;
        if (!current) return false;
        await current.reload();
        const latest = getFirebaseAuth().currentUser;
        const verified = Boolean(latest?.emailVerified);
        // Only force a token refresh once we actually need the updated
        // email_verified claim for API routes — not on every poll. Forcing
        // getIdToken(true) on an unverified account every few seconds is
        // what was tripping Firebase's abuse rate limiter (too-many-requests)
        // and blocking legitimate resend attempts.
        if (verified) {
          await current.getIdToken(true);
        }
        setUser((prev) => {
          if (
            prev?.uid === latest?.uid &&
            prev?.emailVerified === latest?.emailVerified
          ) {
            return prev;
          }
          return latest;
        });
        return verified;
      },
      async completeOnboarding(input) {
        const current = getFirebaseAuth().currentUser;
        if (!current) throw new Error("Please sign in again.");
        await current.reload();
        await current.getIdToken(true);
        const latest = getFirebaseAuth().currentUser;
        if (!latest?.emailVerified) {
          throw new Error("Please verify your email before continuing.");
        }
        const token = await latest.getIdToken(true);
        let pending: { studioName?: string; displayName?: string } = {};
        if (typeof window !== "undefined") {
          try {
            pending = JSON.parse(
              window.sessionStorage.getItem("siteledger.pendingSignup") || "{}",
            );
          } catch {
            pending = {};
          }
        }
        const result = await completeOnboardingClient(token, {
          studioName: input?.studioName || pending.studioName,
          displayName: input?.displayName || pending.displayName,
          migrateLegacy: true,
        });
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("siteledger.pendingSignup");
        }
        setUser(latest);
        await loadProfile(latest);
        return result.workspaceId || "";
      },
      async refreshProfile() {
        const current = AUTH_BYPASS ? null : getFirebaseAuth().currentUser;
        if (AUTH_BYPASS) return profile;
        return loadProfile(current);
      },
      hasRole(...roles) {
        return !!profile && roles.includes(profile.role);
      },
      isStaffSide:
        !!profile && (profile.role === "admin" || profile.role === "staff"),
      isClient: !!profile && profile.role === "client",
      previewAs(role) {
        if (!AUTH_BYPASS) return;
        setProfile(role === "client" ? DEMO_CLIENT : DEMO_ADMIN);
      },
    }),
    [
      user,
      profile,
      loading,
      emailVerified,
      needsEmailVerification,
      needsOnboarding,
      needsPasswordChange,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

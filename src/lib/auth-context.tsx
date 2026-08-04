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
        try {
          const auth = getFirebaseAuth();
          await setPersistence(auth, browserSessionPersistence);
          setSessionMode("session");
          const cred = await createUserWithEmailAndPassword(
            auth,
            input.email.trim(),
            input.password,
          );
          if (input.displayName?.trim()) {
            await updateProfile(cred.user, {
              displayName: input.displayName.trim(),
            });
          }
          await sendEmailVerification(cred.user);
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
        } catch (err) {
          throw new Error(
            friendlyAuthError(
              err,
              "We could not create your account. Please check the information and try again.",
            ),
          );
        }
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
        await sendEmailVerification(current);
      },
      async reloadVerified() {
        const current = getFirebaseAuth().currentUser;
        if (!current) return false;
        await current.reload();
        const verified = Boolean(getFirebaseAuth().currentUser?.emailVerified);
        setUser(getFirebaseAuth().currentUser);
        return verified;
      },
      async completeOnboarding(input) {
        const current = getFirebaseAuth().currentUser;
        if (!current) throw new Error("Please sign in again.");
        await current.reload();
        if (!current.emailVerified) {
          throw new Error("Please verify your email before continuing.");
        }
        const token = await current.getIdToken(true);
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
        await loadProfile(current);
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

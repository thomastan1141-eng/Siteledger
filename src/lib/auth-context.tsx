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
  type User,
} from "firebase/auth";
import { AUTH_BYPASS, DEMO_ADMIN, DEMO_CLIENT } from "./demo";
import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";
import {
  ensureBootstrapAdmin,
  getUserProfile,
} from "./services/users";
import type { AppUser, UserRole } from "./types";

type AuthContextValue = {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AppUser>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
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

  useEffect(() => {
    if (AUTH_BYPASS) {
      setProfile(DEMO_ADMIN);
      setLoading(false);
      return;
    }
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(getFirebaseAuth(), async (next) => {
      setUser(next);
      if (next) {
        const p = await getUserProfile(next.uid);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: AUTH_BYPASS ? ({ uid: profile?.uid || "demo" } as User) : user,
      profile,
      loading,
      async login(email, password) {
        if (AUTH_BYPASS) return profile || DEMO_ADMIN;
        if (!isFirebaseConfigured) {
          throw new Error("Firebase is not configured. Add .env.local first.");
        }
        const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
        let p = await getUserProfile(cred.user.uid);
        if (!p) {
          p = await ensureBootstrapAdmin({
            uid: cred.user.uid,
            email: cred.user.email || email,
            displayName: cred.user.displayName || undefined,
          });
        }
        if (!p || !p.active) {
          await signOut(getFirebaseAuth());
          throw new Error(
            "Account is inactive or not provisioned. Ask an admin to invite you.",
          );
        }
        setProfile(p);
        return p;
      },
      async logout() {
        if (AUTH_BYPASS) {
          setProfile(DEMO_ADMIN);
          return;
        }
        await signOut(getFirebaseAuth());
        setProfile(null);
      },
      async resetPassword(email) {
        if (AUTH_BYPASS) return;
        await sendPasswordResetEmail(getFirebaseAuth(), email);
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
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

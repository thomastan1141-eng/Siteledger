"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import { AUTH_BYPASS } from "./demo";
import { COMPANY_ID } from "./constants";
import type { Workspace, WorkspaceMember } from "./types";
import { getWorkspace, getWorkspaceMember } from "./services/workspaces";
import { getFirebaseAuth } from "./firebase";

type WorkspaceContextValue = {
  workspace: Workspace | null;
  membership: WorkspaceMember | null;
  workspaceId: string | null;
  loading: boolean;
  refreshWorkspace: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading, completeOnboarding, refreshProfile } =
    useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [membership, setMembership] = useState<WorkspaceMember | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWorkspace = useCallback(async () => {
    if (AUTH_BYPASS) {
      setWorkspace({
        id: COMPANY_ID,
        name: "Demo Studio",
        ownerUid: "demo-admin",
        plan: "FREE",
        subscriptionStatus: "NONE",
        trialStartsAt: null,
        trialEndsAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setMembership({
        uid: "demo-admin",
        email: "admin@siteledger.demo",
        displayName: "Demo Admin",
        role: "OWNER",
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
      });
      setLoading(false);
      return;
    }

    const currentProfile = profile;
    const id =
      currentProfile?.defaultWorkspaceId || currentProfile?.companyId || null;
    if (!currentProfile || !id) {
      setWorkspace(null);
      setMembership(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let [ws, member] = await Promise.all([
        getWorkspace(id),
        getWorkspaceMember(id, currentProfile.uid),
      ]);

      // Soft migrate any verified USER who has an account but no workspace
      // yet. Every account gets a personal workspace — this never depends
      // on users/{uid}.role.
      if (
        (!ws || !member) &&
        getFirebaseAuth().currentUser?.emailVerified
      ) {
        try {
          await completeOnboarding({
            displayName: currentProfile.displayName,
            studioName: currentProfile.studioName || undefined,
          });
          const refreshed = await refreshProfile();
          const nextId =
            refreshed?.defaultWorkspaceId ||
            refreshed?.companyId ||
            currentProfile.defaultWorkspaceId ||
            currentProfile.companyId;
          if (nextId) {
            [ws, member] = await Promise.all([
              getWorkspace(nextId),
              getWorkspaceMember(nextId, currentProfile.uid),
            ]);
          }
        } catch (err) {
          console.warn("[workspace migrate]", err);
        }
      }

      setWorkspace(ws);
      setMembership(member);
    } finally {
      setLoading(false);
    }
  }, [profile, completeOnboarding, refreshProfile]);

  useEffect(() => {
    if (authLoading) return;
    // Load workspace when auth profile is ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async workspace fetch
    void refreshWorkspace();
  }, [authLoading, refreshWorkspace]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      membership,
      workspaceId: workspace?.id || profile?.defaultWorkspaceId || profile?.companyId || null,
      loading: authLoading || loading,
      refreshWorkspace,
    }),
    [workspace, membership, profile, authLoading, loading, refreshWorkspace],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

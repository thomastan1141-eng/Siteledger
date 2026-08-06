"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import { listClientProjects, workspaceIdsForProfile } from "./services/projects";
import { listSchedule, summarizeSchedule } from "./services/schedule";
import { groupUpdatesByDate, listUpdates } from "./services/updates";
import { listMedia } from "./services/media";
import type { DailyUpdate, MediaItem, Project, ScheduleItem } from "./types";
import { SiteSpinner } from "@/components/progress/primitives";

type ClientProjectContextValue = {
  project: Project;
  schedule: ScheduleItem[];
  updates: DailyUpdate[];
  media: MediaItem[];
  summary: ReturnType<typeof summarizeSchedule>;
  timelineGroups: ReturnType<typeof groupUpdatesByDate>;
  mediaByUpdate: Record<string, MediaItem[]>;
  clientMedia: MediaItem[];
  reload: () => Promise<void>;
};

const ClientProjectContext = createContext<ClientProjectContextValue | null>(
  null,
);

export function ClientProjectProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    if (!profile) return;
    const projects = await listClientProjects(
      profile.uid,
      workspaceIdsForProfile(profile),
    );
    const next = projects[0];
    if (!next) {
      setError("No project is linked to this client account.");
      setProject(null);
      return;
    }
    const ws = next.workspaceId || next.companyId || profile.companyId;
    const [s, u, m] = await Promise.all([
      listSchedule(next.id, { clientOnly: true, workspaceId: ws }),
      listUpdates(next.id, { clientOnly: true, workspaceId: ws }),
      listMedia(next.id, { clientOnly: true, workspaceId: ws }),
    ]);
    setProject(next);
    setSchedule(s);
    setUpdates(u);
    setMedia(m);
    setError("");
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [profile?.uid]);

  const value = useMemo(() => {
    if (!project) return null;
    const mediaByUpdate: Record<string, MediaItem[]> = {};
    media.forEach((item) => {
      if (!item.updateId) return;
      mediaByUpdate[item.updateId] = mediaByUpdate[item.updateId] || [];
      mediaByUpdate[item.updateId].push(item);
    });
    return {
      project,
      schedule,
      updates,
      media,
      summary: summarizeSchedule(schedule),
      timelineGroups: groupUpdatesByDate(updates),
      mediaByUpdate,
      clientMedia: media,
      reload,
    };
  }, [project, schedule, updates, media]);

  if (loading) return <SiteSpinner label="Opening your project…" />;
  if (error || !value) {
    return (
      <div className="site-empty">
        <strong>{error || "Unable to load project."}</strong>
      </div>
    );
  }

  return (
    <ClientProjectContext.Provider value={value}>
      {children}
    </ClientProjectContext.Provider>
  );
}

export function useClientProject() {
  const ctx = useContext(ClientProjectContext);
  if (!ctx) {
    throw new Error("useClientProject must be used within ClientProjectProvider");
  }
  return ctx;
}

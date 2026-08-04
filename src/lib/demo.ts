import { COMPANY_ID } from "./constants";
import type {
  AppUser,
  DailyUpdate,
  MediaItem,
  Project,
  ScheduleItem,
  ScheduleStatus,
} from "./types";

/** Demo/preview mode — keep helpers; must be false for Firebase runtime. */
export const AUTH_BYPASS = false;

const PHOTO = {
  construction:
    "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200&q=80",
  living:
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
  kitchen:
    "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200&q=80",
  bathroom:
    "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200&q=80",
  tiling:
    "https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=1200&q=80",
  painting:
    "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=1200&q=80",
  carpentry:
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80",
  ceiling:
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=80",
  electrical:
    "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&q=80",
  exterior:
    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80",
  empty:
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
  handover:
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80",
  site:
    "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200&q=80",
  tools:
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80",
  windows:
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&q=80",
} as const;

const VIDEO = {
  blaze:
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  escape:
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  joyride:
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  funnel:
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  melt:
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
} as const;

export const DEMO_ADMIN: AppUser = {
  uid: "demo-admin",
  email: "admin@siteledger.demo",
  displayName: "Demo Admin",
  role: "admin",
  companyId: COMPANY_ID,
  projectIds: [
    "demo-berwick",
    "demo-orchid",
    "demo-holland",
    "demo-marine",
    "demo-newton",
  ],
  createdAt: "2026-08-01T00:00:00.000Z",
  active: true,
};

export const DEMO_CLIENT: AppUser = {
  uid: "demo-client",
  email: "client@siteledger.demo",
  displayName: "Alex Tan",
  role: "client",
  companyId: COMPANY_ID,
  projectIds: ["demo-berwick"],
  createdAt: "2026-08-01T00:00:00.000Z",
  active: true,
};

function project(base: Project): Project {
  return base;
}

export const DEMO_PROJECTS: Project[] = [
  project({
    id: "demo-berwick",
    companyId: COMPANY_ID,
    name: "Berwick Drive",
    code: "SH-2026-014",
    clientName: "Alex Tan",
    address: "12 Berwick Drive, Singapore",
    coverPhotoUrl: PHOTO.living,
    tour3dUrl: "https://my.matterport.com/show/?m=demo-berwick",
    tour3dLabel: "Berwick Drive 3D tour",
    images3d: [
      {
        id: "bw-3d-1",
        fileName: "berwick-living-pano.jpg",
        downloadUrl: PHOTO.living,
        storagePath: "demo/3d/berwick-living-pano.jpg",
        sizeBytes: 1_400_000,
        createdAt: "2026-08-01T10:00:00.000Z",
      },
      {
        id: "bw-3d-2",
        fileName: "berwick-kitchen-pano.jpg",
        downloadUrl: PHOTO.kitchen,
        storagePath: "demo/3d/berwick-kitchen-pano.jpg",
        sizeBytes: 1_250_000,
        createdAt: "2026-08-01T10:01:00.000Z",
      },
    ],
    overview3dImageId: "bw-3d-1",
    startDate: "2026-06-01",
    contractCompletionDate: "2026-11-30",
    forecastCompletionDate: "2026-12-05",
    managerId: "demo-admin",
    managerName: "Demo Admin",
    status: "in_progress",
    forecastStatus: "slight_delay",
    clientUserIds: ["demo-client"],
    staffIds: ["demo-admin"],
    internalNotes: "Tile delivery delayed by 3 days.",
    dailyReminderHour: 17,
    staleDaysThreshold: 3,
    allowStaffPublish: true,
    allowClientDownload: true,
    photoCount: 6,
    videoCount: 2,
    storageBytes: 86_000_000,
    lastUpdateAt: "2026-08-02T09:30:00.000Z",
    lastClientUpdateAt: "2026-08-02T09:30:00.000Z",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-08-02T09:30:00.000Z",
  }),
  project({
    id: "demo-orchid",
    companyId: COMPANY_ID,
    name: "Orchid Boulevard",
    code: "SH-2026-021",
    clientName: "Michelle Ong",
    address: "88 Orchid Boulevard #12-05, Singapore",
    coverPhotoUrl: PHOTO.kitchen,
    tour3dUrl: "https://kuula.co/share/collection/demo-orchid",
    tour3dLabel: "Orchid Boulevard walkthrough",
    images3d: [
      {
        id: "or-3d-1",
        fileName: "orchid-kitchen-3d.jpg",
        downloadUrl: PHOTO.kitchen,
        storagePath: "demo/3d/orchid-kitchen-3d.jpg",
        sizeBytes: 1_100_000,
        createdAt: "2026-07-20T09:00:00.000Z",
      },
    ],
    startDate: "2026-04-15",
    contractCompletionDate: "2026-10-15",
    forecastCompletionDate: "2026-10-10",
    managerId: "demo-admin",
    managerName: "Demo Admin",
    status: "in_progress",
    forecastStatus: "ahead",
    clientUserIds: ["demo-client-orchid"],
    staffIds: ["demo-admin"],
    internalNotes: "Cabinetry fabrication ahead of schedule.",
    dailyReminderHour: 17,
    staleDaysThreshold: 3,
    allowStaffPublish: true,
    allowClientDownload: false,
    photoCount: 5,
    videoCount: 1,
    storageBytes: 62_000_000,
    lastUpdateAt: "2026-08-02T16:10:00.000Z",
    lastClientUpdateAt: "2026-08-02T16:10:00.000Z",
    createdAt: "2026-03-28T00:00:00.000Z",
    updatedAt: "2026-08-02T16:10:00.000Z",
  }),
  project({
    id: "demo-holland",
    companyId: COMPANY_ID,
    name: "Holland Village Walk-up",
    code: "SH-2026-008",
    clientName: "David Lim",
    address: "45 Holland Road, Singapore",
    coverPhotoUrl: PHOTO.exterior,
    startDate: "2026-03-01",
    contractCompletionDate: "2026-09-30",
    forecastCompletionDate: "2026-10-20",
    managerId: "demo-admin",
    managerName: "Demo Admin",
    status: "in_progress",
    forecastStatus: "delayed",
    clientUserIds: [],
    staffIds: ["demo-admin"],
    internalNotes: "Waiting for waterproofing retest.",
    dailyReminderHour: 17,
    staleDaysThreshold: 3,
    allowStaffPublish: false,
    allowClientDownload: false,
    photoCount: 4,
    videoCount: 1,
    storageBytes: 51_000_000,
    lastUpdateAt: "2026-07-30T18:00:00.000Z",
    lastClientUpdateAt: "2026-07-28T11:00:00.000Z",
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-07-30T18:00:00.000Z",
  }),
  project({
    id: "demo-marine",
    companyId: COMPANY_ID,
    name: "Marine Parade Condo",
    code: "SH-2026-031",
    clientName: "Priya Sharma",
    address: "3 Marine Vista #09-12, Singapore",
    coverPhotoUrl: PHOTO.empty,
    startDate: "2026-08-10",
    contractCompletionDate: "2027-02-28",
    forecastCompletionDate: "2027-02-28",
    managerId: "demo-admin",
    managerName: "Demo Admin",
    status: "upcoming",
    forecastStatus: "on_track",
    clientUserIds: [],
    staffIds: ["demo-admin"],
    internalNotes: "Kickoff meeting scheduled next week.",
    dailyReminderHour: 17,
    staleDaysThreshold: 3,
    allowStaffPublish: true,
    allowClientDownload: false,
    photoCount: 3,
    videoCount: 1,
    storageBytes: 28_000_000,
    lastUpdateAt: "2026-07-25T10:00:00.000Z",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-25T10:00:00.000Z",
  }),
  project({
    id: "demo-newton",
    companyId: COMPANY_ID,
    name: "Newton Road Residences",
    code: "SH-2025-119",
    clientName: "Kenji Watanabe",
    address: "21 Newton Road, Singapore",
    coverPhotoUrl: PHOTO.handover,
    startDate: "2025-11-01",
    contractCompletionDate: "2026-05-30",
    forecastCompletionDate: "2026-05-28",
    actualCompletionDate: "2026-05-28",
    managerId: "demo-admin",
    managerName: "Demo Admin",
    status: "completed",
    forecastStatus: "ahead",
    clientUserIds: ["demo-client-newton"],
    staffIds: ["demo-admin"],
    internalNotes: "Handover package archived.",
    dailyReminderHour: 17,
    staleDaysThreshold: 3,
    allowStaffPublish: false,
    allowClientDownload: true,
    photoCount: 5,
    videoCount: 1,
    storageBytes: 74_000_000,
    lastUpdateAt: "2026-05-28T15:00:00.000Z",
    lastClientUpdateAt: "2026-05-28T15:00:00.000Z",
    createdAt: "2025-10-01T00:00:00.000Z",
    updatedAt: "2026-05-28T15:00:00.000Z",
  }),
];

/** @deprecated use DEMO_PROJECTS[0] */
export const DEMO_PROJECT = DEMO_PROJECTS[0];

function stage(
  projectId: string,
  id: string,
  name: string,
  status: ScheduleStatus,
  sortOrder: number,
  dates: {
    plannedStartDate?: string;
    plannedEndDate?: string;
    actualStartDate?: string;
    actualEndDate?: string;
    reminderDate?: string;
    internalNotes?: string;
    clientVisible?: boolean;
    source?: "preset" | "custom";
  },
): ScheduleItem {
  return {
    id,
    projectId,
    companyId: COMPANY_ID,
    name,
    normalizedName: name.toLowerCase(),
    source: dates.source || "preset",
    status,
    sortOrder,
    plannedStartDate: dates.plannedStartDate,
    plannedEndDate: dates.plannedEndDate,
    actualStartDate: dates.actualStartDate,
    actualEndDate: dates.actualEndDate,
    reminderDate: dates.reminderDate,
    internalNotes: dates.internalNotes,
    clientVisible: dates.clientVisible !== false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

export const DEMO_SCHEDULE: ScheduleItem[] = [
  // Berwick
  stage("demo-berwick", "bw-s1", "Demolition", "completed", 0, {
    plannedStartDate: "2026-06-01",
    plannedEndDate: "2026-06-10",
    actualStartDate: "2026-06-01",
    actualEndDate: "2026-06-09",
  }),
  stage("demo-berwick", "bw-s2", "Plumbing work", "completed", 1, {
    plannedStartDate: "2026-06-12",
    plannedEndDate: "2026-06-28",
    actualStartDate: "2026-06-12",
    actualEndDate: "2026-06-27",
  }),
  stage("demo-berwick", "bw-s3", "Electrical work", "ongoing", 2, {
    plannedStartDate: "2026-07-15",
    plannedEndDate: "2026-08-05",
    actualStartDate: "2026-07-16",
    reminderDate: "2026-08-04",
  }),
  stage("demo-berwick", "bw-s4", "Tiling work", "ongoing", 3, {
    plannedStartDate: "2026-07-20",
    plannedEndDate: "2026-08-10",
    actualStartDate: "2026-07-22",
  }),
  stage("demo-berwick", "bw-s5", "Ceiling work", "completed", 4, {
    plannedStartDate: "2026-07-01",
    plannedEndDate: "2026-07-18",
    actualStartDate: "2026-07-01",
    actualEndDate: "2026-07-17",
  }),
  stage("demo-berwick", "bw-s6", "Painting work", "not_started", 5, {
    plannedStartDate: "2026-09-01",
    plannedEndDate: "2026-09-20",
  }),
  stage("demo-berwick", "bw-s7", "Carpentry installation", "not_started", 6, {
    plannedStartDate: "2026-09-15",
    plannedEndDate: "2026-10-10",
    reminderDate: "2026-09-10",
  }),
  stage("demo-berwick", "bw-s8", "Internal QC", "on_hold", 7, {
    plannedStartDate: "2026-10-01",
    plannedEndDate: "2026-10-05",
    clientVisible: false,
    source: "custom",
    internalNotes: "Internal snag walk — not shown to client",
  }),
  stage("demo-berwick", "bw-s9", "Handover", "not_started", 8, {
    plannedStartDate: "2026-12-01",
    plannedEndDate: "2026-12-05",
  }),

  // Orchid
  stage("demo-orchid", "or-s1", "Demolition", "completed", 0, {
    plannedStartDate: "2026-04-15",
    plannedEndDate: "2026-04-25",
    actualStartDate: "2026-04-15",
    actualEndDate: "2026-04-24",
  }),
  stage("demo-orchid", "or-s2", "Masonry work", "completed", 1, {
    plannedStartDate: "2026-04-26",
    plannedEndDate: "2026-05-15",
    actualStartDate: "2026-04-26",
    actualEndDate: "2026-05-14",
  }),
  stage("demo-orchid", "or-s3", "Carpentry fabrication", "completed", 2, {
    plannedStartDate: "2026-06-01",
    plannedEndDate: "2026-07-10",
    actualStartDate: "2026-06-01",
    actualEndDate: "2026-07-05",
  }),
  stage("demo-orchid", "or-s4", "Carpentry installation", "ongoing", 3, {
    plannedStartDate: "2026-07-20",
    plannedEndDate: "2026-08-15",
    actualStartDate: "2026-07-18",
  }),
  stage("demo-orchid", "or-s5", "Painting work", "ongoing", 4, {
    plannedStartDate: "2026-08-01",
    plannedEndDate: "2026-08-20",
    actualStartDate: "2026-08-01",
  }),
  stage("demo-orchid", "or-s6", "Lighting installation", "not_started", 5, {
    plannedStartDate: "2026-09-01",
    plannedEndDate: "2026-09-10",
    reminderDate: "2026-08-28",
  }),
  stage("demo-orchid", "or-s7", "Handover", "not_started", 6, {
    plannedStartDate: "2026-10-05",
    plannedEndDate: "2026-10-10",
  }),

  // Holland
  stage("demo-holland", "hl-s1", "Demolition", "completed", 0, {
    plannedStartDate: "2026-03-01",
    plannedEndDate: "2026-03-20",
    actualStartDate: "2026-03-01",
    actualEndDate: "2026-03-22",
  }),
  stage("demo-holland", "hl-s2", "Waterproofing work", "delayed", 1, {
    plannedStartDate: "2026-06-01",
    plannedEndDate: "2026-06-20",
    actualStartDate: "2026-06-05",
    reminderDate: "2026-08-05",
    internalNotes: "Retest pending after first failure.",
  }),
  stage("demo-holland", "hl-s3", "Tiling work", "on_hold", 2, {
    plannedStartDate: "2026-07-01",
    plannedEndDate: "2026-07-25",
    internalNotes: "Paused until waterproofing clears.",
  }),
  stage("demo-holland", "hl-s4", "Electrical work", "ongoing", 3, {
    plannedStartDate: "2026-07-10",
    plannedEndDate: "2026-08-05",
    actualStartDate: "2026-07-12",
  }),
  stage("demo-holland", "hl-s5", "Painting work", "not_started", 4, {
    plannedStartDate: "2026-09-01",
    plannedEndDate: "2026-09-25",
  }),
  stage("demo-holland", "hl-s6", "Handover", "not_started", 5, {
    plannedStartDate: "2026-10-15",
    plannedEndDate: "2026-10-20",
  }),

  // Marine — intentionally no stages (empty-state demo)

  // Newton — completed
  stage("demo-newton", "nw-s1", "Demolition", "completed", 0, {
    plannedStartDate: "2025-11-01",
    plannedEndDate: "2025-11-15",
    actualStartDate: "2025-11-01",
    actualEndDate: "2025-11-14",
  }),
  stage("demo-newton", "nw-s2", "Tiling work", "completed", 1, {
    plannedStartDate: "2026-01-10",
    plannedEndDate: "2026-02-05",
    actualStartDate: "2026-01-10",
    actualEndDate: "2026-02-03",
  }),
  stage("demo-newton", "nw-s3", "Painting work", "completed", 2, {
    plannedStartDate: "2026-03-01",
    plannedEndDate: "2026-03-20",
    actualStartDate: "2026-03-01",
    actualEndDate: "2026-03-18",
  }),
  stage("demo-newton", "nw-s4", "Carpentry installation", "completed", 3, {
    plannedStartDate: "2026-03-25",
    plannedEndDate: "2026-04-20",
    actualStartDate: "2026-03-25",
    actualEndDate: "2026-04-18",
  }),
  stage("demo-newton", "nw-s5", "Cleaning work", "completed", 4, {
    plannedStartDate: "2026-05-20",
    plannedEndDate: "2026-05-25",
    actualStartDate: "2026-05-20",
    actualEndDate: "2026-05-24",
  }),
  stage("demo-newton", "nw-s6", "Handover", "completed", 5, {
    plannedStartDate: "2026-05-26",
    plannedEndDate: "2026-05-28",
    actualStartDate: "2026-05-26",
    actualEndDate: "2026-05-28",
  }),
];

function update(
  partial: Omit<DailyUpdate, "companyId" | "createdBy" | "createdByName" | "customActivities" | "mediaIds" | "updatedAt"> & {
    customActivities?: string[];
    mediaIds?: string[];
  },
): DailyUpdate {
  return {
    companyId: COMPANY_ID,
    createdBy: "demo-admin",
    createdByName: "Demo Admin",
    customActivities: partial.customActivities || [],
    mediaIds: partial.mediaIds || [],
    updatedAt: partial.createdAt,
    ...partial,
  };
}

export const DEMO_UPDATES: DailyUpdate[] = [
  update({
    id: "bw-u1",
    projectId: "demo-berwick",
    date: "2026-08-02",
    workItems: ["Tiling work", "Electrical work"],
    noWorkToday: false,
    note: "Living room floor tiling is ongoing. Approximately 70% completed.",
    visibility: "client_visible",
    photoCount: 3,
    videoCount: 1,
    mediaIds: ["bw-m1", "bw-m2", "bw-m3", "bw-v1"],
    createdAt: "2026-08-02T09:30:00.000Z",
  }),
  update({
    id: "bw-u2",
    projectId: "demo-berwick",
    date: "2026-08-01",
    workItems: ["Ceiling work"],
    noWorkToday: false,
    note: "Ceiling framing completed in bedrooms.",
    visibility: "client_visible",
    photoCount: 2,
    videoCount: 1,
    mediaIds: ["bw-m4", "bw-m5", "bw-v2"],
    createdAt: "2026-08-01T17:10:00.000Z",
  }),
  update({
    id: "bw-u3",
    projectId: "demo-berwick",
    date: "2026-07-30",
    workItems: ["Plumbing work"],
    noWorkToday: false,
    note: "Internal leak check — for team only.",
    visibility: "internal",
    photoCount: 1,
    videoCount: 0,
    mediaIds: ["bw-m6"],
    createdAt: "2026-07-30T14:00:00.000Z",
  }),

  update({
    id: "or-u1",
    projectId: "demo-orchid",
    date: "2026-08-02",
    workItems: ["Carpentry installation", "Painting work"],
    noWorkToday: false,
    note: "Kitchen cabinets installed. First coat painting in living room.",
    visibility: "client_visible",
    photoCount: 3,
    videoCount: 1,
    mediaIds: ["or-m1", "or-m2", "or-m3", "or-v1"],
    createdAt: "2026-08-02T16:10:00.000Z",
  }),
  update({
    id: "or-u2",
    projectId: "demo-orchid",
    date: "2026-07-28",
    workItems: ["Carpentry fabrication"],
    noWorkToday: false,
    note: "Wardrobe doors delivered to site.",
    visibility: "client_visible",
    photoCount: 2,
    videoCount: 0,
    mediaIds: ["or-m4", "or-m5"],
    createdAt: "2026-07-28T11:20:00.000Z",
  }),

  update({
    id: "hl-u1",
    projectId: "demo-holland",
    date: "2026-07-30",
    workItems: ["Electrical work", "Waterproofing work"],
    noWorkToday: false,
    note: "Second-fix waterproofing applied. Electrical first fix continuing.",
    visibility: "client_visible",
    photoCount: 3,
    videoCount: 1,
    mediaIds: ["hl-m1", "hl-m2", "hl-m3", "hl-v1"],
    createdAt: "2026-07-30T18:00:00.000Z",
  }),
  update({
    id: "hl-u2",
    projectId: "demo-holland",
    date: "2026-07-28",
    workItems: ["Waterproofing work"],
    noWorkToday: false,
    note: "Failed water test — internal record.",
    visibility: "internal",
    photoCount: 1,
    videoCount: 0,
    mediaIds: ["hl-m4"],
    createdAt: "2026-07-28T11:00:00.000Z",
  }),

  update({
    id: "mr-u1",
    projectId: "demo-marine",
    date: "2026-07-25",
    workItems: [],
    customActivities: ["Pre-start site survey"],
    noWorkToday: false,
    note: "Unit measured. Existing condition photos captured before kickoff.",
    visibility: "client_visible",
    photoCount: 3,
    videoCount: 1,
    mediaIds: ["mr-m1", "mr-m2", "mr-m3", "mr-v1"],
    createdAt: "2026-07-25T10:00:00.000Z",
  }),

  update({
    id: "nw-u1",
    projectId: "demo-newton",
    date: "2026-05-28",
    workItems: ["Handover", "Cleaning work"],
    noWorkToday: false,
    note: "Final handover walkthrough completed with client.",
    visibility: "client_visible",
    photoCount: 3,
    videoCount: 1,
    mediaIds: ["nw-m1", "nw-m2", "nw-m3", "nw-v1"],
    createdAt: "2026-05-28T15:00:00.000Z",
  }),
  update({
    id: "nw-u2",
    projectId: "demo-newton",
    date: "2026-05-20",
    workItems: ["Touch-up work"],
    noWorkToday: false,
    note: "Final paint touch-ups and socket covers.",
    visibility: "client_visible",
    photoCount: 2,
    videoCount: 0,
    mediaIds: ["nw-m4", "nw-m5"],
    createdAt: "2026-05-20T13:00:00.000Z",
  }),
];

function photo(
  partial: Omit<
    MediaItem,
    | "companyId"
    | "type"
    | "contentType"
    | "uploadedBy"
    | "uploadedByName"
    | "storagePath"
    | "sizeBytes"
  > & { sizeBytes?: number },
): MediaItem {
  return {
    companyId: COMPANY_ID,
    type: "photo",
    contentType: "image/jpeg",
    uploadedBy: "demo-admin",
    uploadedByName: "Demo Admin",
    storagePath: `demo/${partial.id}.jpg`,
    sizeBytes: partial.sizeBytes ?? 1_100_000,
    ...partial,
  };
}

function video(
  partial: Omit<
    MediaItem,
    | "companyId"
    | "type"
    | "contentType"
    | "uploadedBy"
    | "uploadedByName"
    | "storagePath"
    | "sizeBytes"
    | "durationSeconds"
  > & { sizeBytes?: number; durationSeconds?: number },
): MediaItem {
  return {
    companyId: COMPANY_ID,
    type: "video",
    contentType: "video/mp4",
    uploadedBy: "demo-admin",
    uploadedByName: "Demo Admin",
    storagePath: `demo/${partial.id}.mp4`,
    sizeBytes: partial.sizeBytes ?? 8_500_000,
    durationSeconds: partial.durationSeconds ?? 15,
    ...partial,
  };
}

export const DEMO_MEDIA: MediaItem[] = [
  // Berwick
  photo({
    id: "bw-m1",
    projectId: "demo-berwick",
    updateId: "bw-u1",
    downloadUrl: PHOTO.tiling,
    fileName: "berwick-tiling-01.jpg",
    workItems: ["Tiling work"],
    caption: "Living room tiling progress",
    visibility: "client_visible",
    date: "2026-08-02",
    createdAt: "2026-08-02T09:30:00.000Z",
  }),
  photo({
    id: "bw-m2",
    projectId: "demo-berwick",
    updateId: "bw-u1",
    downloadUrl: PHOTO.electrical,
    fileName: "berwick-electrical-01.jpg",
    workItems: ["Electrical work"],
    caption: "Power points rough-in",
    visibility: "client_visible",
    date: "2026-08-02",
    createdAt: "2026-08-02T09:31:00.000Z",
  }),
  photo({
    id: "bw-m3",
    projectId: "demo-berwick",
    updateId: "bw-u1",
    downloadUrl: PHOTO.construction,
    fileName: "berwick-site-01.jpg",
    workItems: ["Tiling work"],
    visibility: "client_visible",
    date: "2026-08-02",
    createdAt: "2026-08-02T09:32:00.000Z",
  }),
  video({
    id: "bw-v1",
    projectId: "demo-berwick",
    updateId: "bw-u1",
    downloadUrl: VIDEO.blaze,
    fileName: "berwick-tiling-walkthrough.mp4",
    workItems: ["Tiling work"],
    caption: "Living room walkthrough",
    visibility: "client_visible",
    date: "2026-08-02",
    createdAt: "2026-08-02T09:33:00.000Z",
  }),
  photo({
    id: "bw-m4",
    projectId: "demo-berwick",
    updateId: "bw-u2",
    downloadUrl: PHOTO.ceiling,
    fileName: "berwick-ceiling-01.jpg",
    workItems: ["Ceiling work"],
    visibility: "client_visible",
    date: "2026-08-01",
    createdAt: "2026-08-01T17:10:00.000Z",
  }),
  photo({
    id: "bw-m5",
    projectId: "demo-berwick",
    updateId: "bw-u2",
    downloadUrl: PHOTO.living,
    fileName: "berwick-ceiling-02.jpg",
    workItems: ["Ceiling work"],
    visibility: "client_visible",
    date: "2026-08-01",
    createdAt: "2026-08-01T17:11:00.000Z",
  }),
  video({
    id: "bw-v2",
    projectId: "demo-berwick",
    updateId: "bw-u2",
    downloadUrl: VIDEO.escape,
    fileName: "berwick-ceiling.mp4",
    workItems: ["Ceiling work"],
    visibility: "client_visible",
    date: "2026-08-01",
    createdAt: "2026-08-01T17:12:00.000Z",
  }),
  photo({
    id: "bw-m6",
    projectId: "demo-berwick",
    updateId: "bw-u3",
    downloadUrl: PHOTO.tools,
    fileName: "berwick-internal-leak.jpg",
    workItems: ["Plumbing work"],
    caption: "Internal only",
    visibility: "internal",
    date: "2026-07-30",
    createdAt: "2026-07-30T14:00:00.000Z",
  }),

  // Orchid
  photo({
    id: "or-m1",
    projectId: "demo-orchid",
    updateId: "or-u1",
    downloadUrl: PHOTO.kitchen,
    fileName: "orchid-cabinets-01.jpg",
    workItems: ["Carpentry installation"],
    caption: "Kitchen cabinets installed",
    visibility: "client_visible",
    date: "2026-08-02",
    createdAt: "2026-08-02T16:10:00.000Z",
  }),
  photo({
    id: "or-m2",
    projectId: "demo-orchid",
    updateId: "or-u1",
    downloadUrl: PHOTO.carpentry,
    fileName: "orchid-cabinets-02.jpg",
    workItems: ["Carpentry installation"],
    visibility: "client_visible",
    date: "2026-08-02",
    createdAt: "2026-08-02T16:11:00.000Z",
  }),
  photo({
    id: "or-m3",
    projectId: "demo-orchid",
    updateId: "or-u1",
    downloadUrl: PHOTO.painting,
    fileName: "orchid-paint-01.jpg",
    workItems: ["Painting work"],
    caption: "Living room first coat",
    visibility: "client_visible",
    date: "2026-08-02",
    createdAt: "2026-08-02T16:12:00.000Z",
  }),
  video({
    id: "or-v1",
    projectId: "demo-orchid",
    updateId: "or-u1",
    downloadUrl: VIDEO.joyride,
    fileName: "orchid-kitchen.mp4",
    workItems: ["Carpentry installation"],
    visibility: "client_visible",
    date: "2026-08-02",
    createdAt: "2026-08-02T16:13:00.000Z",
  }),
  photo({
    id: "or-m4",
    projectId: "demo-orchid",
    updateId: "or-u2",
    downloadUrl: PHOTO.windows,
    fileName: "orchid-wardrobe-01.jpg",
    workItems: ["Carpentry fabrication"],
    visibility: "client_visible",
    date: "2026-07-28",
    createdAt: "2026-07-28T11:20:00.000Z",
  }),
  photo({
    id: "or-m5",
    projectId: "demo-orchid",
    updateId: "or-u2",
    downloadUrl: PHOTO.site,
    fileName: "orchid-delivery-01.jpg",
    workItems: ["Carpentry fabrication"],
    visibility: "client_visible",
    date: "2026-07-28",
    createdAt: "2026-07-28T11:21:00.000Z",
  }),

  // Holland
  photo({
    id: "hl-m1",
    projectId: "demo-holland",
    updateId: "hl-u1",
    downloadUrl: PHOTO.bathroom,
    fileName: "holland-waterproof-01.jpg",
    workItems: ["Waterproofing work"],
    visibility: "client_visible",
    date: "2026-07-30",
    createdAt: "2026-07-30T18:00:00.000Z",
  }),
  photo({
    id: "hl-m2",
    projectId: "demo-holland",
    updateId: "hl-u1",
    downloadUrl: PHOTO.electrical,
    fileName: "holland-electrical-01.jpg",
    workItems: ["Electrical work"],
    visibility: "client_visible",
    date: "2026-07-30",
    createdAt: "2026-07-30T18:01:00.000Z",
  }),
  photo({
    id: "hl-m3",
    projectId: "demo-holland",
    updateId: "hl-u1",
    downloadUrl: PHOTO.exterior,
    fileName: "holland-site-01.jpg",
    workItems: ["Electrical work"],
    visibility: "client_visible",
    date: "2026-07-30",
    createdAt: "2026-07-30T18:02:00.000Z",
  }),
  video({
    id: "hl-v1",
    projectId: "demo-holland",
    updateId: "hl-u1",
    downloadUrl: VIDEO.funnel,
    fileName: "holland-walkthrough.mp4",
    workItems: ["Waterproofing work"],
    visibility: "client_visible",
    date: "2026-07-30",
    createdAt: "2026-07-30T18:03:00.000Z",
  }),
  photo({
    id: "hl-m4",
    projectId: "demo-holland",
    updateId: "hl-u2",
    downloadUrl: PHOTO.tools,
    fileName: "holland-internal-fail.jpg",
    workItems: ["Waterproofing work"],
    caption: "Failed water test",
    visibility: "internal",
    date: "2026-07-28",
    createdAt: "2026-07-28T11:00:00.000Z",
  }),

  // Marine
  photo({
    id: "mr-m1",
    projectId: "demo-marine",
    updateId: "mr-u1",
    downloadUrl: PHOTO.empty,
    fileName: "marine-survey-01.jpg",
    workItems: ["Pre-start site survey"],
    caption: "Existing condition — living",
    visibility: "client_visible",
    date: "2026-07-25",
    createdAt: "2026-07-25T10:00:00.000Z",
  }),
  photo({
    id: "mr-m2",
    projectId: "demo-marine",
    updateId: "mr-u1",
    downloadUrl: PHOTO.windows,
    fileName: "marine-survey-02.jpg",
    workItems: ["Pre-start site survey"],
    visibility: "client_visible",
    date: "2026-07-25",
    createdAt: "2026-07-25T10:01:00.000Z",
  }),
  photo({
    id: "mr-m3",
    projectId: "demo-marine",
    updateId: "mr-u1",
    downloadUrl: PHOTO.bathroom,
    fileName: "marine-survey-03.jpg",
    workItems: ["Pre-start site survey"],
    visibility: "client_visible",
    date: "2026-07-25",
    createdAt: "2026-07-25T10:02:00.000Z",
  }),
  video({
    id: "mr-v1",
    projectId: "demo-marine",
    updateId: "mr-u1",
    downloadUrl: VIDEO.melt,
    fileName: "marine-survey.mp4",
    workItems: ["Pre-start site survey"],
    visibility: "client_visible",
    date: "2026-07-25",
    createdAt: "2026-07-25T10:03:00.000Z",
  }),

  // Newton
  photo({
    id: "nw-m1",
    projectId: "demo-newton",
    updateId: "nw-u1",
    downloadUrl: PHOTO.handover,
    fileName: "newton-handover-01.jpg",
    workItems: ["Handover"],
    caption: "Completed living room",
    visibility: "handover",
    date: "2026-05-28",
    createdAt: "2026-05-28T15:00:00.000Z",
  }),
  photo({
    id: "nw-m2",
    projectId: "demo-newton",
    updateId: "nw-u1",
    downloadUrl: PHOTO.kitchen,
    fileName: "newton-handover-02.jpg",
    workItems: ["Handover"],
    visibility: "handover",
    date: "2026-05-28",
    createdAt: "2026-05-28T15:01:00.000Z",
  }),
  photo({
    id: "nw-m3",
    projectId: "demo-newton",
    updateId: "nw-u1",
    downloadUrl: PHOTO.bathroom,
    fileName: "newton-handover-03.jpg",
    workItems: ["Handover"],
    visibility: "handover",
    date: "2026-05-28",
    createdAt: "2026-05-28T15:02:00.000Z",
  }),
  video({
    id: "nw-v1",
    projectId: "demo-newton",
    updateId: "nw-u1",
    downloadUrl: VIDEO.blaze,
    fileName: "newton-handover.mp4",
    workItems: ["Handover"],
    caption: "Final walkthrough",
    visibility: "handover",
    date: "2026-05-28",
    createdAt: "2026-05-28T15:03:00.000Z",
  }),
  photo({
    id: "nw-m4",
    projectId: "demo-newton",
    updateId: "nw-u2",
    downloadUrl: PHOTO.painting,
    fileName: "newton-touchup-01.jpg",
    workItems: ["Touch-up work"],
    visibility: "client_visible",
    date: "2026-05-20",
    createdAt: "2026-05-20T13:00:00.000Z",
  }),
  photo({
    id: "nw-m5",
    projectId: "demo-newton",
    updateId: "nw-u2",
    downloadUrl: PHOTO.living,
    fileName: "newton-touchup-02.jpg",
    workItems: ["Touch-up work"],
    visibility: "client_visible",
    date: "2026-05-20",
    createdAt: "2026-05-20T13:01:00.000Z",
  }),
];

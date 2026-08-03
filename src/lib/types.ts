export type UserRole = "admin" | "staff" | "client";

export type ProjectStatus =
  | "upcoming"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "archived";

export type ScheduleStatus =
  | "not_started"
  | "ongoing"
  | "delayed"
  | "completed"
  | "on_hold";

export type Visibility = "internal" | "client_visible" | "pending_approval";

export type MediaVisibility = "internal" | "client_visible" | "handover";

export type MediaType = "photo" | "video";

export type ForecastStatus =
  | "on_track"
  | "slight_delay"
  | "delayed"
  | "ahead";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  companyId: string;
  projectIds: string[];
  createdAt: string;
  active: boolean;
}

export interface Project3DImage {
  id: string;
  fileName: string;
  downloadUrl: string;
  storagePath: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Project {
  id: string;
  companyId: string;
  name: string;
  code: string;
  clientName: string;
  address: string;
  coverPhotoUrl?: string;
  /** External 3D tour / Matterport / Kuula / similar link */
  tour3dUrl?: string;
  tour3dLabel?: string;
  /** Uploaded 3D / panorama stills shown on overview */
  images3d?: Project3DImage[];
  /** Which 3D image is shown as the overview hero */
  overview3dImageId?: string;
  startDate?: string;
  contractCompletionDate?: string;
  forecastCompletionDate?: string;
  actualCompletionDate?: string;
  managerId?: string;
  managerName?: string;
  status: ProjectStatus;
  forecastStatus: ForecastStatus;
  clientUserIds: string[];
  staffIds: string[];
  internalNotes?: string;
  dailyReminderHour?: number;
  staleDaysThreshold: number;
  allowStaffPublish: boolean;
  allowClientDownload: boolean;
  /** Project-level purchase settings (RMB→SGD rate, etc.) */
  purchaseSettings?: {
    rmbToSgdRate: number;
  };
  photoCount: number;
  videoCount: number;
  storageBytes: number;
  lastUpdateAt?: string;
  lastClientUpdateAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkCategory {
  id: string;
  companyId: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

/** Project stage — stored under projects/{id}/schedule (legacy path retained). */
export interface ScheduleItem {
  id: string;
  projectId: string;
  companyId?: string;
  name: string;
  normalizedName?: string;
  source?: "preset" | "custom";
  categoryId?: string;
  /** Expected start (yyyy-MM-dd) */
  plannedStartDate?: string;
  /** Expected end (yyyy-MM-dd) */
  plannedEndDate?: string;
  actualStartDate?: string;
  /** Actual completion */
  actualEndDate?: string;
  reminderDate?: string;
  status: ScheduleStatus;
  /** Timeline bar color (hex). Falls back to status color when unset. */
  barColor?: string;
  /** Client-visible when true (default true for migrated items) */
  clientVisible?: boolean;
  internalNotes?: string;
  /** Display order within the project */
  sortOrder: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Alias used in product language */
export type ProjectStage = ScheduleItem;

export interface DailyPlanWorkItem {
  workText: string;
  /** Hex color for calendar / plan display */
  color?: string;
  time?: string;
  linkedStageId?: string;
  isTemporary?: boolean;
}

/** Per-day site plan for monthly calendar (max 4 work items). */
export interface DailyPlan {
  id: string;
  projectId: string;
  companyId: string;
  /** yyyy-MM-dd in Asia/Singapore */
  date: string;
  items: DailyPlanWorkItem[];
  reminder?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyUpdate {
  id: string;
  projectId: string;
  companyId: string;
  date: string;
  workItems: string[];
  customActivities: string[];
  noWorkToday: boolean;
  note?: string;
  visibility: Visibility;
  createdBy: string;
  createdByName: string;
  photoCount: number;
  videoCount: number;
  mediaIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MediaItem {
  id: string;
  projectId: string;
  companyId: string;
  updateId?: string;
  type: MediaType;
  storagePath: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds?: number;
  workItems: string[];
  room?: string;
  caption?: string;
  visibility: MediaVisibility;
  uploadedBy: string;
  uploadedByName: string;
  date: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  projectId: string;
  companyId: string;
  type: "daily_update" | "schedule" | "completion" | "stale";
  title: string;
  message: string;
  dueDate: string;
  assigneeId?: string;
  resolved: boolean;
  createdAt: string;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  upcoming: "Upcoming",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  archived: "Archived",
};

export const FORECAST_STATUS_LABELS: Record<ForecastStatus, string> = {
  on_track: "On track",
  slight_delay: "Slight delay",
  delayed: "Delayed",
  ahead: "Ahead of schedule",
};

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  not_started: "Not started",
  ongoing: "Ongoing",
  delayed: "Delayed",
  completed: "Completed",
  on_hold: "On hold",
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  internal: "Internal only",
  client_visible: "Client visible",
  pending_approval: "Submit for approval",
};

export type PurchaseResponsibility = "STUDIO" | "OWNER";

export type PurchaseCategory =
  | "LIGHTING"
  | "KITCHEN_APPLIANCES"
  | "BATHROOM_SANITARY";

export type PurchaseStatus =
  | "TO_CONFIRM"
  | "TO_PURCHASE"
  | "PURCHASED"
  | "CANCELLED";

export interface PurchasePhoto {
  id: string;
  url: string;
  storagePath: string;
  fileName: string;
  sizeBytes: number;
}

export interface LightingSpecifications {
  watt?: string;
  fittingColour?: string;
  colourTemperature?: string;
  cutOutSize?: string;
}

export interface PurchaseItem {
  id: string;
  projectId: string;
  companyId: string;
  category: PurchaseCategory;
  itemName: string;
  description: string;
  locations: string[];
  /** Only used when category === LIGHTING */
  lightingSpecifications?: LightingSpecifications;
  coverImageUrl?: string;
  photos: PurchasePhoto[];
  /** @deprecated kept for legacy reads — use photos */
  photoUrls?: string[];
  purchaseResponsibility: PurchaseResponsibility;
  quantity: number;
  unitPriceRMB: number;
  totalRMB: number;
  totalSGD: number;
  purchaseStatus: PurchaseStatus;
  action?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export const PURCHASE_CATEGORY_LABELS: Record<PurchaseCategory, string> = {
  LIGHTING: "Lighting",
  KITCHEN_APPLIANCES: "Kitchen Appliances",
  BATHROOM_SANITARY: "Bathroom Sanitary",
};

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  TO_CONFIRM: "To Confirm",
  TO_PURCHASE: "To Purchase",
  PURCHASED: "Purchased",
  CANCELLED: "Cancelled",
};

export const PURCHASE_RESPONSIBILITY_LABELS: Record<
  PurchaseResponsibility,
  string
> = {
  STUDIO: "Studio",
  OWNER: "Owner",
};

export const DEFAULT_PURCHASE_LOCATIONS = [
  "Whole House",
  "Living Room",
  "Dining Room",
  "Dry Kitchen",
  "Wet Kitchen",
  "Master Bedroom",
  "Junior Master Bedroom",
  "Master Bathroom",
  "Common Bathroom",
  "Powder Room",
  "WC Toilet",
  "Bath 2",
  "Bath 3",
  "Bath 4",
  "Bath 5",
  "Bath 6",
  "Room 2",
  "Room 3",
  "Room 4",
  "Room 5",
  "Room 6",
  "Staircase",
  "Yard",
  "Balcony",
  "Car Porch",
  "Courtyard",
  "Outdoor",
  "Others",
] as const;

export const DEFAULT_RMB_TO_SGD_RATE = 0.19;

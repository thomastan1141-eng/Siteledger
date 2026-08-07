export type UserRole = "admin" | "staff" | "client";

export type WorkspacePlan = "FREE" | "TRIAL" | "STARTER" | "PRO";

export type SubscriptionStatus =
  | "NONE"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED";

/** Workspace member roles. Product “Organization” uses the same set plus MANAGER/VIEWER. */
export type WorkspaceMemberRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "STAFF"
  | "VIEWER";

export type WorkspaceMemberStatus =
  | "ACTIVE"
  | "INVITED"
  | "DISABLED"
  | "MIGRATED"
  | "ARCHIVED";

/** Organization type — stored on workspace docs when company features are enabled. */
export type OrganizationType = "PERSONAL" | "COMPANY";

export type ProjectStatus =
  | "upcoming"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "archived"
  | "trashed"
  | "purging";

export type InviteType = "CLIENT" | "COLLEAGUE";

export type ColleaguePreset =
  | "VIEW_ONLY"
  | "UPDATE_PROGRESS"
  | "EDITOR"
  | "CUSTOM";

export type InvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "REVOKED";

export type ProjectMemberType =
  | "OWNER"
  | "CLIENT"
  | "COLLEAGUE"
  | "COMPANY_MEMBER";

export type ProjectMemberLifecycle =
  | "ACTIVE"
  | "SUSPENDED"
  | "REMOVED";

export type ColleaguePermissions = {
  viewProject: boolean;
  viewSchedule: boolean;
  updateSchedule: boolean;
  viewJournal: boolean;
  addJournal: boolean;
  editOwnJournal: boolean;
  editAllJournal: boolean;
  deleteOwnJournal: boolean;
  deleteAllJournal: boolean;
  viewMedia: boolean;
  downloadMedia: boolean;
  uploadMedia: boolean;
  editOwnMedia: boolean;
  editAllMedia: boolean;
  deleteOwnMedia: boolean;
  deleteAllMedia: boolean;
  publishMediaToClient: boolean;
  viewPurchases: boolean;
  editPurchases: boolean;
  editProjectDetails: boolean;
  manageProjectAccess: boolean;
};

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

/** SaaS account profile at users/{uid}. Also mirrored under companies/{workspaceId}/users for staff/client ops. */
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  /** Legacy tenant path key — equals workspaceId for studio accounts. */
  companyId: string;
  /** Preferred workspace for studio owners / staff. */
  defaultWorkspaceId?: string;
  studioName?: string | null;
  onboardingComplete?: boolean;
  emailVerified?: boolean;
  /** Temporary access accounts must change password after first login. */
  mustChangePassword?: boolean;
  projectIds: string[];
  /** Workspaces where this user has shared project access (discovery index). */
  sharedWorkspaceIds?: string[];
  createdAt: string;
  updatedAt?: string;
  active: boolean;
}

export type ProjectAccessRole = "CLIENT" | "STAFF" | "COLLEAGUE";
export type ProjectAccessStatus =
  | "ACTIVE"
  | "REVOKED"
  | "SUSPENDED"
  | "REMOVED";

export interface ProjectMember {
  uid: string;
  workspaceId: string;
  projectId: string;
  displayName: string | null;
  email: string;
  /** Legacy role field — prefer memberType. */
  role: ProjectAccessRole;
  memberType?: ProjectMemberType;
  permissionPreset?:
    | "OWNER"
    | "CLIENT"
    | ColleaguePreset;
  permissions?: ColleaguePermissions | null;
  status: ProjectAccessStatus;
  mustChangePassword?: boolean;
  invitedBy?: string;
  invitedAt?: string;
  acceptedAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInvitation {
  id: string;
  projectId: string;
  workspaceId: string;
  inviteType: InviteType;
  email: string;
  normalizedEmail: string;
  displayName: string | null;
  colleaguePreset: ColleaguePreset | null;
  permissions: ColleaguePermissions | null;
  status: InvitationStatus;
  tokenHash: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  /** Present only in API responses for the inviter — never stored. */
  inviteUrl?: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerUid: string;
  /** Personal studio vs company organization. Defaults to PERSONAL when omitted. */
  type?: OrganizationType;
  /** ACTIVE normal; MIGRATED/ARCHIVED after personal→company transfer. */
  status?: "ACTIVE" | "MIGRATED" | "ARCHIVED";
  plan: WorkspacePlan;
  subscriptionStatus: SubscriptionStatus;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  uid: string;
  email: string;
  displayName: string | null;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
  createdAt: string;
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
  /** Multi-tenant workspace scope — required on new projects. */
  workspaceId?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  /** @deprecated legacy title — use address / getProjectDisplayTitle */
  name?: string | null;
  /** @deprecated legacy code — no longer collected or shown */
  code?: string | null;
  clientName?: string | null;
  /** Primary project title / identifier */
  address?: string | null;
  coverPhotoUrl?: string | null;
  /** External 3D tour / Matterport / Kuula / similar link */
  tour3dUrl?: string | null;
  tour3dLabel?: string | null;
  /** Uploaded 3D / panorama stills shown on overview */
  images3d?: Project3DImage[];
  /** Which 3D image is shown as the overview hero */
  overview3dImageId?: string;
  startDate?: string | null;
  contractCompletionDate?: string | null;
  forecastCompletionDate?: string | null;
  actualCompletionDate?: string | null;
  /** Free-text manager name */
  manager?: string | null;
  /** @deprecated prefer manager */
  managerId?: string | null;
  /** @deprecated prefer manager — kept for older records */
  managerName?: string | null;
  status: ProjectStatus;
  forecastStatus: ForecastStatus;
  clientUserIds: string[];
  staffIds: string[];
  internalNotes?: string | null;
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
  /** Soft-delete fields */
  deletedAt?: string | null;
  purgeAt?: string | null;
  deletedBy?: string | null;
  /** Status before trash, restored on undelete */
  statusBeforeTrash?: ProjectStatus | null;
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
  /** Client-visible when true or unset; explicitly false hides from Client. */
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
  /** Client-visible when true or unset; explicitly false hides from Client.
   * Same backward-compatible model as Schedule. */
  clientVisible?: boolean;
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

export type MediaProvider = "FIREBASE_STORAGE" | "BUNNY_STREAM";

export type BunnyVideoStatus =
  | "INITIALIZING"
  | "UPLOADING"
  | "PROCESSING"
  | "PLAYABLE"
  | "READY"
  | "FAILED"
  | "DELETING"
  | "DELETED"
  | "CANCELLED";

export interface MediaItem {
  id: string;
  projectId: string;
  /** Path tenant key (equals workspaceId for studio accounts). */
  companyId: string;
  /** Authoritative tenant field for new media records. */
  workspaceId?: string;
  updateId?: string;
  type: MediaType;
  provider?: MediaProvider;
  storagePath: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  thumbnailBlurhash?: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds?: number;
  width?: number | null;
  height?: number | null;
  storageSizeBytes?: number | null;
  availableResolutions?: string | null;
  workItems: string[];
  room?: string;
  caption?: string;
  title?: string | null;
  description?: string | null;
  /** Prefer this for Bunny videos; kept in sync with visibility for clients. Always boolean on new writes. */
  clientVisible?: boolean;
  visibility: MediaVisibility;
  uploadedBy: string;
  uploadedByName: string;
  /** User-selected media date/time (ISO). Authoritative for grouping. */
  capturedAt?: string;
  /** Legacy day key (yyyy-MM-dd); derived from capturedAt for older UI. */
  date: string;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string | null;
  readyAt?: string | null;
  deletedAt?: string | null;
  /**
   * Query-safe lifecycle flag. Set "active" on every new media doc; flipped to
   * "tombstoned" on soft-delete/cancel. Lists filter on this field directly so
   * Rules never need to grant read access to tombstoned docs.
   */
  mediaLifecycle?: "active" | "tombstoned";
  /** Bunny Stream fields — server-controlled. */
  bunnyLibraryId?: number | string;
  bunnyVideoId?: string;
  status?: BunnyVideoStatus;
  encodeProgress?: number | null;
  originalFileName?: string;
  mimeType?: string;
  sourceSizeBytes?: number;
  clientUploadId?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
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
  trashed: "Recently deleted",
  purging: "Deleting permanently",
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

/**
 * Currency the item's price was originally entered in. Existing records
 * predate this field and must be treated as "RMB" (see mapPurchase in
 * src/lib/services/purchases.ts).
 */
export type PurchaseCurrency = "RMB" | "SGD";

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
  /** Currency the price was entered in. Original entered price is preserved
   * in unitPriceRMB (currency "RMB") or unitPriceSGD (currency "SGD") —
   * SGD items are never permanently converted to RMB. */
  currency: PurchaseCurrency;
  quantity: number;
  unitPriceRMB: number;
  unitPriceSGD: number;
  /** 0 for SGD-currency items — display as "—", not $0. */
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

export const PURCHASE_CURRENCY_LABELS: Record<PurchaseCurrency, string> = {
  RMB: "RMB (¥)",
  SGD: "SGD (S$)",
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

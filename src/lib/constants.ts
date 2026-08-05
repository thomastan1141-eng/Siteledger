/** Firestore tenant id — do not rename without data migration. */
export const COMPANY_ID = "siteledger";

/** Platform brand shown in global chrome (not a project name). */
export const PLATFORM_NAME = "SiteLedger";
export const PLATFORM_KICKER = "PROJECT OPERATIONS";

/** @deprecated use PLATFORM_NAME — kept for older imports */
export const COMPANY_NAME = PLATFORM_NAME;

/** Preset options only — never auto-applied to a project. Order matters. */
export const COMMON_STAGE_OPTIONS = [
  "Protection work",
  "Plumbing work",
  "Electrical work",
  "Air con work",
  "Waterproofing work",
  "Tiling work",
  "False ceiling & partition",
  "Aluminium work",
  "Glass work",
  "Painting work",
  "Erect scaffolding",
  "Door work",
  "Parquet re-varnish",
  "Marble re-varnish",
  "Carpentry fabrication",
  "Carpentry installation",
  "Air con installation",
  "Light fitting install",
  "Table installation",
  "Sanitary installation",
  "Awning work",
  "Outdoor waterproofing",
  "Metal work",
  "Joint inspection",
  "General cleaning",
  "Target handover",
] as const;

/** @deprecated use COMMON_STAGE_OPTIONS — kept for category seed compatibility */
export const DEFAULT_WORK_CATEGORIES = COMMON_STAGE_OPTIONS;

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
];

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];

export const ACCEPTED_MEDIA_ACCEPT =
  ".jpg,.jpeg,.png,.heic,.heif,.mp4,.mov,image/jpeg,image/png,image/heic,video/mp4,video/quicktime";

export const MAX_VIDEO_DURATION_HINT_SECONDS = 180;

export const SINGAPORE_TZ = "Asia/Singapore";

/** Shared palette for daily-plan text + timeline bars */
export const WORK_ITEM_COLORS = [
  { id: "charcoal", label: "Charcoal", value: "#191c19" },
  { id: "clay", label: "Clay", value: "#c96f45" },
  { id: "moss", label: "Moss", value: "#52705d" },
  { id: "amber", label: "Amber", value: "#aa793c" },
  { id: "brick", label: "Brick", value: "#a6544c" },
  { id: "slate", label: "Slate", value: "#4a5d73" },
  { id: "plum", label: "Plum", value: "#7a5a6e" },
  { id: "teal", label: "Teal", value: "#3d7a75" },
  { id: "navy", label: "Navy", value: "#3a4f6e" },
] as const;

export const DEFAULT_WORK_ITEM_COLOR = WORK_ITEM_COLORS[0].value;
export const STAGE_BAR_COLORS = WORK_ITEM_COLORS;

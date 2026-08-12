/**
 * Storage object paths removed when a Firebase photo media record is deleted.
 * Shared by the delete API and unit tests (no server-only import).
 */
export function storagePathsToDelete(data: {
  storagePath?: unknown;
  thumbnailPath?: unknown;
}): string[] {
  const paths: string[] = [];
  const storagePath =
    typeof data.storagePath === "string" ? data.storagePath.trim() : "";
  const thumbnailPath =
    typeof data.thumbnailPath === "string" ? data.thumbnailPath.trim() : "";
  if (storagePath) paths.push(storagePath);
  if (thumbnailPath && thumbnailPath !== storagePath) paths.push(thumbnailPath);
  return paths;
}

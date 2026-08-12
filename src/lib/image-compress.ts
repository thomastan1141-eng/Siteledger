/** Compress large images in-browser before upload (JPEG/PNG/WebP). */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
const COMPRESS_THRESHOLD = 900 * 1024;

/** Grid/card thumbnails — longest edge ~480px, JPEG ~78%. */
export const THUMB_MAX_EDGE = 480;
export const THUMB_JPEG_QUALITY = 0.78;

async function resizeImageToJpeg(
  file: Blob,
  maxEdge: number,
  quality: number,
): Promise<Blob | null> {
  if (!file.type.startsWith("image/")) return null;
  if (file.type.includes("heic") || file.type.includes("heif")) return null;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
}

export async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type.includes("heic") || file.type.includes("heif")) return file;
  if (file.size < COMPRESS_THRESHOLD) return file;

  const blob = await resizeImageToJpeg(file, MAX_EDGE, JPEG_QUALITY);
  if (!blob || blob.size >= file.size) return file;

  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

/**
 * Builds a small JPEG thumbnail for grid/card display.
 * Returns null when the source cannot be decoded (caller should skip thumb).
 */
export async function createImageThumbnail(file: Blob): Promise<File | null> {
  const blob = await resizeImageToJpeg(
    file,
    THUMB_MAX_EDGE,
    THUMB_JPEG_QUALITY,
  );
  if (!blob) return null;
  return new File([blob], "thumb.jpg", { type: "image/jpeg" });
}

// Twenty photos (5 days × 4 sides) must fit in one Microsoft 365 email,
// which caps a message with attachments at about 4 MB.
export const MAX_PHOTO_BYTES = 120_000;

const PASSES = [
  { maxEdge: 1280, quality: 0.6 },
  { maxEdge: 1100, quality: 0.5 },
  { maxEdge: 960, quality: 0.45 },
  { maxEdge: 800, quality: 0.4 },
  { maxEdge: 640, quality: 0.35 },
];

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fit(w: number, h: number, maxEdge: number) {
  const edge = Math.max(w, h);
  if (edge <= maxEdge) return { width: w, height: h };
  const s = maxEdge / edge;
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not compress image."))),
      "image/jpeg",
      quality,
    );
  });
}

/** Re-encode on-device until the photo is under MAX_PHOTO_BYTES. */
export async function compressPhoto(file: File): Promise<{ blob: Blob; sizeBytes: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    let blob: Blob | null = null;
    for (const pass of PASSES) {
      const size = fit(bitmap.width, bitmap.height, pass.maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not compress image.");
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      blob = await toJpeg(canvas, pass.quality);
      if (blob.size <= MAX_PHOTO_BYTES) break;
    }
    if (!blob || blob.size > MAX_PHOTO_BYTES) {
      throw new Error(
        `Photo is still over ${formatBytes(MAX_PHOTO_BYTES)} after compression. Use a smaller image.`,
      );
    }
    return { blob, sizeBytes: blob.size };
  } finally {
    bitmap.close();
  }
}

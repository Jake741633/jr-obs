export const MAX_SOURCE_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_SAVED_PHOTO_BYTES = 1_500_000;
const photoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export function photoFileError(file: Pick<File, "name" | "type" | "size">) {
  if (!file.name.trim() || !Number.isFinite(file.size) || file.size <= 0) return "Choose a photo that is not empty.";
  if (!photoTypes.has(file.type)) return "Choose a JPEG, PNG, WebP or HEIC photo.";
  if (file.size > MAX_SOURCE_PHOTO_BYTES) return "Choose a photo under 25 MB.";
  return null;
}

/** Creates a smaller evidence copy; the original file stays on the user's phone. */
export async function prepareJobPhoto(file: File): Promise<{ dataUrl: string; fileName: string; mimeType: string }> {
  const error = photoFileError(file); if (error) throw new Error(error);
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("This phone could not open the photo. Choose a JPEG or PNG copy.")); image.src = sourceUrl; });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("The photo has no readable image dimensions.");
    const canvas = document.createElement("canvas"), scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("Photo preparation is unavailable in this browser.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let result: Blob | null = null;
    for (const quality of [0.86, 0.72, 0.58]) {
      result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (result && result.size > 0 && result.size <= MAX_SAVED_PHOTO_BYTES) break;
    }
    if (!result || result.size <= 0 || result.size > MAX_SAVED_PHOTO_BYTES) throw new Error("The photo could not be made small enough. Crop it or choose a smaller photo.");
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? "")); reader.onerror = () => reject(new Error("The prepared photo could not be read.")); reader.readAsDataURL(result); });
    if (!dataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("The prepared photo format could not be verified.");
    return { dataUrl, fileName: `${file.name.replace(/\.[^.]+$/, "") || "site-photo"}-optimised.jpg`, mimeType: "image/jpeg" };
  } finally { URL.revokeObjectURL(sourceUrl); }
}

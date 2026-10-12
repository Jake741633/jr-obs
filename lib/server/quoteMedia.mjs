import { Buffer } from "node:buffer";

function inlineBytes(value, prefix, maximum) {
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;
  const raw = value.slice(prefix.length);
  if (!raw || raw.length > Math.ceil(maximum / 3) * 4 || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const bytes = Buffer.from(raw, "base64");
  return bytes.length <= maximum && bytes.toString("base64") === raw ? bytes : null;
}
export function validQuoteJpeg(value, maximum = 1_500_000) {
  const bytes = inlineBytes(value, "data:image/jpeg;base64,", maximum);
  return Boolean(bytes && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217);
}
export function validateQuoteAudio(value) {
  for (const [mimeType, extension] of [["audio/mp4", "mp4"], ["audio/webm", "webm"]]) {
    const bytes = inlineBytes(value, "data:" + mimeType + ";base64,", 1_500_000);
    if (!bytes || bytes.length < 12) continue;
    const valid = extension === "mp4"
      ? bytes.toString("ascii", 4, 8) === "ftyp" && bytes.readUInt32BE(0) >= 12 && bytes.readUInt32BE(0) <= bytes.length
      : bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163;
    if (valid) return { bytes, mimeType, extension };
  }
  return null;
}
export function validateQuoteFrames(frames) {
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > 3) return false;
  let previous = -1;
  return frames.every(frame => {
    if (!frame || typeof frame !== "object" || Array.isArray(frame) || Object.keys(frame).length !== 2
      || !validQuoteJpeg(frame.dataUrl, 250_000) || typeof frame.seconds !== "number" || !Number.isFinite(frame.seconds)
      || frame.seconds < 0 || frame.seconds > 60 || frame.seconds <= previous) return false;
    previous = frame.seconds;
    return true;
  });
}

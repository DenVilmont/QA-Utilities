// Small text formatting helpers shared by several pages.

// 7 -> "0:07", 75 -> "1:15", 3725 -> "1:02:05"
export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secondsPart = String(seconds % 60).padStart(2, '0');

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${secondsPart}`
    : `${minutes}:${secondsPart}`;
}

// 7.43 -> "0:07.4" (tenths of a second, for choosing a part of a video).
export function formatPreciseTime(totalSeconds) {
  const tenths = Math.max(0, Math.round(totalSeconds * 10));
  const minutes = Math.floor(tenths / 600);
  const seconds = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  return `${minutes}:${seconds}`;
}

// Local date and time for file names: "2026-11-26_12-38-05".
export function formatFileTimestamp(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// 3456789 -> "3.3 MB"
export function formatFileSize(bytes) {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

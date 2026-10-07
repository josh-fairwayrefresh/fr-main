export function courseDemandWindowSeconds(milliseconds) {
  if (!Number.isInteger(milliseconds) || milliseconds <= 0) return '';
  return String(milliseconds / 1000);
}

export function courseDemandWindowMilliseconds(secondsValue) {
  const seconds = Number(secondsValue);
  const milliseconds = seconds * 1000;
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isSafeInteger(milliseconds)) {
    return null;
  }
  return milliseconds;
}
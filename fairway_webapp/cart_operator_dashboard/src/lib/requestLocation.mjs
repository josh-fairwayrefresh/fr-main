export function requestLocationLabel(request) {
  const label = request?.location_label ?? request?.device_label;
  if (typeof label === 'string' && label.trim().length > 0) return label;

  const hole = request?.hole;
  if (Number.isInteger(hole) && hole >= 1 && hole <= 18) return `Hole ${hole}`;

  return 'Location unknown';
}

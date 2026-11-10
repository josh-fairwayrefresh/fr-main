export function otaDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : typeof value.toDate === 'function' ? value.toDate()
    : new Date(typeof value.seconds === 'number' || typeof value._seconds === 'number'
      ? (value.seconds ?? value._seconds) * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatWindow(value, zone) {
  const date = otaDate(value);
  if (!date) return 'Unknown';
  return `${date.toISOString()}${zone ? ` / ${new Intl.DateTimeFormat('en-US', {
    timeZone: zone, dateStyle: 'medium', timeStyle: 'long',
  }).format(date)} (${zone})` : ''}`;
}

export function groupSelection(ids, selected) {
  const count = ids.filter((id) => selected.has(id)).length;
  return { all: ids.length > 0 && count === ids.length, partial: count > 0 && count < ids.length };
}

export function toggleDevices(selected, ids, enabled) {
  const next = new Set(selected);
  for (const id of ids) { if (enabled) next.add(id); else next.delete(id); }
  return next;
}

export function buildDeviceTree(fleet) {
  const leaf = (device) => ({ id: device.device_id, label: device.device_id, device });
  const group = (id, label, children) => ({
    id, label, children,
    ids: children.flatMap((child) => child.device ? child.device.eligible ? [child.id] : [] : child.ids),
  });
  const deployed = fleet.devices.filter((device) => device.state === 'deployed');
  const known = new Set();
  const customers = fleet.customers.map((customer) => group(customer.customer_id, customer.customer_name || customer.customer_id,
    customer.courses.map((course) => group(`${customer.customer_id}/${course.course_id}`, course.course_name || course.course_id,
      deployed.filter((device) => device.customer_id === customer.customer_id && device.course_id === course.course_id)
        .map((device) => { known.add(device.device_id); return leaf(device); })))));
  const unresolved = fleet.devices.filter((device) => !['deployed', 'in_inventory', 'maintenance'].includes(device.state)
    || device.state === 'deployed' && !known.has(device.device_id));
  return [
    group('customers', 'Customers', customers),
    group('inventory', 'Inventory', fleet.devices.filter((device) => device.state === 'in_inventory').map(leaf)),
    group('maintenance', 'Maintenance', fleet.devices.filter((device) => device.state === 'maintenance').map(leaf)),
    ...(unresolved.length ? [group('unresolved', 'Classification requires attention', unresolved.map(leaf))] : []),
  ];
}

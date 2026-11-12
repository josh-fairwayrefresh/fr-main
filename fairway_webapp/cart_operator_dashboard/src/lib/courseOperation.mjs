import operations from '../../../../fairway_backend/cloudrun_receiver/lib/course_operations.json' with { type: 'json' };

const OPERATION_LABELS = Object.freeze({
  cart: 'Cart service',
  driving_range: 'Driving Range',
});

export function courseOperation(course) {
  const kind = course?.operation_kind ?? 'cart';
  if (!Object.hasOwn(operations, kind)) throw new Error('Invalid Course operation kind');
  return { kind, ...operations[kind] };
}

export const COURSE_OPERATION_KINDS = Object.freeze(Object.keys(operations));

export function courseOperationLabel(kind) {
  return OPERATION_LABELS[kind] ?? kind;
}

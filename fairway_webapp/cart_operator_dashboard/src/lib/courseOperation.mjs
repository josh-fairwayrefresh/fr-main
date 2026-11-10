import operations from '../../../../fairway_backend/cloudrun_receiver/lib/course_operations.json' with { type: 'json' };

export function courseOperation(course) {
  const kind = course?.operation_kind ?? 'cart';
  if (!Object.hasOwn(operations, kind)) throw new Error('Invalid Course operation kind');
  return { kind, ...operations[kind] };
}

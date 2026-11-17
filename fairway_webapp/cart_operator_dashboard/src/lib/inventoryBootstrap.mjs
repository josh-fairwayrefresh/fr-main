export function normalizeInventoryBootstrap(result) {
  if (!Array.isArray(result?.courses)) {
    throw new Error('The cart inventory access directory could not be verified.');
  }
  const keys = new Set();
  for (const course of result.courses) {
    if (!course || typeof course.customer_id !== 'string' || !course.customer_id ||
        typeof course.course_id !== 'string' || !course.course_id ||
        (course.asset_id !== undefined &&
          (typeof course.asset_id !== 'string' || !course.asset_id || course.asset_id !== course.course_id)) ||
        (course.customer_name !== null && typeof course.customer_name !== 'string') ||
        (course.course_name !== null && typeof course.course_name !== 'string') ||
        (course.timezone !== null && typeof course.timezone !== 'string')) {
      throw new Error('The cart inventory access directory could not be verified.');
    }
    const key = `${course.customer_id}/${course.course_id}`;
    if (keys.has(key)) throw new Error('The cart inventory access directory could not be verified.');
    keys.add(key);
  }
  return result.courses;
}

export function courseKey(course) {
  return `${course.customer_id}/${course.course_id}`;
}

export function selectedCourseFromLocation(courses, search = '') {
  const params = new URLSearchParams(search);
  const customerId = params.get('customer_id');
  const courseId = params.get('course_id');
  if (customerId && courseId) {
    const requested = courses.find((course) => (
      course.customer_id === customerId && course.course_id === courseId
    ));
    if (requested) return requested;
  }
  return courses[0] || null;
}

export function courseContextUrl(pathname, course) {
  if (!course) return pathname;
  const params = new URLSearchParams({
    customer_id: course.customer_id,
    course_id: course.course_id,
  });
  return `${pathname}?${params.toString()}`;
}

export function replaceCourseContext(pathname, course) {
  const url = courseContextUrl(pathname, course);
  window.history.replaceState(null, '', url);
  return url;
}

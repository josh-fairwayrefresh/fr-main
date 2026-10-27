export function courseKey(course) {
  return `${course.customer_id}/${course.course_id}`;
}

export function selectedCourseFromLocation(courses, search = '') {
  const params = new URLSearchParams(search);
  const customerId = params.get('customer_id');
  const courseId = params.get('course_id') || params.get('course');
  if (customerId && courseId) {
    const requested = courses.find((course) => (
      course.customer_id === customerId && course.course_id === courseId
    ));
    if (requested) return requested;
  }
  if (customerId) {
    const customerCourse = courses.find((course) => course.customer_id === customerId);
    if (customerCourse) return customerCourse;
  }
  if (!customerId && courseId) {
    const matches = courses.filter((course) => course.course_id === courseId);
    if (matches.length === 1) return matches[0];
  }
  return courses[0] || null;
}

function usableDisplayName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name && !['undefined', 'null'].includes(name.toLowerCase()) ? name : null;
}

export function authorizedCustomers(courses) {
  return [...new Map(courses.map((course) => [course.customer_id, {
    customer_id: course.customer_id,
    customer_name: usableDisplayName(course.customer_name) || 'Customer name unavailable',
  }])).values()];
}

export function mergeDashboardCourse(authorizedCourse, dashboardCourses) {
  if (!authorizedCourse) return null;

  const dashboardCourse = Array.isArray(dashboardCourses)
    ? dashboardCourses.find((course) => (
      course?.customer_id === authorizedCourse.customer_id &&
      course?.course_id === authorizedCourse.course_id
    ))
    : null;
  if (!dashboardCourse) return authorizedCourse;

  return {
    ...dashboardCourse,
    customer_id: authorizedCourse.customer_id,
    course_id: authorizedCourse.course_id,
    customer_name: usableDisplayName(authorizedCourse.customer_name)
      || usableDisplayName(dashboardCourse.customer_name),
    course_name: usableDisplayName(dashboardCourse.course_name)
      || usableDisplayName(authorizedCourse.course_name),
  };
}

export function courseDisplayLabel(course) {
  if (!course) return 'No authorized Course';
  return `${usableDisplayName(course.customer_name) || 'Customer name unavailable'} · ${usableDisplayName(course.course_name) || 'Course name unavailable'}`;
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

export function createCourseRequestState() {
  return {
    requestsByCourse: new globalThis.Map(),
    loadedCourses: new globalThis.Set(),
  };
}

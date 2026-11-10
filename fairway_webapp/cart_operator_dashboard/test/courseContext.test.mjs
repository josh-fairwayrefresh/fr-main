import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizedCustomers,
  courseContextUrl,
  courseDisplayLabel,
  courseDisplayNames,
  courseKey,
  mergeDashboardCourse,
  selectedCourseFromLocation,
} from '../src/lib/courseContext.mjs';

const courses = [
  {
    customer_id: 'CUST-0001',
    customer_name: 'Monarch Bay GC',
    course_id: 'COURSE-0001',
    course_name: 'Tony Lema Course',
  },
  {
    customer_id: 'CUST-0003',
    customer_name: 'Sandbox Links Golf',
    course_id: 'COURSE-0002',
    course_name: 'Monarch Bay',
  },
];

test('banner identity uses the same normalized names as the shared Course label', () => {
  assert.deepEqual(courseDisplayNames(courses[0]), { customer: 'Monarch Bay GC', course: 'Tony Lema Course' });
  assert.deepEqual(courseDisplayNames({ customer_name: ' null ', course_name: 'undefined' }),
    { customer: 'Customer name unavailable', course: 'Course name unavailable' });
  assert.deepEqual(courseDisplayNames({ customer_name: ' Club \u00b7 East ', course_name: ' South ' }),
    { customer: 'Club \u00b7 East', course: 'South' });
  assert.equal(courseDisplayLabel(null), 'No authorized Course');
});

test('course selection requires an authorized customer/course pair from URL context', () => {
  assert.equal(
    courseKey(selectedCourseFromLocation(courses, '?customer_id=CUST-0003&course_id=COURSE-0002')),
    'CUST-0003/COURSE-0002'
  );
  assert.equal(
    courseKey(selectedCourseFromLocation(courses, '?customer_id=CUST-0001&course_id=COURSE-0002')),
    'CUST-0001/COURSE-0001'
  );
  assert.equal(selectedCourseFromLocation([], '?customer_id=CUST-0003&course_id=COURSE-0002'), null);
});

test('Cart and Inventory links preserve the selected course context', () => {
  assert.equal(
    courseContextUrl('/inventory', courses[1]),
    '/inventory?customer_id=CUST-0003&course_id=COURSE-0002'
  );
  assert.equal(courseContextUrl('/', null), '/');
});

test('Customer hierarchy is derived only from authorized Courses without a directory', () => {
  assert.deepEqual(authorizedCustomers([...courses, { ...courses[0], course_id: 'COURSE-0003' }]), [
    { customer_id: 'CUST-0001', customer_name: 'Monarch Bay GC' },
    { customer_id: 'CUST-0003', customer_name: 'Sandbox Links Golf' },
  ]);
  assert.deepEqual(authorizedCustomers([]), []);
  assert.deepEqual(authorizedCustomers([{ customer_id: 'CUST-0004' }]), [
    { customer_id: 'CUST-0004', customer_name: 'Customer name unavailable' },
  ]);
});

test('valid Customer URL context chooses its own Course when Course is missing or unauthorized', () => {
  assert.equal(selectedCourseFromLocation(courses, '?customer_id=CUST-0003'), courses[1]);
  assert.equal(selectedCourseFromLocation(courses, '?customer_id=CUST-0003&course_id=COURSE-0001'), courses[1]);
  assert.equal(selectedCourseFromLocation(courses, '?course=COURSE-0002'), courses[1]);
  assert.equal(selectedCourseFromLocation([courses[0]], '?customer_id=CUST-0003&course_id=COURSE-0002'), courses[0]);
});

test('bootstrap course identity is displayed before dashboard data is available', () => {
  const course = mergeDashboardCourse(courses[0], null);
  assert.equal(course, courses[0]);
  assert.equal(courseDisplayLabel(course), 'Monarch Bay GC · Tony Lema Course');
});

test('dashboard refresh updates course data without replacing bootstrap customer identity', () => {
  const dashboardCourses = [{
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
    course_name: 'Tony Lema Course',
    service_state: { active: true },
  }];
  const course = mergeDashboardCourse(courses[0], dashboardCourses);

  assert.equal(courseDisplayLabel(course), 'Monarch Bay GC · Tony Lema Course');
  assert.deepEqual(course.service_state, { active: true });
  assert.equal(course.customer_id, courses[0].customer_id);
  assert.equal(course.course_id, courses[0].course_id);
});

test('dashboard course data must match the authorized customer/course pair', () => {
  const course = mergeDashboardCourse(courses[1], [{
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0002',
    course_name: 'Wrong Customer Course',
  }]);

  assert.equal(course, courses[1]);
  assert.equal(courseKey(course), 'CUST-0003/COURSE-0002');
});

test('missing optional display names use clear labels, never null or undefined', () => {
  const label = courseDisplayLabel({
    customer_name: null,
    course_name: undefined,
  });

  assert.equal(label, 'Customer name unavailable · Course name unavailable');
  assert.doesNotMatch(label, /\b(?:null|undefined)\b/i);
  assert.equal(courseDisplayLabel(null), 'No authorized Course');
});

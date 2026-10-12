import assert from 'node:assert/strict';
import test from 'node:test';
import {
  courseContextUrl,
  courseKey,
  selectedCourseFromLocation,
} from '../src/lib/courseContext.mjs';

const courses = [
  { customer_id: 'CUST-0001', course_id: 'COURSE-0001', course_name: 'Tony Lema Course' },
  { customer_id: 'CUST-0003', course_id: 'COURSE-0002', course_name: 'Monarch Bay' },
];

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

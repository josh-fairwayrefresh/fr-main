'use strict';

const operations = require('./course_operations.json');

function courseOperation(course) {
  const kind = course.operation_kind ?? 'cart';
  if (!Object.hasOwn(operations, kind)) throw new Error('Invalid Course operation kind');
  return { kind, ...operations[kind] };
}

module.exports = { courseOperation };

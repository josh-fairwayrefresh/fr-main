'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const { runInNewContext } = require('node:vm');
const definitions = require('../lib/service_categories.json');

test('changing only the category owner display name preserves identities and service behavior', () => {
  const renamed = structuredClone(definitions);
  renamed.ON_PREMISE.display_name = 'Practice Area Review';
  const source = readFileSync(require.resolve('../lib/course_service'), 'utf8');
  function load(categories) {
    const module = { exports: {} };
    runInNewContext(source, {
      module,
      require(id) {
        assert.equal(id, './service_categories.json');
        return categories;
      },
    });
    return module.exports;
  }
  const original = load(definitions);
  const updated = load(renamed);
  assert.deepEqual(Object.values(updated.SERVICE_GROUPS), ['on_course', 'on_premise']);
  assert.equal(updated.resolveServiceGroup(), 'on_course');
  assert.throws(() => updated.resolveServiceGroup('Practice Area Review'), /Invalid service group/);
  assert.throws(() => updated.resolveServiceGroup('Driving Range'), /Invalid service group/);
  for (const active of [false, true]) {
    for (const rangeActive of [false, true]) {
      const course = {
        service_suspension: active ? null : { reason: 'TEST' },
        on_premise_service: { active: rangeActive },
      };
      const before = JSON.stringify(course);
      for (const id of Object.values(original.SERVICE_GROUPS)) {
        assert.equal(
          JSON.stringify(updated.resolveCourseServiceState(course, id)),
          JSON.stringify(original.resolveCourseServiceState(course, id)),
        );
      }
      assert.equal(JSON.stringify(course), before);
    }
  }
  assert.equal(updated.resolveCourseServiceState({}, 'on_course').active, true);
  assert.equal(updated.resolveCourseServiceState({}, 'on_premise').active, false);
});

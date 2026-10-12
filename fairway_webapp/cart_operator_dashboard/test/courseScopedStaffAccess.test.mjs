import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const firestoreRules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

test('Cart request listeners query each authorized course separately and merge the results', () => {
  assert.match(mainSource, /operatorConfig\.courses;/);
  assert.match(mainSource, /where\('customer_id', '==', course\.customer_id\)/);
  assert.match(mainSource, /where\('course_id', '==', course\.course_id\)/);
  assert.match(mainSource, /requestsByCourse\.values\(\)/);
  assert.doesNotMatch(mainSource, /where\('course_id', 'in', courseIds\)/);
});

test('Firestore Rules prioritize schema-v2 Admin and exact Customer/Course authorization', () => {
  assert.match(firestoreRules, /data\.schema_version == 2/);
  assert.match(firestoreRules, /data\.admin == true/);
  assert.match(firestoreRules, /data\.customer_id == resource\.data\.customer_id/);
  assert.match(firestoreRules, /resource\.data\.course_id in .*data\.course_ids/);
  assert.match(firestoreRules, /data\.course_ids is list/);
  assert.match(firestoreRules, /data\.course_ids\.size\(\) == 0/);
  assert.match(firestoreRules, /data\.customer_id is string/);
  assert.doesNotMatch(firestoreRules, /hasLegacyAccess|data\.user_type|data\.enabled/);
});

test('Cart Admin bootstrap uses the authoritative Firestore Admin boolean', () => {
  assert.match(mainSource, /setIsAdmin\(access\.admin === true\)/);
  assert.doesNotMatch(mainSource, /access\.user_type === 'fairway_staff'/);
});

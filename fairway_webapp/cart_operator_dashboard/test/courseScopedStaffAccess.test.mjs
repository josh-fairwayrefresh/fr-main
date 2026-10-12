import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const firestoreRules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

test('Cart request listeners query each authorized course separately and merge the results', () => {
  assert.match(mainSource, /operatorConfig\.courses\.map\(\(course\) => course\.course_id\)/);
  assert.match(mainSource, /where\('course_id', '==', courseId\)/);
  assert.match(mainSource, /requestsByCourse\.values\(\)/);
  assert.doesNotMatch(mainSource, /where\('course_id', 'in', courseIds\)/);
});

test('Firestore Rules grant global request reads only to enabled Fairway staff', () => {
  assert.match(firestoreRules, /data\.user_type == 'fairway_staff'/);
  assert.match(firestoreRules, /data\.user_type == 'customer_staff'/);
  assert.match(firestoreRules, /resource\.data\.course_id in .*data\.course_ids/);
  assert.match(firestoreRules, /data\.enabled == true/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const notificationSource = await readFile(
  new URL('../src/NotificationSetup.jsx', import.meta.url),
  'utf8'
);

test('notification preference controls are independent per course and use authenticated APIs', () => {
  assert.match(notificationSource, /operatorConfig\.courses\.map/);
  assert.match(notificationSource, /\/api\/v1\/operator\/notification-preferences/);
  assert.match(notificationSource, /customer_id: course\.customer_id, course_id: course\.course_id, enabled/);
  assert.match(notificationSource, /const key = courseKey\(course\);\s+const enabled = preferences\[key\] === true/);
  assert.match(notificationSource, /checked=\{enabled\}/);
  assert.match(notificationSource, /Notification\.permission/);
  assert.match(notificationSource, /Notification\.requestPermission\(\)/);
});

test('disabling a course preference does not unsubscribe the shared browser device', () => {
  const disableFlow = notificationSource.slice(
    notificationSource.indexOf('if (!enabled)'),
    notificationSource.indexOf('if (!canEnable)')
  );
  assert.match(disableFlow, /savePreference\(course, false\)/);
  assert.doesNotMatch(disableFlow, /\.unsubscribe\(/);
});

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import OperatorApp from '../src/OperatorApp.jsx';

const course = { customer_id: 'TEST', course_id: 'TEST', course_name: 'Browser test', service_state: { active: true } };
const requests = ['oldest', 'newest'].map((id, index) => ({
  ...course, id, device_label: `Browser test ${id}`,
  received_at: new Date(Date.now() - (2 - index) * 60000).toISOString(),
}));
const actions = [];
const root = createRoot(document.getElementById('root'));
function render() {
  flushSync(() => root.render(<OperatorApp
    user={null} apiBaseUrl="" operatorConfig={{ courses: [course] }}
    requests={requests} loadState="ready" loadError="" isAdmin={false}
    onRequestAction={async (request, action) => { actions.push([request.id, action]); }}
  />));
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function click(element) {
  check(element, 'Expected control to exist');
  flushSync(() => element.click());
}
function tab(name) {
  return [...document.querySelectorAll('nav button')].find((button) => button.textContent === name);
}
try {
  render();
  click(document.querySelector('[aria-label="Select request Browser test newest"]'));
  const layout = document.querySelector('.op-layout');
  const card = layout.querySelector('article');
  check(card.id === 'request-newest', 'Non-oldest selection must render in the card');
  click(tab('History'));
  check(document.querySelector('.op-history-view')?.getClientRects().length, 'History must be rendered');
  check(layout.hidden && getComputedStyle(layout).display === 'none', 'History must hide Requests despite grid styling');
  check(layout.getClientRects().length === 0, 'Entire Requests layout must have no rendered box');
  for (const action of layout.querySelectorAll('button')) {
    check(action.getClientRects().length === 0, 'Requests controls must not be rendered in History');
    action.focus();
    check(document.activeElement !== action, 'Hidden Requests controls must not receive keyboard focus');
  }
  click(tab('Requests'));
  check(document.querySelector('.op-layout') === layout, 'Requests must stay mounted');
  check(!layout.hidden && getComputedStyle(layout).display === 'grid', 'Requests must become visible again');
  check(layout.querySelector('article') === card && card.id === 'request-newest', 'Tab return must preserve selection');
  check(!document.querySelector('.op-history-view'), 'History must be removed on return');
  click(layout.querySelector('.op-complete'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(JSON.stringify(actions) === JSON.stringify([['newest', 'complete']]), 'Complete must target the selected non-oldest request exactly once');
  check(!document.querySelector('[aria-label="On-premise service"]'), 'Legacy course must retain single controls');
  course.has_on_premise_devices = true;
  course.on_premise_service_state = { active: false, suspended: true };
  render();
  check(document.querySelector('[aria-label="On-course service"]')?.textContent.includes('Service ON'), 'On-course state must remain independent');
  check(document.querySelector('[aria-label="On-premise service"]')?.textContent.includes('Service OFF'), 'First On-premise state must display OFF');
  check(document.querySelector('[aria-label="Resume On-premise service"]'), 'On-premise must have separately labeled Resume');
  course.has_on_premise_devices = false;
  render();
  check(!document.querySelector('[aria-label="On-premise service"]'), 'No assigned On-premise devices must restore single controls');
  document.getElementById('result').textContent = 'PASS';
} catch (error) {
  document.getElementById('result').textContent = `FAIL: ${error.stack}`;
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import OperatorApp from '../src/OperatorApp.jsx';
import { DeviceDetail } from '../src/admin/AdminApp.jsx';
import { serviceCategories, serviceCategory } from '../src/lib/serviceCategories.mjs';

const categoryName = new URLSearchParams(location.search).get('category');
const courseCategory = serviceCategory('on_course').display_name;
const groupSelector = `[aria-label="${categoryName} service"]`;
const course = { customer_id: 'TEST', course_id: 'TEST', course_name: 'Browser test', service_state: { active: true } };
let requests = ['oldest', 'newest'].map((id, index) => ({
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
  check(serviceCategory('on_premise').display_name === categoryName, 'Test must change the single category owner, not a UI override');
  check(!document.querySelector(groupSelector), 'Legacy course must retain single controls');
  course.has_on_premise_devices = true;
  course.on_premise_service_state = { active: false, suspended: true };
  render();
  check(document.querySelector(`[aria-label="${courseCategory} service"]`)?.textContent.includes('Service ON'), 'On-course state must remain independent');
  check(document.querySelector(groupSelector)?.textContent.includes('Service OFF'), 'First additional-category state must display OFF');
  check(document.querySelector(`[aria-label="Resume ${categoryName} service"]`), 'Additional category must have separately labeled Resume');
  const groups = [...document.querySelectorAll('.op-service-group')];
  check(groups[0].querySelector('button').textContent === 'Suspend', 'Visible On-course action must not repeat the category');
  check(groups[1].querySelector('button').textContent === 'Resume', 'Visible Driving Range action must not repeat the category');
  check(groups[0].getBoundingClientRect().right <= groups[1].getBoundingClientRect().left, 'Category control sets must be adjacent, not interleaved');
  check(groups[1].getBoundingClientRect().right <= document.querySelector('.op-service-groups').getBoundingClientRect().right, 'Control sets must fit their wrapper without overlapping neighboring navigation');
  for (const group of groups) {
    const heading = group.querySelector('h2').getBoundingClientRect();
    const button = group.querySelector('button').getBoundingClientRect();
    check(heading.bottom <= button.top && Math.abs((heading.left + heading.width / 2) - (button.left + button.width / 2)) < 1, 'Each action must align beneath its category headline');
  }
  const originalConfirm = window.confirm;
  const prompts = [];
  window.confirm = (message) => { prompts.push(message); return false; };
  try {
    click(groups[0].querySelector('button'));
    click(groups[1].querySelector('button'));
    check(prompts[0].includes(`${courseCategory} service OFF`), 'On-course confirmation must use the category owner');
    check(prompts[1].includes(`${categoryName} service ON`), 'Resume confirmation must use the category owner');
    course.on_premise_service_state = { active: true, suspended: false };
    render();
    const suspend = document.querySelector(`[aria-label="Suspend ${categoryName} service"]`);
    check(suspend?.textContent === 'Suspend', 'Suspend accessible name must follow the owner without repeating it visibly');
    click(suspend);
    check(prompts[2].includes(`${categoryName} service OFF`), 'Suspend confirmation must use the category owner');
  } finally {
    window.confirm = originalConfirm;
  }
  check(!document.querySelector('.operator-app').textContent.includes('On-premise'), 'Replaced category must not remain visible');
  requests = [];
  course.service_state = { active: false, suspended: true };
  course.on_premise_service_state = { active: true, suspended: false };
  render();
  check(document.querySelector('.op-empty p').textContent.includes('New requests will appear here'), 'Driving Range-only service must show an accepting empty queue');
  course.on_premise_service_state = { active: false, suspended: true };
  render();
  check(document.querySelector('.op-empty p').textContent.includes('when service resumes'), 'Both groups OFF must show the suspended empty queue');
  course.on_premise_service_state = { active: true, suspended: false };
  course.has_on_premise_devices = false;
  render();
  check(!document.querySelector(groupSelector), 'No assigned additional-category devices must restore single controls');
  check(document.querySelector('.op-empty p').textContent.includes('when service resumes'), 'Unassigned Driving Range state must not change single-control empty queue');
  const adminHost = document.createElement('div');
  document.body.append(adminHost);
  const adminRoot = createRoot(adminHost);
  const device = {
    device_id: 'TEST-SYNTHETIC', state: 'deployed', customer_id: 'TEST',
    course_id: 'TEST', service_group: 'on_premise',
    location: { type: 'custom', name: 'Independent marker label' },
  };
  flushSync(() => adminRoot.render(<DeviceDetail user={null} apiBaseUrl=""
    device={device} customers={[{ customer_id: 'TEST', courses: [course] }]}
    close={() => {}} refresh={async () => {}} />));
  const select = [...adminHost.querySelectorAll('label')].find((label) => label.textContent.startsWith('Service group')).querySelector('select');
  check(JSON.stringify([...select.options].map(({ value, textContent }) => [value, textContent])) === JSON.stringify(serviceCategories.map(({ id, display_name }) => [id, display_name])), 'Admin options must consume the same category owner');
  check(select.value === 'on_premise' && select.selectedOptions[0].textContent === categoryName, 'Renaming must preserve the stored assignment identity');
  check(adminHost.querySelector('input[value="Independent marker label"]'), 'Category names must not replace marker locations');
  flushSync(() => adminRoot.unmount());
  adminHost.remove();
  document.getElementById('result').textContent = 'PASS';
} catch (error) {
  document.getElementById('result').textContent = `FAIL: ${error.stack}`;
}

'use strict';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isValidServiceSchedule(schedule) {
  return Boolean(
    schedule &&
    typeof schedule === 'object' &&
    !Array.isArray(schedule) &&
    Object.keys(schedule).length === 3 &&
    Array.isArray(schedule.days) &&
    schedule.days.length > 0 &&
    new Set(schedule.days).size === schedule.days.length &&
    schedule.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
    typeof schedule.start === 'string' && TIME_PATTERN.test(schedule.start) &&
    typeof schedule.end === 'string' && TIME_PATTERN.test(schedule.end) &&
    schedule.start < schedule.end
  );
}

function localParts(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: weekdays[values.weekday], time: `${values.hour}:${values.minute}` };
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  return null;
}

function scheduledAt(course, instant) {
  if (!isValidServiceSchedule(course?.service_schedule) || typeof course.timezone !== 'string') {
    return false;
  }
  const local = localParts(instant, course.timezone);
  const schedule = course.service_schedule;
  return schedule.days.includes(local.day) && local.time >= schedule.start && local.time < schedule.end;
}

function resolveCourseServiceState(course, instant) {
  const until = toDate(course?.service_suspension?.until);
  const suspended = Boolean(until && until.getTime() > instant.getTime());
  const scheduled = scheduledAt(course, instant);
  return { active: scheduled && !suspended };
}

module.exports = { isValidServiceSchedule, resolveCourseServiceState };

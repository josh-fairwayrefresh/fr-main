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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: weekdays[values.weekday],
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
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

function activeSuspension(course, instant) {
  const until = toDate(course?.service_suspension?.until);
  return Boolean(until && until.getTime() > instant.getTime());
}

function resolveCourseServiceState(course, instant) {
  const scheduled = scheduledAt(course, instant);
  const suspended = activeSuspension(course, instant);
  return {
    active: scheduled && !suspended,
    scheduled,
    suspended,
    suspension_until: suspended ? toDate(course.service_suspension.until) : null,
  };
}

function nextScheduledStart(course, instant) {
  if (!isValidServiceSchedule(course?.service_schedule) || typeof course.timezone !== 'string') {
    return null;
  }
  const start = new Date(instant);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);
  const maxMinutes = 8 * 24 * 60;
  for (let offset = 0; offset < maxMinutes; offset += 1) {
    const candidate = new Date(start.getTime() + offset * 60000);
    const local = localParts(candidate, course.timezone);
    if (course.service_schedule.days.includes(local.day) && local.time === course.service_schedule.start) {
      return candidate;
    }
  }
  return null;
}

function scheduledMinutesBetween(course, start, end) {
  if (!(start instanceof Date) || !(end instanceof Date) || end <= start) return 0;
  let minutes = 0;
  const cursor = new Date(start);
  cursor.setUTCSeconds(0, 0);
  while (cursor < end) {
    if (scheduledAt(course, cursor)) minutes += 1;
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return minutes;
}

function scheduledOverlapMinutes(course, start, end, rangeStart, rangeEnd) {
  const overlapStart = new Date(Math.max(start.getTime(), rangeStart.getTime()));
  const overlapEnd = new Date(Math.min(end.getTime(), rangeEnd.getTime()));
  return scheduledMinutesBetween(course, overlapStart, overlapEnd);
}

function activeServiceMinutes(course, events, start, end) {
  const scheduled = scheduledMinutesBetween(course, start, end);
  let suspended = 0;
  let suspension = null;
  for (const event of [...events].sort((a, b) => toDate(a.recorded_at) - toDate(b.recorded_at))) {
    const recordedAt = toDate(event.recorded_at);
    if (!recordedAt) continue;
    if (suspension?.until && suspension.until <= recordedAt) {
      suspended += scheduledOverlapMinutes(course, suspension.start, suspension.until, start, end);
      suspension = null;
    }
    if (event.type === 'suspended' && !suspension) {
      suspension = { start: recordedAt, until: toDate(event.until) };
    }
    if (event.type === 'resumed' && suspension) {
      const suspensionEnd = suspension.until && suspension.until < recordedAt
        ? suspension.until
        : recordedAt;
      suspended += scheduledOverlapMinutes(course, suspension.start, suspensionEnd, start, end);
      suspension = null;
    }
  }
  if (suspension) {
    const suspensionEnd = suspension.until && suspension.until < end ? suspension.until : end;
    suspended += scheduledOverlapMinutes(course, suspension.start, suspensionEnd, start, end);
  }
  return Math.max(0, scheduled - suspended);
}

module.exports = {
  activeServiceMinutes,
  isValidServiceSchedule,
  nextScheduledStart,
  resolveCourseServiceState,
  scheduledMinutesBetween,
};
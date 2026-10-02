'use strict';

const { DEVICES_COLLECTION } = require('./devices');
const { getCourseForCustomer, DEFAULT_HEALTH_REPORT_SCHEDULE } = require('./courses');

const HEALTH_HISTORY_SUBCOLLECTION = 'health_history';

/*
 * Device Health observation contract (WP4). Derived directly from the
 * current firmware `health_cellular_snapshot` fields (see
 * docs/FIRMWARE_SPECIFICATION.md, "Device Health Diagnostics"). Firmware
 * gates every measurement except `attempts` behind its own `*_valid` flag,
 * so every field below except `attempts` is nullable rather than required:
 * a null value means the corresponding measurement was unavailable at
 * acquisition time, not that it was omitted from the contract. Only these
 * exact keys are accepted; unknown keys (including a client-supplied
 * `received_at`) are rejected rather than silently ignored, since
 * `received_at` is always backend-owned.
 */
const REQUIRED_INTEGER_FIELDS = Object.freeze(['attempts']);

const NULLABLE_INTEGER_FIELDS = Object.freeze([
  'registration_state',
  'http_status',
  'modem_temperature_m_c',
  'rsrp_dbm',
  'rsrq_db',
  'snr_db',
  'serving_cell_id',
  'serving_band',
  'psm_tau_s',
  'psm_active_time_s',
  'battery_voltage_u_v',
  'battery_soc_pct',
]);

const NULLABLE_BOOLEAN_FIELDS = Object.freeze(['https_succeeded']);

const SYSTEM_IDENTITY_FIELDS = Object.freeze([
  'hardware_revision',
  'firmware_generation',
]);

const COMMAND_POLL_INTEGER_FIELDS = Object.freeze([
  'command_scheduler_runs',
  'command_timer_fires',
  'command_poll_attempts',
  'command_poll_transport_failures',
  'command_poll_http_failures',
  'command_poll_empty_responses',
  'command_complete_received',
  'command_ack_attempts',
  'command_ack_failures',
  'command_ack_successes',
  'command_lte_not_registered',
  'command_lte_recoveries',
  'command_stale_results',
  'command_last_result',
  'command_stop_reason',
  'command_state',
]);

const COMMAND_POLL_FIELDS = Object.freeze([
  ...COMMAND_POLL_INTEGER_FIELDS,
  'command_registration_state',
]);

const ALLOWED_HEALTH_OBSERVATION_KEYS = new Set([
  ...REQUIRED_INTEGER_FIELDS,
  ...NULLABLE_INTEGER_FIELDS,
  ...NULLABLE_BOOLEAN_FIELDS,
  ...SYSTEM_IDENTITY_FIELDS,
  ...COMMAND_POLL_FIELDS,
]);

function isNullableInteger(value) {
  return value === null || Number.isInteger(value);
}

function isNullableBoolean(value) {
  return value === null || typeof value === 'boolean';
}

function isValidIdentityString(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
}

/*
 * Validates a health_report observation payload. Rejects malformed input
 * rather than coercing it; does not invent sentinel values for fields the
 * device could not measure (those are represented as explicit null).
 */
function isValidHealthObservation(observation) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    return false;
  }

  for (const key of Object.keys(observation)) {
    if (!ALLOWED_HEALTH_OBSERVATION_KEYS.has(key)) {
      return false;
    }
  }

  for (const field of REQUIRED_INTEGER_FIELDS) {
    if (!Number.isInteger(observation[field]) || observation[field] < 0) {
      return false;
    }
  }

  for (const field of NULLABLE_INTEGER_FIELDS) {
    if (!(field in observation) || !isNullableInteger(observation[field])) {
      return false;
    }
  }

  for (const field of NULLABLE_BOOLEAN_FIELDS) {
    if (!(field in observation) || !isNullableBoolean(observation[field])) {
      return false;
    }
  }


  const identityFieldCount = SYSTEM_IDENTITY_FIELDS
    .filter((field) => field in observation).length;
  if (identityFieldCount !== 0 && identityFieldCount !== SYSTEM_IDENTITY_FIELDS.length) {
    return false;
  }
  if (identityFieldCount > 0 &&
      SYSTEM_IDENTITY_FIELDS.some((field) => !isValidIdentityString(observation[field]))) {
    return false;
  }

  const commandPollFieldCount = COMMAND_POLL_FIELDS
    .filter((field) => field in observation).length;
  if (commandPollFieldCount !== 0 && commandPollFieldCount !== COMMAND_POLL_FIELDS.length) {
    return false;
  }
  if (commandPollFieldCount > 0) {
    if (COMMAND_POLL_INTEGER_FIELDS.some((field) =>
      !Number.isInteger(observation[field]) || observation[field] < 0)) {
      return false;
    }
    if (!isNullableInteger(observation.command_registration_state) ||
        observation.command_last_result > 9 ||
        observation.command_stop_reason > 4 ||
        observation.command_state > 9 ||
        observation.command_ack_successes > observation.command_ack_attempts ||
        observation.command_ack_failures > observation.command_ack_attempts) {
      return false;
    }
  }

  if (observation.http_status !== null &&
      (observation.http_status < 100 || observation.http_status > 599)) {
    return false;
  }

  if (observation.battery_soc_pct !== null &&
      (observation.battery_soc_pct < 0 || observation.battery_soc_pct > 100)) {
    return false;
  }

  if (observation.psm_tau_s !== null && observation.psm_tau_s < 0) {
    return false;
  }

  if (observation.psm_active_time_s !== null && observation.psm_active_time_s < 0) {
    return false;
  }

  if (observation.battery_voltage_u_v !== null && observation.battery_voltage_u_v < 0) {
    return false;
  }

  return true;
}

/*
 * Persists a validated health observation. `receivedAt` is supplied by the
 * caller (index.js), which owns the `@google-cloud/firestore` dependency and
 * its `FieldValue.serverTimestamp()` sentinel; this module never derives
 * `received_at` from the observation itself, and the same `receivedAt` value
 * is used for both writes below so latest_health and the appended history
 * document always agree on receive time. Both writes happen in one Firestore
 * batch so they cannot diverge from a partial failure. Only `latest_health`
 * and `updated_at` are always touched on the Device document. A new firmware
 * may also report the complete hardware/firmware identity pair; when present,
 * those authenticated values atomically become the registry's current
 * system/device truth. Legacy observations without either identity field
 * remain accepted during rollout and do not change existing identity truth.
 */
async function recordHealthObservation(db, deviceId, observation, receivedAt) {
  if (!isValidHealthObservation(observation)) {
    throw new Error('Invalid health observation');
  }

  const deviceRef = db.collection(DEVICES_COLLECTION).doc(deviceId);
  const historyRef = deviceRef.collection(HEALTH_HISTORY_SUBCOLLECTION).doc();
  const accepted = { ...observation, received_at: receivedAt };
  const deviceUpdate = { latest_health: accepted, updated_at: receivedAt };

  if (SYSTEM_IDENTITY_FIELDS.every((field) => field in observation)) {
    deviceUpdate.hardware_revision = observation.hardware_revision;
    deviceUpdate.firmware_generation = observation.firmware_generation;
    deviceUpdate.system_identity = {
      hardware_revision: observation.hardware_revision,
      firmware_generation: observation.firmware_generation,
      source: 'device_health',
      observed_at: receivedAt,
    };
  }

  const batch = db.batch();
  batch.set(deviceRef, deviceUpdate, { merge: true });
  batch.set(historyRef, accepted);
  await batch.commit();

  return { history_id: historyRef.id };
}

function getTimeZoneOffsetMinutes(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = {};
  for (const { type, value } of formatter.formatToParts(instant)) {
    parts[type] = value;
  }

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return (asUtc - instant.getTime()) / 60000;
}

/*
 * Converts a Course-local wall-clock time (year/month/day/hour/minute) in an
 * IANA timeZone to the corresponding UTC instant, using the runtime's own
 * Intl/ICU timezone database (no third-party dependency). Iterates once to
 * refine the offset guess, which correctly resolves ordinary DST
 * transitions for schedule times that do not fall inside a transition's
 * skipped/repeated hour.
 */
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(guessUtcMs), timeZone);
  let candidateMs = guessUtcMs - offsetMinutes * 60000;

  const refinedOffsetMinutes = getTimeZoneOffsetMinutes(new Date(candidateMs), timeZone);
  if (refinedOffsetMinutes !== offsetMinutes) {
    candidateMs = guessUtcMs - refinedOffsetMinutes * 60000;
  }

  return new Date(candidateMs);
}

function getLocalDateParts(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = {};
  for (const { type, value } of formatter.formatToParts(instant)) {
    parts[type] = value;
  }

  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function addCalendarDays({ year, month, day }, deltaDays) {
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() };
}

/*
 * Extracts the Course-local wall-clock hour (0-23) for `instant` in
 * `timeZone`, using the same Intl/ICU timezone database as the rest of this
 * module's date/time primitives.
 */
function getLocalHour(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
  });

  return Number(formatter.format(instant));
}

/*
 * Resolves the Course-local calendar date ("YYYY-MM-DD") and wall-clock hour
 * (0-23) for `instant` in the Course's IANA `timeZone`. Used to denormalize
 * durable Course-local event-time facts onto a golfer request at creation
 * time, so daily/hourly analytics never require repeated per-document
 * timezone math later.
 */
function resolveCourseLocalDateHour(instant, timeZone) {
  const { year, month, day } = getLocalDateParts(instant, timeZone);
  const pad = (n) => String(n).padStart(2, '0');

  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    hour: getLocalHour(instant, timeZone),
  };
}

const SCHEDULE_SEARCH_WINDOW_DAYS = 2;

/*
 * Computes the next scheduled Course-local health-report instant, in UTC,
 * strictly after `now`. `times` is the Course's `health_report_schedule.times`
 * array of "HH:MM" Course-local strings (for example ["09:00", "17:00"]).
 * Boundary semantics are deterministic: a candidate exactly equal to `now`
 * is treated as already reached and is not returned as "next"; the search
 * advances to the following scheduled time (or the following day) instead.
 */
function computeNextHealthReportAt(now, timeZone, times) {
  if (!Array.isArray(times) || times.length === 0) {
    throw new Error('At least one scheduled report time is required');
  }

  const sortedTimes = [...times].sort();
  const todayParts = getLocalDateParts(now, timeZone);

  for (let dayOffset = 0; dayOffset <= SCHEDULE_SEARCH_WINDOW_DAYS; dayOffset += 1) {
    const dateParts = dayOffset === 0 ? todayParts : addCalendarDays(todayParts, dayOffset);

    for (const time of sortedTimes) {
      const [hourStr, minuteStr] = time.split(':');
      const candidate = zonedTimeToUtc(
        dateParts.year,
        dateParts.month,
        dateParts.day,
        Number(hourStr),
        Number(minuteStr),
        timeZone
      );

      if (candidate.getTime() > now.getTime()) {
        return candidate;
      }
    }
  }

  throw new Error('Unable to compute next health report instant within search window');
}

/*
 * Resolves a Device's effective Device Health configuration from the
 * authoritative Customer -> Course hierarchy (reusing the existing WP2/WP3
 * `getCourseForCustomer` hierarchy check rather than bypassing it). Returns
 * null if the Device is unassigned or its assignment is inconsistent; the
 * caller decides how to represent that (for example omitting
 * effective_config from a response) rather than this module inventing a
 * fallback schedule.
 */
async function resolveEffectiveDeviceConfig(db, deviceId, now = new Date()) {
  const deviceSnap = await db.collection(DEVICES_COLLECTION).doc(deviceId).get();
  if (!deviceSnap.exists) {
    return null;
  }

  const device = deviceSnap.data();
  if (!device.customer_id || !device.course_id) {
    return null;
  }

  const course = await getCourseForCustomer(db, device.customer_id, device.course_id);
  if (!course) {
    return null;
  }

  const schedule = course.health_report_schedule || DEFAULT_HEALTH_REPORT_SCHEDULE;
  const nextHealthReportAt = computeNextHealthReportAt(now, course.timezone, schedule.times);

  return {
    timezone: course.timezone,
    health_report_schedule: schedule,
    next_health_report_at: nextHealthReportAt.toISOString(),
  };
}

/*
 * Classifies a Device's Customer/Course assignment for request-time
 * fail-closed enforcement, given an already-fetched `device` object (avoids
 * a second Firestore read of the same Device doc the caller already has).
 *
 * Distinguishes two cases that `resolveEffectiveDeviceConfig` intentionally
 * does not: a Device with no Customer/Course assignment at all is
 * legitimately unassigned (`valid: true`, `effectiveConfig: null`); a Device
 * that claims an assignment which cannot resolve through the authoritative
 * Customer -> Course hierarchy (missing Course, Course under the wrong
 * Customer, or a partial customer_id/course_id pair) is an invalid
 * assignment (`valid: false`) that callers must reject outright rather than
 * silently accepting with a null config.
 */
async function resolveDeviceHierarchyConfig(db, device, now = new Date()) {
  if (!device.customer_id && !device.course_id) {
    return { valid: true, effectiveConfig: null, course: null };
  }

  if (!device.customer_id || !device.course_id) {
    return { valid: false, effectiveConfig: null, course: null };
  }

  const course = await getCourseForCustomer(db, device.customer_id, device.course_id);
  if (!course) {
    return { valid: false, effectiveConfig: null, course: null };
  }

  const schedule = course.health_report_schedule || DEFAULT_HEALTH_REPORT_SCHEDULE;
  const nextHealthReportAt = computeNextHealthReportAt(now, course.timezone, schedule.times);

  return {
    valid: true,
    course,
    effectiveConfig: {
      timezone: course.timezone,
      health_report_schedule: schedule,
      next_health_report_at: nextHealthReportAt.toISOString(),
    },
  };
}

module.exports = {
  HEALTH_HISTORY_SUBCOLLECTION,
  REQUIRED_INTEGER_FIELDS,
  NULLABLE_INTEGER_FIELDS,
  NULLABLE_BOOLEAN_FIELDS,
  isValidHealthObservation,
  recordHealthObservation,
  computeNextHealthReportAt,
  resolveEffectiveDeviceConfig,
  resolveDeviceHierarchyConfig,
  resolveCourseLocalDateHour,
};

'use strict';

const { getCourseForCustomer } = require('./courses');

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

function getLocalHour(instant, timeZone) {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		hour: '2-digit',
	});

	return Number(formatter.format(instant));
}

function resolveCourseLocalDateHour(instant, timeZone) {
	const { year, month, day } = getLocalDateParts(instant, timeZone);
	const pad = (value) => String(value).padStart(2, '0');

	return {
		date: `${year}-${pad(month)}-${pad(day)}`,
		hour: getLocalHour(instant, timeZone),
	};
}

async function resolveDeviceHierarchy(db, device) {
	if (!device.customer_id && !device.course_id) {
		return { valid: true, course: null };
	}
	if (!device.customer_id || !device.course_id) {
		return { valid: false, course: null };
	}

	const course = await getCourseForCustomer(db, device.customer_id, device.course_id);

	return course ? { valid: true, course } : { valid: false, course: null };
}

module.exports = {
	resolveCourseLocalDateHour,
	resolveDeviceHierarchy,
};
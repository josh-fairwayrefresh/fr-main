'use strict';

const { getCourseForCustomer } = require('./courses');
const { courseOperation } = require('../course_operation');
const { requireService } = require('../course_service');
const storage = require('../operational_storage');

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
		return { valid: storage.mode() === 'legacy', course: null };
	}
	if (!device.customer_id || !device.course_id) {
		return { valid: false, course: null };
	}
	if (storage.mode() === 'customer' && !device.service_id) return { valid: false, course: null };

	const course = await getCourseForCustomer(db, device.customer_id, device.course_id);
	if (storage.mode() === 'legacy' && (!course || !courseOperation(course).physical_devices)) {
		return { valid: false, course: null };
	}
	const serviceId = device.service_id || device.course_id;
	const service = await requireService(db, device.customer_id, serviceId);
	const operationOwner = storage.mode() === 'customer' ? service : course;
	if (!operationOwner || !courseOperation(operationOwner).physical_devices) return { valid: false, course: null };
	return { valid: true, course: { ...course, ...service, service_id: serviceId } };
}

module.exports = {
	resolveCourseLocalDateHour,
	resolveDeviceHierarchy,
};
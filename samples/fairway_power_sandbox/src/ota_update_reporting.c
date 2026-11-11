#include "ota_update_reporting.h"

#include <errno.h>
#include <string.h>

#include <zephyr/data/json.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/util.h>

#include "device_identity.h"
#include "http_transport.h"
#include "ota_update_scheduler.h"

#define OTA_REPORT_RESPONSE_CAPACITY 4096

static char response_storage[OTA_REPORT_RESPONSE_CAPACITY];
K_MUTEX_DEFINE(report_mutex);

struct confirmation_ack {
	const char *device_id;
	const char *firmware_version;
	int32_t confirmation_sequence;
	bool acknowledged;
};

static const struct json_obj_descr confirmation_ack_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct confirmation_ack, device_id, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct confirmation_ack, firmware_version, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct confirmation_ack, confirmation_sequence, JSON_TOK_NUMBER),
	JSON_OBJ_DESCR_PRIM(struct confirmation_ack, acknowledged, JSON_TOK_TRUE),
};

int fairway_ota_report(const char *deployment_id, const char *state, int error_code)
{
	struct fairway_device_identity identity;
	struct http_transport_response response = {
		.storage = response_storage,
		.storage_capacity = sizeof(response_storage),
	};
	char body[384];
	char request[1024];
	int ret;

	if (deployment_id == NULL || state == NULL || deployment_id[0] == '\0' ||
	    strlen(deployment_id) >= FAIRWAY_OTA_DEPLOYMENT_ID_MAX ||
	    strchr(deployment_id, '/') != NULL) {
		return -EINVAL;
	}
	ret = fairway_device_identity_load(&identity);
	if (ret != 0) {
		return ret;
	}
	int body_len = snprintk(body, sizeof(body),
		"{\"device_id\":\"%s\",\"state\":\"%s\",\"error_code\":%d,"
		"\"firmware_version\":\"%s\"}",
		identity.device_id, state, error_code,
		CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION);
	if (body_len < 0 || (size_t)body_len >= sizeof(body)) {
		memset(&identity, 0, sizeof(identity));
		return -ENOMEM;
	}
	int request_len = snprintk(request, sizeof(request),
		"POST /api/v1/device-ota/deployments/%s/events HTTP/1.1\r\n"
		"Host: " FAIRWAY_HOST "\r\n"
		"Content-Type: application/json\r\n"
		"X-Fairway-Device-Key: %s\r\n"
		"Content-Length: %d\r\n"
		"Connection: close\r\n\r\n%s",
		deployment_id, identity.device_key, body_len, body);
	memset(&identity, 0, sizeof(identity));
	memset(body, 0, sizeof(body));
	if (request_len < 0 || (size_t)request_len >= sizeof(request)) {
		memset(request, 0, sizeof(request));
		return -ENOMEM;
	}
	k_mutex_lock(&report_mutex, K_FOREVER);
	ret = http_transport_send(request, request_len, k_uptime_get() + 60000,
				  false, &response);
	memset(request, 0, sizeof(request));
	memset(response_storage, 0, sizeof(response_storage));
	k_mutex_unlock(&report_mutex);
	return ret;
}

int fairway_ota_report_confirmation(const struct fairway_ota_confirmation *confirmation,
				    const char *deployment_id)
{
	struct fairway_device_identity identity;
	struct confirmation_ack ack = {0};
	struct http_transport_response response = {
		.storage = response_storage,
		.storage_capacity = sizeof(response_storage),
	};
	char request[1024];
	char body[256];
	char deployment_field[96] = {0};
	int ret;

	if (confirmation == NULL || confirmation->sequence == 0 ||
	    confirmation->sequence > INT32_MAX ||
	    strcmp(confirmation->version, CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION) != 0) {
		return -EINVAL;
	}
	if (deployment_id != NULL) {
		size_t length = strlen(deployment_id);

		if (length == 0 || length >= FAIRWAY_OTA_DEPLOYMENT_ID_MAX ||
		    strspn(deployment_id,
			"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-") != length) {
			return -EINVAL;
		}
		ret = snprintk(deployment_field, sizeof(deployment_field),
			",\"deployment_id\":\"%s\"", deployment_id);
		if (ret < 0 || (size_t)ret >= sizeof(deployment_field)) {
			return -ENOMEM;
		}
	}
	ret = fairway_device_identity_load(&identity);
	if (ret != 0) {
		return ret;
	}
	int body_len = snprintk(body, sizeof(body),
		"{\"device_id\":\"%s\",\"firmware_version\":\"%s\","
		"\"confirmation_sequence\":%u%s}",
		identity.device_id, confirmation->version, confirmation->sequence,
		deployment_field);
	if (body_len < 0 || (size_t)body_len >= sizeof(body)) {
		memset(&identity, 0, sizeof(identity));
		return -ENOMEM;
	}
	int request_len = snprintk(request, sizeof(request),
		"POST /api/v1/device-ota/confirmation HTTP/1.1\r\n"
		"Host: " FAIRWAY_HOST "\r\n"
		"Content-Type: application/json\r\n"
		"X-Fairway-Device-Key: %s\r\n"
		"Content-Length: %d\r\n"
		"Connection: close\r\n\r\n%s",
		identity.device_key, body_len, body);
	memset(identity.device_key, 0, sizeof(identity.device_key));
	memset(body, 0, sizeof(body));
	if (request_len < 0 || (size_t)request_len >= sizeof(request)) {
		memset(request, 0, sizeof(request));
		memset(&identity, 0, sizeof(identity));
		return -ENOMEM;
	}
	k_mutex_lock(&report_mutex, K_FOREVER);
	ret = http_transport_send(request, request_len, k_uptime_get() + 60000,
				  true, &response);
	memset(request, 0, sizeof(request));
	if (ret == 0) {
		ret = json_obj_parse(response.body, response.body_len,
			confirmation_ack_descr, ARRAY_SIZE(confirmation_ack_descr), &ack);
		if (ret != (int)BIT_MASK(ARRAY_SIZE(confirmation_ack_descr)) ||
		    !ack.acknowledged ||
		    ack.confirmation_sequence != (int32_t)confirmation->sequence ||
		    ack.device_id == NULL || strcmp(ack.device_id, identity.device_id) != 0 ||
		    ack.firmware_version == NULL ||
		    strcmp(ack.firmware_version, confirmation->version) != 0) {
			ret = -EPROTO;
		} else {
			ret = 0;
		}
	}
	memset(response_storage, 0, sizeof(response_storage));
	k_mutex_unlock(&report_mutex);
	memset(&identity, 0, sizeof(identity));
	return ret;
}

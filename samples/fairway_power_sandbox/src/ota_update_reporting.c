#include "ota_update_reporting.h"

#include <errno.h>
#include <string.h>

#include <zephyr/data/json.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/util.h>

#include "device_identity.h"
#include "http_transport.h"
#include "ota_update_scheduler.h"

#define OTA_REPORT_RESPONSE_CAPACITY 4096

static char response_storage[OTA_REPORT_RESPONSE_CAPACITY];

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
	if (body_len < 0 || body_len >= sizeof(body)) {
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
	if (request_len < 0 || request_len >= sizeof(request)) {
		memset(request, 0, sizeof(request));
		return -ENOMEM;
	}
	ret = http_transport_send(request, request_len, k_uptime_get() + 60000,
				  false, &response);
	memset(request, 0, sizeof(request));
	memset(response_storage, 0, sizeof(response_storage));
	return ret;
}

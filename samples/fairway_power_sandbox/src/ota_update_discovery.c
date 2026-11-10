#include "ota_update_discovery.h"

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <zephyr/data/json.h>
#include <zephyr/kernel.h>
#include <pm_config.h>
#include <zephyr/sys/util.h>

#include "device_identity.h"
#include "http_transport.h"

#define OTA_HTTP_RESPONSE_CAPACITY 4096
#define OTA_HTTP_REQUEST_CAPACITY 1024

struct ota_version_json {
	uint32_t major;
	uint32_t minor;
	uint32_t revision;
	uint32_t build;
};

struct ota_check_json {
	bool update_available;
	const char *deployment_id;
	const char *release_id;
	const char *artifact_path;
	const char *hardware_id;
	const char *sha256;
	uint32_t image_size;
	int64_t next_check_at_utc_ms;
	struct ota_version_json version;
};

struct ota_schedule_json {
	int64_t next_check_at_utc_ms;
};

static const struct json_obj_descr ota_version_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct ota_version_json, major, JSON_TOK_NUMBER),
	JSON_OBJ_DESCR_PRIM(struct ota_version_json, minor, JSON_TOK_NUMBER),
	JSON_OBJ_DESCR_PRIM(struct ota_version_json, revision, JSON_TOK_NUMBER),
	JSON_OBJ_DESCR_PRIM(struct ota_version_json, build, JSON_TOK_NUMBER),
};

static const struct json_obj_descr ota_check_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct ota_check_json, update_available, JSON_TOK_TRUE),
	JSON_OBJ_DESCR_PRIM(struct ota_check_json, deployment_id, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct ota_check_json, release_id, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct ota_check_json, artifact_path, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct ota_check_json, hardware_id, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct ota_check_json, sha256, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct ota_check_json, image_size, JSON_TOK_NUMBER),
	JSON_OBJ_DESCR_PRIM(struct ota_check_json, next_check_at_utc_ms, JSON_TOK_NUMBER),
	JSON_OBJ_DESCR_OBJECT(struct ota_check_json, version, ota_version_descr),
};

static const struct json_obj_descr ota_schedule_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct ota_schedule_json, next_check_at_utc_ms,
			    JSON_TOK_NUMBER),
};

static char response_storage[OTA_HTTP_RESPONSE_CAPACITY];

static int ota_api_post(const char *path, const char *body, size_t body_len,
			struct http_transport_response *response)
{
	char request[OTA_HTTP_REQUEST_CAPACITY];
	struct fairway_device_identity identity;
	int ret = fairway_device_identity_load(&identity);

	if (ret != 0) {
		return ret;
	}

	int request_len = snprintk(request, sizeof(request),
		"POST %s HTTP/1.1\r\n"
		"Host: " FAIRWAY_HOST "\r\n"
		"Content-Type: application/json\r\n"
		"X-Fairway-Device-Key: %s\r\n"
		"Content-Length: %u\r\n"
		"Connection: close\r\n\r\n"
		"%s",
		path, identity.device_key, (unsigned int)body_len, body);
	memset(&identity, 0, sizeof(identity));
	if (request_len < 0 || request_len >= sizeof(request)) {
		memset(request, 0, sizeof(request));
		return -ENOMEM;
	}

	response->storage = response_storage;
	response->storage_capacity = sizeof(response_storage);
	ret = http_transport_send(request, request_len, k_uptime_get() + 60000,
				  false, response);
	memset(request, 0, sizeof(request));
	if (ret != 0) {
		memset(response_storage, 0, sizeof(response_storage));
	}
	return ret;
}

static int parse_sha256(const char *hex, uint8_t digest[FAIRWAY_OTA_SHA256_SIZE])
{
	if (hex == NULL || strlen(hex) != FAIRWAY_OTA_SHA256_SIZE * 2) {
		return -EINVAL;
	}
	for (size_t i = 0; i < FAIRWAY_OTA_SHA256_SIZE; i++) {
		unsigned char high = hex[i * 2];
		unsigned char low = hex[i * 2 + 1];
		int high_value = high >= '0' && high <= '9' ? high - '0' :
			high >= 'a' && high <= 'f' ? high - 'a' + 10 :
			high >= 'A' && high <= 'F' ? high - 'A' + 10 : -1;
		int low_value = low >= '0' && low <= '9' ? low - '0' :
			low >= 'a' && low <= 'f' ? low - 'a' + 10 :
			low >= 'A' && low <= 'F' ? low - 'A' + 10 : -1;

		if (high_value < 0 || low_value < 0) {
			return -EINVAL;
		}
		digest[i] = (uint8_t)((high_value << 4) | low_value);
	}
	return 0;
}

int fairway_ota_discovery_get_next_check(int64_t *next_check_utc_ms)
{
	struct fairway_device_identity identity;
	struct ota_schedule_json schedule = {0};
	struct http_transport_response response = {0};
	char body[192];
	int body_len;
	int ret;

	if (next_check_utc_ms == NULL) {
		return -EINVAL;
	}
	ret = fairway_device_identity_load(&identity);
	if (ret != 0) {
		return ret;
	}
	body_len = snprintk(body, sizeof(body),
		"{\"device_id\":\"%s\",\"hardware_id\":\"%s\"}",
		identity.device_id, CONFIG_FAIRWAY_OTA_HARDWARE_ID);
	memset(&identity, 0, sizeof(identity));
	if (body_len < 0 || body_len >= sizeof(body)) {
		return -ENOMEM;
	}

	ret = ota_api_post("/api/v1/device-ota/schedule", body, body_len, &response);
	memset(body, 0, sizeof(body));
	if (ret != 0) {
		return ret;
	}
	ret = json_obj_parse(response.body, response.body_len, ota_schedule_descr,
			     ARRAY_SIZE(ota_schedule_descr), &schedule);
	if (ret < 0 || schedule.next_check_at_utc_ms <= 0) {
		memset(response_storage, 0, sizeof(response_storage));
		return -EPROTO;
	}
	*next_check_utc_ms = schedule.next_check_at_utc_ms;
	memset(response_storage, 0, sizeof(response_storage));
	return 0;
}

int fairway_ota_discovery_check(struct fairway_ota_release *release)
{
	struct fairway_device_identity identity;
	struct ota_check_json result = {0};
	struct http_transport_response response = {0};
	char body[224];
	int body_len;
	int ret;

	if (release == NULL) {
		return -EINVAL;
	}
	memset(release, 0, sizeof(*release));
	ret = fairway_device_identity_load(&identity);
	if (ret != 0) {
		return ret;
	}
	body_len = snprintk(body, sizeof(body),
		"{\"device_id\":\"%s\",\"hardware_id\":\"%s\","
		"\"firmware_version\":\"%s\"}",
		identity.device_id, CONFIG_FAIRWAY_OTA_HARDWARE_ID,
		CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION);
	memset(&identity, 0, sizeof(identity));
	if (body_len < 0 || body_len >= sizeof(body)) {
		return -ENOMEM;
	}

	ret = ota_api_post("/api/v1/device-ota/check", body, body_len, &response);
	memset(body, 0, sizeof(body));
	if (ret != 0) {
		return ret;
	}
	ret = json_obj_parse(response.body, response.body_len, ota_check_descr,
			     ARRAY_SIZE(ota_check_descr), &result);
	if (ret < 0 || result.next_check_at_utc_ms <= 0) {
		memset(response_storage, 0, sizeof(response_storage));
		return -EPROTO;
	}
	release->next_check_utc_ms = result.next_check_at_utc_ms;
	if (!result.update_available) {
		memset(response_storage, 0, sizeof(response_storage));
		return -ENOENT;
	}
	if (result.deployment_id == NULL || result.release_id == NULL ||
	    result.artifact_path == NULL || result.hardware_id == NULL ||
	    result.image_size == 0 || result.image_size > PM_MCUBOOT_SECONDARY_SIZE ||
	    result.image_size > FAIRWAY_OTA_MAX_IMAGE_SIZE ||
	    strlen(result.deployment_id) >= sizeof(release->deployment_id) ||
	    strlen(result.release_id) >= sizeof(release->release_id) ||
	    strlen(result.artifact_path) >= sizeof(release->artifact_path) ||
	    strcmp(result.hardware_id, CONFIG_FAIRWAY_OTA_HARDWARE_ID) != 0 ||
	    result.version.major > UINT8_MAX || result.version.minor > UINT8_MAX ||
	    result.version.revision > UINT16_MAX) {
		memset(response_storage, 0, sizeof(response_storage));
		return -EPROTO;
	}

	strcpy(release->deployment_id, result.deployment_id);
	strcpy(release->release_id, result.release_id);
	strcpy(release->artifact_path, result.artifact_path);
	release->descriptor.image_size = result.image_size;
	strncpy(release->descriptor.hardware_id, result.hardware_id,
		sizeof(release->descriptor.hardware_id) - 1);
	release->descriptor.version.major = result.version.major;
	release->descriptor.version.minor = result.version.minor;
	release->descriptor.version.revision = result.version.revision;
	release->descriptor.version.build = result.version.build;
	ret = parse_sha256(result.sha256, release->descriptor.sha256);
	if (ret != 0) {
		memset(response_storage, 0, sizeof(response_storage));
		return -EPROTO;
	}
	int version_len = snprintk(release->version_string,
		sizeof(release->version_string), "%u.%u.%u+%u",
		result.version.major, result.version.minor,
		result.version.revision, result.version.build);
	memset(response_storage, 0, sizeof(response_storage));
	if (version_len < 0 || version_len >= sizeof(release->version_string)) {
		memset(release, 0, sizeof(*release));
		return -EPROTO;
	}
	return 0;
}

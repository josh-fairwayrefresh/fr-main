#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <zephyr/data/json.h>

#include "device_identity.h"
#include "http_transport.h"
#include "ota_update_reporting.h"

static int transport_error;
static int identity_error;
static int calls;
static int parse_mask;
static bool ack_accepted;
static int32_t ack_sequence;
static const char *ack_device;
static const char *ack_version;
static char *response_bytes;
static const char *expected_deployment;

int64_t k_uptime_get(void) { return 1000; }

int fairway_device_identity_load(struct fairway_device_identity *identity)
{
	if (identity_error != 0) return identity_error;
	strcpy(identity->device_id, "FRB-0005");
	strcpy(identity->device_key, "test-only-placeholder");
	return 0;
}

int http_transport_send(const char *request, int length, int64_t deadline,
			 bool yieldable, struct http_transport_response *response)
{
	char body[256];
	char content_length[64];
	calls++;
	assert(length == (int)strlen(request));
	assert(deadline == 61000);
	assert(yieldable);
	assert(strstr(request, "POST /api/v1/device-ota/confirmation HTTP/1.1\r\n") == request);
	assert(strstr(request, "X-Fairway-Device-Key: test-only-placeholder\r\n"));
	if (expected_deployment != NULL) {
		snprintf(body, sizeof(body),
			"{\"device_id\":\"FRB-0005\",\"firmware_version\":\"%s\","
			"\"confirmation_sequence\":7,\"deployment_id\":\"%s\"}",
			CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION, expected_deployment);
	} else {
		snprintf(body, sizeof(body),
			"{\"device_id\":\"FRB-0005\",\"firmware_version\":\"%s\",\"confirmation_sequence\":7}",
			CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION);
	}
	assert(strcmp(strstr(request, "\r\n\r\n") + 4, body) == 0);
	snprintf(content_length, sizeof(content_length), "Content-Length: %zu\r\n", strlen(body));
	assert(strstr(request, content_length));
	response_bytes = response->storage;
	strcpy(response->storage, "{}");
	response->body = response->storage;
	response->body_len = 2;
	return transport_error;
}

/* The vendor decoder is a boundary fake; exercise the real request builder,
 * parsed-field checks and acknowledgment/error contract, not vendor parsing.
 */
int64_t json_obj_parse(char *payload, size_t length,
		       const struct json_obj_descr *descriptors,
		       size_t count, void *value)
{
	assert(length == 2 && strcmp(payload, "{}") == 0);
	assert(count == 4);
	for (size_t i = 0; i < count; i++) {
		void *field = (char *)value + descriptors[i].offset;
		if (strcmp(descriptors[i].field_name, "device_id") == 0) {
			*(const char **)field = ack_device;
		} else if (strcmp(descriptors[i].field_name, "firmware_version") == 0) {
			*(const char **)field = ack_version;
		} else if (strcmp(descriptors[i].field_name, "confirmation_sequence") == 0) {
			*(int32_t *)field = ack_sequence;
		} else if (strcmp(descriptors[i].field_name, "acknowledged") == 0) {
			*(bool *)field = ack_accepted;
		} else {
			assert(false);
		}
	}
	return parse_mask;
}

static void reset(void)
{
	transport_error = 0;
	identity_error = 0;
	calls = 0;
	parse_mask = 15;
	ack_accepted = true;
	ack_sequence = 7;
	ack_device = "FRB-0005";
	ack_version = CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION;
	expected_deployment = NULL;
}

int main(void)
{
	struct fairway_ota_confirmation confirmation = {
		.sequence = 7, .version = CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION,
	};
	reset();
	assert(fairway_ota_report_confirmation(&confirmation, NULL) == 0);
	assert(calls == 1 && response_bytes[0] == '\0');
	reset();
	expected_deployment = "18d1f946-f809-43b0-8a02-58925e630add";
	assert(fairway_ota_report_confirmation(&confirmation, expected_deployment) == 0);
	assert(calls == 1);
	for (int failure = 0; failure < 8; failure++) {
		reset();
		switch (failure) {
		case 0: ack_device = "FRB-0006"; break;
		case 1: ack_version = "99.0.0+1"; break;
		case 2: ack_sequence = 8; break;
		case 3: ack_accepted = false; break;
		case 4: parse_mask = 7; break;
		case 5: parse_mask = -EINVAL; break;
		case 6: ack_device = NULL; break;
		case 7: ack_version = NULL; break;
		}
		assert(fairway_ota_report_confirmation(&confirmation, NULL) == -EPROTO);
		assert(response_bytes[0] == '\0');
	}
	const int errors[] = {-ECANCELED, -ETIMEDOUT, -EACCES};
	for (size_t i = 0; i < sizeof(errors) / sizeof(errors[0]); i++) {
		reset();
		transport_error = errors[i];
		assert(fairway_ota_report_confirmation(&confirmation, NULL) == errors[i]);
		assert(response_bytes[0] == '\0');
	}
	reset();
	identity_error = -ENOENT;
	assert(fairway_ota_report_confirmation(&confirmation, NULL) == -ENOENT);
	assert(calls == 0);
	reset();
	const char *invalid_ids[] = {"", "../other", "bad\"id", "bad\nid"};
	for (size_t i = 0; i < sizeof(invalid_ids) / sizeof(invalid_ids[0]); i++) {
		assert(fairway_ota_report_confirmation(&confirmation, invalid_ids[i]) == -EINVAL);
	}
	char oversized_id[FAIRWAY_OTA_DEPLOYMENT_ID_MAX + 1];
	memset(oversized_id, 'a', sizeof(oversized_id) - 1);
	oversized_id[sizeof(oversized_id) - 1] = '\0';
	assert(fairway_ota_report_confirmation(&confirmation, oversized_id) == -EINVAL);
	assert(calls == 0);
	confirmation.sequence = 0;
	assert(fairway_ota_report_confirmation(&confirmation, NULL) == -EINVAL);
	confirmation.sequence = 0x80000000u;
	assert(fairway_ota_report_confirmation(&confirmation, NULL) == -EINVAL);
	assert(calls == 0);
	printf("PASS: running-report wire/ack boundaries for %s\n",
		CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION);
	return 0;
}

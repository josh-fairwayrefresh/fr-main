/* Real Zephyr JSON decoder + real discovery parser against production-shaped
 * offers. The decoder is intentionally not faked: a mocked decoder hid the
 * int32 overflow that made devices reject every offer before downloading.
 */
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

#include "device_identity.h"
#include "http_transport.h"
#include "ota_update_discovery.h"

static const char *response_json;
static int calls;

int64_t k_uptime_get(void) { return 1000; }

int fairway_device_identity_load(struct fairway_device_identity *identity)
{
	strcpy(identity->device_id, "FRB-0005");
	strcpy(identity->device_key, "test-only-placeholder");
	return 0;
}

int http_transport_send(const char *request, int length, int64_t deadline,
			 bool yieldable, struct http_transport_response *response)
{
	(void)length; (void)deadline; (void)yieldable;
	calls++;
	assert(strstr(request, "POST /api/v1/device-ota/") == request);
	assert(strlen(response_json) < response->storage_capacity);
	strcpy(response->storage, response_json);
	response->body = response->storage;
	response->body_len = strlen(response_json);
	return 0;
}

/* Field order and values mirror the 813-byte production offer of 2026-11-11. */
static const char offer[] =
	"{\"update_available\":true,"
	"\"deployment_id\":\"810915b0-af7c-4fe6-9267-7e4cc7e96930\","
	"\"release_id\":\"OTA-0.1alt-r3\","
	"\"hardware_id\":\"circuitdojo_feather_nrf9151@1/nrf9151/ns\","
	"\"version\":{\"major\":0,\"minor\":1,\"revision\":0,\"build\":5},"
	"\"image_size\":281659,"
	"\"sha256\":\"79e53b5643fcc78cabb152e89eeac4fc1377587dd58b71c51d41c0cb7637275d\","
	"\"artifact_path\":\"/api/v1/device-ota/artifacts/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde\","
	"\"next_check_at_utc_ms\":1794386400000}";

int main(void)
{
	struct fairway_ota_release release;
	int64_t next = 0;

	response_json = offer;
	assert(fairway_ota_discovery_check(&release) == 0);
	assert(strcmp(release.deployment_id, "810915b0-af7c-4fe6-9267-7e4cc7e96930") == 0);
	assert(strcmp(release.release_id, "OTA-0.1alt-r3") == 0);
	assert(release.descriptor.image_size == 281659);
	assert(release.descriptor.version.build == 5);
	assert(release.descriptor.sha256[0] == 0x79 && release.descriptor.sha256[31] == 0x5d);
	assert(release.next_check_utc_ms == 1794386400000LL);

	response_json = "{\"update_available\":false,\"next_check_at_utc_ms\":1794386400000}";
	assert(fairway_ota_discovery_check(&release) == -ENOENT);
	assert(release.next_check_utc_ms == 1794386400000LL);

	response_json = "{\"next_check_at_utc_ms\":1794386400000}";
	assert(fairway_ota_discovery_get_next_check(&next) == 0);
	assert(next == 1794386400000LL);

	response_json = "{\"update_available\":true,\"next_check_at_utc_ms\":1794386400000}";
	assert(fairway_ota_discovery_check(&release) == -EPROTO);
	assert(calls == 4);
	puts("PASS: real SDK decoder accepts production-shaped offers and 64-bit schedules");
	return 0;
}

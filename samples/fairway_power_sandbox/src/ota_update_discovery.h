#ifndef FAIRWAY_OTA_UPDATE_DISCOVERY_H
#define FAIRWAY_OTA_UPDATE_DISCOVERY_H

#include "ota_update_policy.h"

struct fairway_ota_release {
	char deployment_id[64];
	char release_id[64];
	char artifact_path[384];
	char version_string[32];
	struct fairway_ota_descriptor descriptor;
	int64_t next_check_utc_ms;
};

int fairway_ota_discovery_get_next_check(int64_t *next_check_utc_ms);
int fairway_ota_discovery_check(struct fairway_ota_release *release);

#endif

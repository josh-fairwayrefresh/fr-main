#include "ota_update_scheduler.h"

#include <errno.h>
#include <string.h>

#include <psa/protected_storage.h>
#include <psa/storage_common.h>
#include <zephyr/sys/util.h>

#include "ota_update_policy.h"

#define FAIRWAY_OTA_SCHEDULE_UID ((psa_storage_uid_t)0x46520003)
#define FAIRWAY_OTA_SCHEDULE_MAGIC 0x46524f54
#define FAIRWAY_OTA_SCHEDULE_VERSION 2
#define FAIRWAY_OTA_SCHEDULE_ONE_TIME FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME
#define FAIRWAY_OTA_SCHEDULE_NIGHTLY FAIRWAY_OTA_SCHEDULE_MODE_NIGHTLY

struct ota_persistent_state {
	uint32_t magic;
	uint8_t format_version;
	uint8_t schedule_mode;
	uint8_t one_time_complete;
	uint8_t activation_pending;
	uint8_t deployment_terminal_reported;
	int64_t next_check_utc_ms;
	char deployment_id[FAIRWAY_OTA_DEPLOYMENT_ID_MAX];
	char target_version[FAIRWAY_OTA_VERSION_STRING_MAX];
} __packed;

static int persistent_state_load(struct ota_persistent_state *stored)
{
	size_t length = 0;
	psa_status_t status = psa_ps_get(FAIRWAY_OTA_SCHEDULE_UID, 0,
					 sizeof(*stored), stored, &length);

	if (status == PSA_ERROR_DOES_NOT_EXIST) {
		return -ENOENT;
	}
	if (status != PSA_SUCCESS) {
		return -EIO;
	}
	if (length != sizeof(*stored) || stored->magic != FAIRWAY_OTA_SCHEDULE_MAGIC ||
	    stored->format_version != FAIRWAY_OTA_SCHEDULE_VERSION ||
	    (stored->schedule_mode != FAIRWAY_OTA_SCHEDULE_ONE_TIME &&
	     stored->schedule_mode != FAIRWAY_OTA_SCHEDULE_NIGHTLY) ||
	    memchr(stored->deployment_id, '\0', sizeof(stored->deployment_id)) == NULL ||
	    memchr(stored->target_version, '\0', sizeof(stored->target_version)) == NULL) {
		memset(stored, 0, sizeof(*stored));
		return -EBADMSG;
	}
	return 0;
}

static int persistent_state_save(const struct ota_persistent_state *stored)
{
	return psa_ps_set(FAIRWAY_OTA_SCHEDULE_UID, sizeof(*stored), stored, 0) ==
		       PSA_SUCCESS
		       ? 0
		       : -EIO;
}

int fairway_ota_scheduler_initialize(int64_t first_boot_utc_ms,
				     const char *running_version,
				     enum fairway_ota_schedule_mode desired_mode)
{
	struct ota_persistent_state stored = {0};
	int ret = persistent_state_load(&stored);

	if (running_version == NULL ||
	    (desired_mode != FAIRWAY_OTA_SCHEDULE_ONE_TIME &&
	     desired_mode != FAIRWAY_OTA_SCHEDULE_NIGHTLY)) {
		return -EINVAL;
	}
	if (ret == -ENOENT) {
		stored.magic = FAIRWAY_OTA_SCHEDULE_MAGIC;
		stored.format_version = FAIRWAY_OTA_SCHEDULE_VERSION;
		stored.schedule_mode = desired_mode;
		if (desired_mode == FAIRWAY_OTA_SCHEDULE_ONE_TIME) {
			if (first_boot_utc_ms <= 0 ||
			    first_boot_utc_ms > INT64_MAX -
				    (int64_t)CONFIG_FAIRWAY_OTA_INITIAL_CHECK_DELAY_SECONDS * 1000) {
				return -EINVAL;
			}
			stored.next_check_utc_ms =
				first_boot_utc_ms +
				(int64_t)CONFIG_FAIRWAY_OTA_INITIAL_CHECK_DELAY_SECONDS * 1000;
		}
		return persistent_state_save(&stored);
	}
	if (ret != 0) {
		return ret;
	}
	if (stored.schedule_mode == desired_mode) {
		return 0;
	}
	if (stored.schedule_mode != FAIRWAY_OTA_SCHEDULE_ONE_TIME ||
	    desired_mode != FAIRWAY_OTA_SCHEDULE_NIGHTLY) {
		if (stored.schedule_mode != FAIRWAY_OTA_SCHEDULE_NIGHTLY ||
		    desired_mode != FAIRWAY_OTA_SCHEDULE_ONE_TIME ||
		    !stored.activation_pending || !stored.one_time_complete ||
		    stored.target_version[0] == '\0' ||
		    strcmp(stored.target_version, running_version) == 0) {
			return -EPERM;
		}

		stored.schedule_mode = FAIRWAY_OTA_SCHEDULE_ONE_TIME;
		stored.next_check_utc_ms = 0;
		return persistent_state_save(&stored);
	}

	stored.schedule_mode = FAIRWAY_OTA_SCHEDULE_NIGHTLY;
	stored.one_time_complete = 1;
	stored.next_check_utc_ms = 0;
	return persistent_state_save(&stored);
}

int fairway_ota_scheduler_get(struct fairway_ota_schedule_state *state)
{
	struct ota_persistent_state stored = {0};
	int ret;

	if (state == NULL) {
		return -EINVAL;
	}
	memset(state, 0, sizeof(*state));
	ret = persistent_state_load(&stored);
	if (ret != 0) {
		return ret;
	}

	state->next_check_utc_ms = stored.next_check_utc_ms;
	state->one_time_complete = stored.one_time_complete != 0;
	state->mode = stored.schedule_mode;
	state->check_due = stored.next_check_utc_ms > 0;
	memcpy(state->deployment_id, stored.deployment_id, sizeof(state->deployment_id));
	memcpy(state->target_version, stored.target_version, sizeof(state->target_version));
	state->deployment_terminal_reported =
		stored.deployment_terminal_reported != 0;
	state->activation_pending = stored.activation_pending != 0;
	memset(&stored, 0, sizeof(stored));
	return 0;
}

int fairway_ota_scheduler_set_next_check(int64_t utc_ms)
{
	struct ota_persistent_state stored = {0};
	int ret = persistent_state_load(&stored);

	if (ret != 0) {
		return ret;
	}
	if (stored.schedule_mode != FAIRWAY_OTA_SCHEDULE_NIGHTLY || utc_ms <= 0) {
		return -EINVAL;
	}
	stored.next_check_utc_ms = utc_ms;
	ret = persistent_state_save(&stored);
	memset(&stored, 0, sizeof(stored));
	return ret;
}

int fairway_ota_scheduler_mark_check_complete(void)
{
	struct ota_persistent_state stored = {0};
	int ret = persistent_state_load(&stored);

	if (ret != 0) {
		return ret;
	}
	if (stored.schedule_mode != FAIRWAY_OTA_SCHEDULE_ONE_TIME) {
		return -EINVAL;
	}
	stored.one_time_complete = 1;
	stored.next_check_utc_ms = 0;
	ret = persistent_state_save(&stored);
	memset(&stored, 0, sizeof(stored));
	return ret;
}

int fairway_ota_scheduler_set_deployment(const char *deployment_id,
					 const char *target_version)
{
	struct ota_persistent_state stored = {0};
	size_t deployment_id_len;
	size_t target_version_len;
	int ret;

	if (deployment_id == NULL || target_version == NULL) {
		return -EINVAL;
	}
	deployment_id_len = strlen(deployment_id);
	target_version_len = strlen(target_version);
	if (deployment_id_len == 0 || deployment_id_len >= sizeof(stored.deployment_id) ||
	    target_version_len == 0 || target_version_len >= sizeof(stored.target_version)) {
		return -EINVAL;
	}

	ret = persistent_state_load(&stored);
	if (ret != 0) {
		return ret;
	}
	memcpy(stored.deployment_id, deployment_id, deployment_id_len + 1);
	memcpy(stored.target_version, target_version, target_version_len + 1);
	stored.deployment_terminal_reported = 0;
	stored.activation_pending = 0;
	ret = persistent_state_save(&stored);
	memset(&stored, 0, sizeof(stored));
	return ret;
}

int fairway_ota_scheduler_mark_activation_pending(void)
{
	struct ota_persistent_state stored = {0};
	int ret = persistent_state_load(&stored);

	if (ret != 0) {
		return ret;
	}
	if (stored.deployment_id[0] == '\0') {
		return -ENOENT;
	}
	stored.activation_pending = 1;
	ret = persistent_state_save(&stored);
	memset(&stored, 0, sizeof(stored));
	return ret;
}

int fairway_ota_scheduler_mark_deployment_terminal(void)
{
	struct ota_persistent_state stored = {0};
	int ret = persistent_state_load(&stored);

	if (ret != 0) {
		return ret;
	}
	if (stored.deployment_id[0] == '\0') {
		return -ENOENT;
	}
	stored.deployment_terminal_reported = 1;
	ret = persistent_state_save(&stored);
	memset(&stored, 0, sizeof(stored));
	return ret;
}

/* Separate from the v2 schedule object so retries never re-arm discovery,
 * and older images retain their existing schedule/rollback contract.
 */
#define FAIRWAY_OTA_CONFIRMATION_UID ((psa_storage_uid_t)0x46520004)
#define FAIRWAY_OTA_CONFIRMATION_MAGIC 0x46524301

struct ota_confirmation_record {
	uint32_t magic;
	uint32_t sequence;
	char version[FAIRWAY_OTA_VERSION_STRING_MAX];
	uint8_t acknowledged;
} __packed;

static int confirmation_load(struct ota_confirmation_record *stored)
{
	size_t length = 0;
	psa_status_t status = psa_ps_get(FAIRWAY_OTA_CONFIRMATION_UID, 0,
					 sizeof(*stored), stored, &length);

	if (status == PSA_ERROR_DOES_NOT_EXIST) {
		return -ENOENT;
	}
	if (status != PSA_SUCCESS) {
		return -EIO;
	}
	if (length != sizeof(*stored) ||
	    stored->magic != FAIRWAY_OTA_CONFIRMATION_MAGIC ||
	    stored->sequence == 0 || stored->sequence > INT32_MAX ||
	    stored->acknowledged > 1 || stored->version[0] == '\0' ||
	    memchr(stored->version, '\0', sizeof(stored->version)) == NULL) {
		return -EBADMSG;
	}
	return 0;
}

static int confirmation_save(const struct ota_confirmation_record *stored)
{
	return psa_ps_set(FAIRWAY_OTA_CONFIRMATION_UID, sizeof(*stored), stored, 0)
		== PSA_SUCCESS ? 0 : -EIO;
}

int fairway_ota_confirmation_prepare(const char *running_version,
				     struct fairway_ota_confirmation *confirmation)
{
	struct ota_confirmation_record stored = {0};
	int ret;

	if (running_version == NULL || confirmation == NULL ||
	    running_version[0] == '\0' ||
	    strlen(running_version) >= sizeof(stored.version)) {
		return -EINVAL;
	}
	ret = confirmation_load(&stored);
	if (ret != 0 && ret != -ENOENT) {
		return ret;
	}
	if (ret == -ENOENT || strcmp(stored.version, running_version) != 0) {
		if (stored.sequence == INT32_MAX) {
			return -EOVERFLOW;
		}
		stored.magic = FAIRWAY_OTA_CONFIRMATION_MAGIC;
		stored.sequence++;
		strcpy(stored.version, running_version);
		stored.acknowledged = 0;
		ret = confirmation_save(&stored);
		if (ret != 0) {
			return ret;
		}
	}
	confirmation->sequence = stored.sequence;
	strcpy(confirmation->version, stored.version);
	confirmation->acknowledged = stored.acknowledged != 0;
	return 0;
}

int fairway_ota_confirmation_acknowledge(
	const struct fairway_ota_confirmation *confirmation)
{
	struct ota_confirmation_record stored = {0};
	int ret = confirmation_load(&stored);

	if (ret != 0) {
		return ret;
	}
	if (confirmation == NULL || confirmation->sequence != stored.sequence ||
	    strcmp(confirmation->version, stored.version) != 0) {
		return -ESTALE;
	}
	stored.acknowledged = 1;
	return confirmation_save(&stored);
}

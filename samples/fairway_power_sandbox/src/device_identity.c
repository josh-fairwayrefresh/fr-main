#include "device_identity.h"

#include <errno.h>
#include <stdbool.h>
#include <string.h>

#include <psa/protected_storage.h>
#include <psa/storage_common.h>

#define FAIRWAY_DEVICE_ID_UID       ((psa_storage_uid_t)0x46520001)
#define FAIRWAY_DEVICE_KEY_UID      ((psa_storage_uid_t)0x46520002)

static bool valid_device_id(const char *device_id)
{
	if (device_id == NULL || strlen(device_id) != FAIRWAY_DEVICE_ID_MAX - 1 ||
	    memcmp(device_id, "FRB-", 4) != 0) {
		return false;
	}

	for (size_t i = 4; i < FAIRWAY_DEVICE_ID_MAX - 1; i++) {
		if (device_id[i] < '0' || device_id[i] > '9') {
			return false;
		}
	}

	return true;
}

static bool valid_device_key(const char *device_key)
{
	if (device_key == NULL || strlen(device_key) != FAIRWAY_DEVICE_KEY_MAX - 1) {
		return false;
	}

	for (size_t i = 0; i < FAIRWAY_DEVICE_KEY_MAX - 1; i++) {
		char c = device_key[i];

		if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
		      (c >= '0' && c <= '9') || c == '_' || c == '-')) {
			return false;
		}
	}

	return strchr("AEIMQUYcgkosw048", device_key[FAIRWAY_DEVICE_KEY_MAX - 2]) != NULL;
}

static int read_value(psa_storage_uid_t uid, char *value, size_t capacity)
{
	size_t length = 0;
	psa_status_t status = psa_ps_get(uid, 0, capacity, value, &length);

	if (status != PSA_SUCCESS) {
		return status == PSA_ERROR_DOES_NOT_EXIST ? -ENOENT : -EIO;
	}
	if (length == 0 || length > capacity || value[length - 1] != '\0') {
		memset(value, 0, capacity);
		return -EBADMSG;
	}

	return 0;
}

static int read_device_id(char *device_id)
{
	int ret = read_value(FAIRWAY_DEVICE_ID_UID, device_id, FAIRWAY_DEVICE_ID_MAX);

	if (ret == 0 && !valid_device_id(device_id)) {
		memset(device_id, 0, FAIRWAY_DEVICE_ID_MAX);
		return -EBADMSG;
	}

	return ret;
}

static int read_device_key(char *device_key)
{
	int ret = read_value(FAIRWAY_DEVICE_KEY_UID, device_key, FAIRWAY_DEVICE_KEY_MAX);

	if (ret == 0 && !valid_device_key(device_key)) {
		memset(device_key, 0, FAIRWAY_DEVICE_KEY_MAX);
		return -EBADMSG;
	}

	return ret;
}

int fairway_device_identity_load(struct fairway_device_identity *identity)
{
	if (identity == NULL) {
		return -EINVAL;
	}

	memset(identity, 0, sizeof(*identity));
	int ret = read_device_id(identity->device_id);

	if (ret == 0) {
		ret = read_device_key(identity->device_key);
	}
	if (ret != 0) {
		memset(identity, 0, sizeof(*identity));
	}

	return ret;
}

int fairway_device_identity_provision(const char *device_id, const char *device_key)
{
	char stored_id[FAIRWAY_DEVICE_ID_MAX] = {0};
	char stored_key[FAIRWAY_DEVICE_KEY_MAX] = {0};
	int ret;

	if (!valid_device_id(device_id) || !valid_device_key(device_key)) {
		return -EINVAL;
	}

	ret = read_device_id(stored_id);
	if (ret == -ENOENT) {
		psa_status_t status = psa_ps_set(FAIRWAY_DEVICE_ID_UID, strlen(device_id) + 1,
						 device_id, PSA_STORAGE_FLAG_WRITE_ONCE);

		if (status != PSA_SUCCESS) {
			return -EIO;
		}
	} else if (ret != 0) {
		return ret;
	} else if (strcmp(stored_id, device_id) != 0) {
		return -EEXIST;
	}

	ret = read_device_key(stored_key);
	if (ret == 0) {
		return strcmp(stored_key, device_key) == 0 ? -EALREADY : -EEXIST;
	}
	if (ret != -ENOENT) {
		return ret;
	}

	return psa_ps_set(FAIRWAY_DEVICE_KEY_UID, strlen(device_key) + 1, device_key, 0) ==
		       PSA_SUCCESS
		       ? 0
		       : -EIO;
}

int fairway_device_identity_replace_key(const char *device_id, const char *device_key)
{
	char stored_id[FAIRWAY_DEVICE_ID_MAX] = {0};

	if (!valid_device_id(device_id) || !valid_device_key(device_key)) {
		return -EINVAL;
	}

	int ret = read_device_id(stored_id);

	if (ret != 0) {
		return ret;
	}
	if (strcmp(stored_id, device_id) != 0) {
		return -EACCES;
	}

	return psa_ps_set(FAIRWAY_DEVICE_KEY_UID, strlen(device_key) + 1, device_key, 0) ==
		       PSA_SUCCESS
		       ? 0
		       : -EIO;
}

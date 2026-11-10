#ifndef FAIRWAY_DEVICE_IDENTITY_H
#define FAIRWAY_DEVICE_IDENTITY_H

#include <stddef.h>

#define FAIRWAY_DEVICE_ID_MAX 9
#define FAIRWAY_DEVICE_KEY_MAX 44

struct fairway_device_identity {
	char device_id[FAIRWAY_DEVICE_ID_MAX];
	char device_key[FAIRWAY_DEVICE_KEY_MAX];
};

int fairway_device_identity_load(struct fairway_device_identity *identity);
int fairway_device_identity_provision(const char *device_id, const char *device_key);
int fairway_device_identity_replace_key(const char *device_id, const char *device_key);

#endif

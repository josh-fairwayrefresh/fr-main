#ifndef FAIRWAY_OTA_UPDATE_STAGING_H
#define FAIRWAY_OTA_UPDATE_STAGING_H

#include <stddef.h>

struct fairway_ota_staging_ops {
	int (*init)(size_t image_size, void *context);
	int (*reset)(void *context);
	int (*offset_get)(size_t *offset, void *context);
	void *context;
};

int fairway_ota_staging_start_clean(const struct fairway_ota_staging_ops *ops,
				    size_t image_size);

#endif /* FAIRWAY_OTA_UPDATE_STAGING_H */

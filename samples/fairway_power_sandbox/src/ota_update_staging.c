#include "ota_update_staging.h"

#include <errno.h>

static int reset_after_failure(const struct fairway_ota_staging_ops *ops, int error)
{
	int reset_ret = ops->reset(ops->context);

	return reset_ret != 0 ? reset_ret : error;
}

int fairway_ota_staging_start_clean(const struct fairway_ota_staging_ops *ops,
				    size_t image_size)
{
	size_t offset = 0;
	int ret;

	if (ops == NULL || ops->init == NULL || ops->reset == NULL ||
	    ops->offset_get == NULL) {
		return -EINVAL;
	}

	ret = ops->init(image_size, ops->context);
	if (ret != 0) {
		return reset_after_failure(ops, ret);
	}

	ret = ops->reset(ops->context);
	if (ret != 0) {
		return ret;
	}

	ret = ops->init(image_size, ops->context);
	if (ret != 0) {
		return reset_after_failure(ops, ret);
	}

	ret = ops->offset_get(&offset, ops->context);
	if (ret != 0) {
		return reset_after_failure(ops, ret);
	}
	if (offset != 0) {
		return reset_after_failure(ops, -EIO);
	}

	return 0;
}

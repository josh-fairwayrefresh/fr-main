#include "health_temperature.h"

#include <modem/modem_info.h>
#include <errno.h>

int health_temperature_read(struct health_temperature_sample *sample)
{
	int temperature_c;
	int ret;

	if (sample == NULL) {
		return -EINVAL;
	}

	*sample = (struct health_temperature_sample){
		.source = HEALTH_TEMPERATURE_SOURCE_MODEM_INTERNAL,
	};

	ret = modem_info_get_temperature(&temperature_c);
	if (ret) {
		sample->error = ret;
		return ret;
	}

	sample->valid = true;
	sample->temp_mC = (int32_t)temperature_c * 1000;
	return 0;
}

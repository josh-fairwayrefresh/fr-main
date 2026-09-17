#ifndef HEALTH_TEMPERATURE_H
#define HEALTH_TEMPERATURE_H

#include <stdbool.h>
#include <stdint.h>

enum health_temperature_source {
	HEALTH_TEMPERATURE_SOURCE_MODEM_INTERNAL = 0,
};

struct health_temperature_sample {
	bool valid;
	int32_t temp_mC;
	enum health_temperature_source source;
	int error;
};

int health_temperature_read(struct health_temperature_sample *sample);

#endif

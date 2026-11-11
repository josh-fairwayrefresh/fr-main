#ifndef FAIRWAY_OTA_HOST_PSA_PROTECTED_STORAGE_H
#define FAIRWAY_OTA_HOST_PSA_PROTECTED_STORAGE_H

#include <stddef.h>
#include <stdint.h>

#include "psa/crypto.h"

typedef uint32_t psa_storage_uid_t;

#define PSA_ERROR_DOES_NOT_EXIST (-140)

psa_status_t psa_ps_get(psa_storage_uid_t uid, uint32_t data_offset,
			size_t data_size, void *p_data, size_t *p_data_length);
psa_status_t psa_ps_set(psa_storage_uid_t uid, size_t data_length,
			const void *p_data, uint32_t create_flags);

#endif

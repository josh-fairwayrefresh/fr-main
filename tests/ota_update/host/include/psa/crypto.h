#ifndef FAIRWAY_OTA_HOST_PSA_CRYPTO_H
#define FAIRWAY_OTA_HOST_PSA_CRYPTO_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef int32_t psa_status_t;

typedef struct {
	uint8_t bytes[8192];
	size_t length;
	bool active;
} psa_hash_operation_t;

#define PSA_SUCCESS 0
#define PSA_ERROR_GENERIC_ERROR (-132)
#define PSA_ALG_SHA_256 0x02000009
#define PSA_HASH_OPERATION_INIT { 0 }

psa_status_t psa_crypto_init(void);
psa_status_t psa_hash_abort(psa_hash_operation_t *operation);
psa_status_t psa_hash_setup(psa_hash_operation_t *operation, int algorithm);
psa_status_t psa_hash_update(psa_hash_operation_t *operation,
			      const uint8_t *input, size_t input_length);
psa_status_t psa_hash_finish(psa_hash_operation_t *operation, uint8_t *hash,
			     size_t hash_size, size_t *hash_length);

#endif

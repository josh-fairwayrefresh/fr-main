#ifndef FAIRWAY_OTA_HOST_ATOMIC_H
#define FAIRWAY_OTA_HOST_ATOMIC_H

typedef int atomic_t;
static inline int atomic_get(const atomic_t *value) { return *value; }
static inline void atomic_set(atomic_t *value, int next) { *value = next; }
static inline void atomic_clear(atomic_t *value) { *value = 0; }

#endif

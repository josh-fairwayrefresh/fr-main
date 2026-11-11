#ifndef FAIRWAY_HOST_ZTEST_H
#define FAIRWAY_HOST_ZTEST_H

#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

typedef void (*host_ztest_fn)(void);

extern host_ztest_fn host_ztest_cases[];
extern size_t host_ztest_case_count;
void host_ztest_register(host_ztest_fn test);

#define ZTEST(suite, name) \
	static void suite##_##name(void); \
	static void __attribute__((constructor)) register_##suite##_##name(void) \
	{ \
		host_ztest_register(suite##_##name); \
	} \
	static void suite##_##name(void)

#define ZTEST_SUITE(suite, ...) \
	int main(void) \
	{ \
		for (size_t i = 0; i < host_ztest_case_count; i++) { \
			host_ztest_cases[i](); \
		} \
		printf("PASS: %zu host ztests\n", host_ztest_case_count); \
		return 0; \
	}

#define zassert_equal(actual, expected, ...) \
	do { \
		if ((actual) != (expected)) { \
			fprintf(stderr, "%s:%d: expected %lld, got %lld\n", \
				__FILE__, __LINE__, (long long)(expected), (long long)(actual)); \
			abort(); \
		} \
	} while (0)

#define zassert_true(expression, ...) zassert_equal(!!(expression), true)
#define zassert_false(expression, ...) zassert_equal(!!(expression), false)

#endif /* FAIRWAY_HOST_ZTEST_H */

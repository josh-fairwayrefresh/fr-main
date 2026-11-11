#include "zephyr/ztest.h"

#include <stdlib.h>

host_ztest_fn host_ztest_cases[64];
size_t host_ztest_case_count;

void host_ztest_register(host_ztest_fn test)
{
	if (host_ztest_case_count >= 64) {
		abort();
	}
	host_ztest_cases[host_ztest_case_count++] = test;
}

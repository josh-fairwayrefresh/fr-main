cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(fairway_ota_update_policy)

target_include_directories(app PRIVATE
	${CMAKE_CURRENT_LIST_DIR}/../../samples/fairway_power_sandbox/src)
target_sources(app PRIVATE
	src/main.c
	${CMAKE_CURRENT_LIST_DIR}/../../samples/fairway_power_sandbox/src/ota_update_policy.c
	${CMAKE_CURRENT_LIST_DIR}/../../samples/fairway_power_sandbox/src/ota_update_staging.c)

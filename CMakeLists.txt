#
# Copyright (c) 2020 Circuit Dojo
#
# SPDX-License-Identifier: Apache-2.0
#

# Fairway module root directory.
set(FAIRWAY_ROOT_DIR ${CMAKE_CURRENT_LIST_DIR} CACHE PATH "Fairway root directory")

zephyr_include_directories(include)

add_subdirectory(drivers)
add_subdirectory(lib)
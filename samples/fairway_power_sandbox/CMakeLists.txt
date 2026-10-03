# SPDX-License-Identifier: Apache-2.0

cmake_minimum_required(VERSION 3.21)

find_package(Zephyr HINTS $ENV{ZEPHYR_BASE})
project(blinky)

set(FAIRWAY_HARDWARE_REVISION "Monarch Bay Pilot v3.2" CACHE STRING
    "Hardware revision installed in this firmware image")
set(FAIRWAY_FIRMWARE_GENERATION "Prototype 3.2 for Pilot — Working Button and Lights" CACHE STRING
    "Canonical firmware generation installed in this image")

foreach(identity_value IN ITEMS FAIRWAY_HARDWARE_REVISION FAIRWAY_FIRMWARE_GENERATION)
    string(LENGTH "${${identity_value}}" identity_length)
    if(identity_length EQUAL 0 OR identity_length GREATER 160)
        message(FATAL_ERROR "${identity_value} must contain 1-160 bytes")
    endif()
    string(FIND "${${identity_value}}" "\"" identity_quote_index)
    string(FIND "${${identity_value}}" "\\" identity_backslash_index)
    if(NOT identity_quote_index EQUAL -1 OR NOT identity_backslash_index EQUAL -1)
        message(FATAL_ERROR "${identity_value} must not contain JSON string escape characters")
    endif()
endforeach()

if(CONFIG_BOARD_CIRCUITDOJO_FEATHER_NRF9151)
    target_sources(app PRIVATE src/main.c src/health_temperature.c src/health_schedule.c
        src/command_protocol.c src/demand_window.c src/complete_poll.c)
    target_compile_definitions(app PRIVATE
        FAIRWAY_HARDWARE_REVISION="${FAIRWAY_HARDWARE_REVISION}"
        FAIRWAY_FIRMWARE_GENERATION="${FAIRWAY_FIRMWARE_GENERATION}"
    )
else()
    message(FATAL_ERROR "Fairway requires circuitdojo_feather_nrf9151")
endif()

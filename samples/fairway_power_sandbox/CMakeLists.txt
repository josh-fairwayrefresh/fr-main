# SPDX-License-Identifier: Apache-2.0

cmake_minimum_required(VERSION 3.21)

find_package(Zephyr HINTS $ENV{ZEPHYR_BASE})
project(blinky)

if(DEFINED ENV{FAIRWAY_DEVICE_ID})
    set(FAIRWAY_DEVICE_ID "$ENV{FAIRWAY_DEVICE_ID}")
endif()
if(DEFINED ENV{FAIRWAY_DEVICE_SECRETS_DIR})
    set(FAIRWAY_DEVICE_SECRETS_DIR "$ENV{FAIRWAY_DEVICE_SECRETS_DIR}")
endif()
if(DEFINED ENV{FAIRWAY_DEVICE_KEY_HEADER})
    set(FAIRWAY_DEVICE_KEY_HEADER "$ENV{FAIRWAY_DEVICE_KEY_HEADER}")
endif()

if(CONFIG_BOARD_CIRCUITDOJO_FEATHER_NRF9151)
    if(NOT FAIRWAY_DEVICE_ID MATCHES "^FRB-[0-9][0-9][0-9][0-9]$")
        message(FATAL_ERROR "Set FAIRWAY_DEVICE_ID to the explicit target Device ID")
    endif()
    if(NOT IS_ABSOLUTE "${FAIRWAY_DEVICE_SECRETS_DIR}" OR
       NOT IS_DIRECTORY "${FAIRWAY_DEVICE_SECRETS_DIR}" OR
       IS_SYMLINK "${FAIRWAY_DEVICE_SECRETS_DIR}")
        message(FATAL_ERROR "Set FAIRWAY_DEVICE_SECRETS_DIR to a regular approved secrets directory")
    endif()

    set(_named_device_header
        "${FAIRWAY_DEVICE_SECRETS_DIR}/${FAIRWAY_DEVICE_ID}-fairway_device_key.h")
    set(_generic_device_header
        "${FAIRWAY_DEVICE_SECRETS_DIR}/fairway_device_key.h")
    if(FAIRWAY_DEVICE_KEY_HEADER)
        get_filename_component(_requested_header
                               "${FAIRWAY_DEVICE_KEY_HEADER}" REALPATH)
        get_filename_component(_named_header
                               "${_named_device_header}" REALPATH)
        get_filename_component(_generic_header
                               "${_generic_device_header}" REALPATH)
        if(NOT _requested_header STREQUAL _named_header AND
           NOT _requested_header STREQUAL _generic_header)
            message(FATAL_ERROR "Provisioning input must be the target Device header or the explicitly selected generic header")
        endif()
        set(_device_header "${_requested_header}")
        if(_device_header STREQUAL _generic_header AND
           EXISTS "${_named_device_header}")
            message(FATAL_ERROR "Ambiguous provisioning inputs for ${FAIRWAY_DEVICE_ID}")
        endif()
    else()
        set(_device_header "${_named_device_header}")
    endif()
    if(NOT EXISTS "${_device_header}" OR IS_SYMLINK "${_device_header}")
        message(FATAL_ERROR "No regular named provisioning input found for ${FAIRWAY_DEVICE_ID}")
    endif()
    file(STRINGS "${_device_header}" _device_id_lines
         REGEX "^[ \t]*#[ \t]*define[ \t]+FAIRWAY_DEVICE_ID([ \t]|$)")
    list(LENGTH _device_id_lines _device_id_line_count)
    if(NOT _device_id_line_count EQUAL 1 OR
       NOT "${_device_id_lines}" STREQUAL
       "#define FAIRWAY_DEVICE_ID \"${FAIRWAY_DEVICE_ID}\"")
        message(FATAL_ERROR "Provisioning input must define exactly the requested Device ID")
    endif()

    file(STRINGS "${_device_header}" _device_key_lines
         REGEX "^[ \t]*#[ \t]*define[ \t]+FAIRWAY_DEVICE_KEY([ \t]|$)")
    list(LENGTH _device_key_lines _device_key_line_count)
    if(NOT _device_key_line_count EQUAL 1)
        message(FATAL_ERROR "Provisioning input must define exactly one credential")
    endif()
    string(REGEX MATCH "^#define FAIRWAY_DEVICE_KEY \"([A-Za-z0-9_-]+)\"$"
           _device_key_match "${_device_key_lines}")
    if(NOT _device_key_match)
        message(FATAL_ERROR "Provisioning input credential has an invalid format")
    endif()
    string(LENGTH "${CMAKE_MATCH_1}" _device_key_length)
    if(NOT _device_key_length EQUAL 43)
        message(FATAL_ERROR "Provisioning input credential has an invalid format")
    endif()
    string(SUBSTRING "${CMAKE_MATCH_1}" 42 1 _device_key_last_character)
    if(NOT _device_key_last_character MATCHES "^[AEIMQUYcgkosw048]$")
        message(FATAL_ERROR "Provisioning input credential has an invalid format")
    endif()

    set(_generated_device_include "${CMAKE_CURRENT_BINARY_DIR}/generated_device_identity")
    file(MAKE_DIRECTORY "${_generated_device_include}")
    configure_file("${_device_header}"
                   "${_generated_device_include}/fairway_device_key.h"
                   COPYONLY)
    target_include_directories(app BEFORE PRIVATE "${_generated_device_include}")

    target_sources(app PRIVATE src/main.c
        src/command_protocol.c src/demand_window.c src/complete_poll.c
        src/golfer_txn.c src/power_policy.c src/http_transport.c
        src/golfer_protocol.c src/button_ux.c src/modem_service.c
        src/transaction_scheduler.c)
else()
    message(FATAL_ERROR "Fairway requires circuitdojo_feather_nrf9151")
endif()

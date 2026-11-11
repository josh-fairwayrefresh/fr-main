# SPDX-License-Identifier: Apache-2.0

cmake_minimum_required(VERSION 3.21)

find_package(Zephyr HINTS $ENV{ZEPHYR_BASE})
project(blinky)

if(CONFIG_BOARD_CIRCUITDOJO_FEATHER_NRF9151)
    if(CONFIG_FAIRWAY_USB_COMMISSIONING)
        target_sources(app PRIVATE src/usb_commissioning.c src/device_identity.c src/power_policy.c)
    else()
        target_sources(app PRIVATE src/main.c
        src/command_protocol.c src/demand_window.c src/complete_poll.c
        src/golfer_txn.c src/power_policy.c src/http_transport.c
        src/golfer_protocol.c src/button_ux.c src/modem_service.c
        src/transaction_scheduler.c src/device_identity.c)
        if(CONFIG_FAIRWAY_OTA)
            target_sources(app PRIVATE src/ota_update.c src/ota_update_policy.c
                src/ota_update_staging.c src/ota_update_scheduler.c
                src/ota_update_discovery.c src/ota_update_download.c
                src/ota_update_reporting.c src/ota_delivery_reporting.c
                src/ota_delivery.c)
        endif()
    endif()
else()
    message(FATAL_ERROR "Fairway requires circuitdojo_feather_nrf9151")
endif()

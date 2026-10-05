cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(complete_poll)

target_include_directories(app PRIVATE ../../src)
target_sources(app PRIVATE
    src/main.c
    ../../src/complete_poll.c
    ../../src/demand_window.c
    ../../src/http_response.c
)
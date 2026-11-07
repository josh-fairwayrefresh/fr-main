#ifndef FAIRWAY_OTA_HOST_ZEPHYR_REBOOT_H
#define FAIRWAY_OTA_HOST_ZEPHYR_REBOOT_H

#define SYS_REBOOT_COLD 0

void sys_reboot(int type);

#endif

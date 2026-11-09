#include "ota_update_download.h"

#include <errno.h>
#include <string.h>

#include <net/downloader.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include "http_transport.h"
#include "ota_update.h"

LOG_MODULE_REGISTER(ota_download);

#define OTA_DOWNLOAD_BUFFER_SIZE 2048
#define OTA_DOWNLOAD_TIMEOUT_MS (15 * 60 * 1000)

static struct downloader downloader;
static char downloader_buffer[OTA_DOWNLOAD_BUFFER_SIZE];
static K_SEM_DEFINE(download_complete_sem, 0, 1);
static bool downloader_initialized;
static int download_result;

static int downloader_event_handler(const struct downloader_evt *event)
{
	switch (event->id) {
	case DOWNLOADER_EVT_FRAGMENT:
		return ota_update_write(event->fragment.buf, event->fragment.len);
	case DOWNLOADER_EVT_ERROR:
		download_result = event->error;
		k_sem_give(&download_complete_sem);
		return event->error;
	case DOWNLOADER_EVT_DONE:
		download_result = 0;
		k_sem_give(&download_complete_sem);
		break;
	case DOWNLOADER_EVT_STOPPED:
		if (download_result == -EINPROGRESS) {
			download_result = -ECANCELED;
		}
		k_sem_give(&download_complete_sem);
		break;
	case DOWNLOADER_EVT_DEINITIALIZED:
		break;
	}
	return 0;
}

int fairway_ota_download_release(const struct fairway_ota_release *release)
{
	static const int sec_tags[] = { FAIRWAY_TLS_SEC_TAG };
	struct downloader_cfg download_config = {
		.callback = downloader_event_handler,
		.buf = downloader_buffer,
		.buf_size = sizeof(downloader_buffer),
	};
	struct downloader_host_cfg host_config = {
		.sec_tag_list = sec_tags,
		.sec_tag_count = ARRAY_SIZE(sec_tags),
		.range_override = 0,
		.keep_connection = false,
	};
	char url[512];
	int ret;

	if (release == NULL || release->artifact_path[0] != '/' ||
	    strstr(release->artifact_path, "..") != NULL) {
		return -EINVAL;
	}
	int url_len = snprintk(url, sizeof(url), "https://%s%s",
			       FAIRWAY_HOST, release->artifact_path);
	if (url_len < 0 || url_len >= sizeof(url)) {
		memset(url, 0, sizeof(url));
		return -ENOMEM;
	}
	if (!downloader_initialized) {
		ret = downloader_init(&downloader, &download_config);
		if (ret != 0) {
			memset(url, 0, sizeof(url));
			return ret;
		}
		downloader_initialized = true;
	}

	k_sem_reset(&download_complete_sem);
	download_result = -EINPROGRESS;
	ret = downloader_get(&downloader, &host_config, url, 0);
	memset(url, 0, sizeof(url));
	if (ret != 0) {
		download_result = ret;
		return ret;
	}

	ret = k_sem_take(&download_complete_sem, K_MSEC(OTA_DOWNLOAD_TIMEOUT_MS));
	if (ret != 0) {
		download_result = -ETIMEDOUT;
		(void)downloader_cancel(&downloader);
		(void)k_sem_take(&download_complete_sem, K_SECONDS(10));
		return -ETIMEDOUT;
	}
	return download_result;
}

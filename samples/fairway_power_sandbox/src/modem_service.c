#include "modem_service.h"

#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <modem/lte_lc.h>
#include <modem/modem_key_mgmt.h>
#include <modem/nrf_modem_lib.h>

#include "complete_poll.h"
#include "http_transport.h"
#include "power_policy.h"
#include "thread_priorities.h"

LOG_MODULE_REGISTER(modem_service);

/* Owned deliberately rather than inherited from CONFIG_MAIN_STACK_SIZE
 * (a main-thread sizing concern unrelated to this thread's own needs):
 * modem init, cert compare/write, and LTE connect all run here.
 */
#define MODEM_SERVICE_THREAD_STACK_SIZE 2048

static const char fairway_ca_cert[] = {
#include "certs/google-run-ca-chain-cstr.pem"
};

static K_SEM_DEFINE(local_hw_ready_sem, 0, 1);
static K_SEM_DEFINE(network_wake_sem, 0, 1);

static volatile bool lte_registered_pending;
static volatile bool modem_ready;

/* Registration state is written by the LTE callback and read by COMPLETE
 * (via modem_service_lte_is_registered()).
 */
struct radio_state {
	bool registration_valid;
	enum lte_lc_nw_reg_status registration_state;
};
static struct radio_state radio_state;
static struct k_spinlock radio_state_lock;

static void radio_state_write_registration(enum lte_lc_nw_reg_status status)
{
	k_spinlock_key_t key = k_spin_lock(&radio_state_lock);

	radio_state.registration_valid = true;
	radio_state.registration_state = status;
	k_spin_unlock(&radio_state_lock, key);
}

static struct radio_state radio_state_snapshot(void)
{
	k_spinlock_key_t key = k_spin_lock(&radio_state_lock);
	struct radio_state copy = radio_state;

	k_spin_unlock(&radio_state_lock, key);
	return copy;
}

bool modem_service_lte_is_registered(void)
{
	struct radio_state snapshot = radio_state_snapshot();

	return snapshot.registration_valid &&
	       (snapshot.registration_state == LTE_LC_NW_REG_REGISTERED_HOME ||
		snapshot.registration_state == LTE_LC_NW_REG_REGISTERED_ROAMING);
}

void modem_service_set_psm_requested(bool requested)
{
	int ret;

	if (!modem_ready) {
		LOG_INF("PSM request deferred: modem not yet ready");
		return;
	}

	ret = lte_lc_psm_req(requested);
	if (ret) {
		LOG_ERR("lte_lc_psm_req(%d) failed: %d", requested, ret);
		return;
	}

	if (requested) {
		LOG_INF("PSM requested: RPTAU=default, RAT=0 s");
	} else {
		LOG_INF("PSM request withdrawn: VBUS service hold active");
	}
}

/* Single globally-registered LTE event handler (lte_lc_connect_async() and
 * lte_lc_register_handler() both only support one handler at a time).
 * Runs on the LTE link-control library's own notification context, never
 * main/transaction_scheduler/modem_service's own thread. Only writes
 * radio_state (spinlock-protected); any follow-up requiring a particular
 * thread is only ever signaled via lte_registered_pending +
 * network_wake_sem, never performed directly here.
 */
static void lte_evt_handler(const struct lte_lc_evt *const evt)
{
	switch (evt->type) {
	case LTE_LC_EVT_NW_REG_STATUS:
		radio_state_write_registration(evt->nw_reg_status);
		complete_poll_signal();

		if (evt->nw_reg_status == LTE_LC_NW_REG_REGISTERED_HOME ||
		    evt->nw_reg_status == LTE_LC_NW_REG_REGISTERED_ROAMING) {
			LOG_INF("LTE registered: status=%d", evt->nw_reg_status);
			lte_registered_pending = true;
			k_sem_give(&network_wake_sem);
		} else {
			LOG_INF("LTE registration status update: %d", evt->nw_reg_status);
		}
		break;
	default:
		break;
	}
}

static void configure_psm(void)
{
	int ret = lte_lc_psm_param_set_seconds(-1, 0);

	if (ret) {
		LOG_ERR("lte_lc_psm_param_set_seconds failed: %d", ret);
		return;
	}

	modem_service_set_psm_requested(!power_policy_vbus_hold_active());
}

static int provision_fairway_ca_certificate(void)
{
	int ret;
	bool exists;
	int mismatch;

	LOG_INF("Checking Cloud Run CA certificate");

	ret = modem_key_mgmt_exists(FAIRWAY_TLS_SEC_TAG,
				    MODEM_KEY_MGMT_CRED_TYPE_CA_CHAIN,
				    &exists);
	if (ret) {
		LOG_ERR("CA certificate exists check failed: %d", ret);
		return ret;
	}

	if (exists) {
		mismatch = modem_key_mgmt_cmp(FAIRWAY_TLS_SEC_TAG,
					      MODEM_KEY_MGMT_CRED_TYPE_CA_CHAIN,
					      fairway_ca_cert,
					      strlen(fairway_ca_cert));
		if (!mismatch) {
			LOG_INF("CA certificate already provisioned and matches");
			return 0;
		}

		LOG_INF("CA certificate mismatch; replacing certificate");

		ret = modem_key_mgmt_delete(FAIRWAY_TLS_SEC_TAG,
					    MODEM_KEY_MGMT_CRED_TYPE_CA_CHAIN);
		if (ret) {
			LOG_ERR("CA certificate delete failed: %d", ret);
			return ret;
		}
	}

	LOG_INF("Provisioning CA certificate to modem");

	ret = modem_key_mgmt_write(FAIRWAY_TLS_SEC_TAG,
				   MODEM_KEY_MGMT_CRED_TYPE_CA_CHAIN,
				   fairway_ca_cert,
				   sizeof(fairway_ca_cert) - 1);
	if (ret) {
		LOG_ERR("CA certificate write failed: %d", ret);
		return ret;
	}

	LOG_INF("CA certificate provisioned successfully");
	return 0;
}

void modem_service_notify_local_hw_ready(void)
{
	k_sem_give(&local_hw_ready_sem);
}

/* Owns modem startup and registration-triggered DNS prewarm. Blocks on
 * local_hw_ready_sem until main() has finished local button/LED hardware
 * setup, then performs the one-time modem/PSM/cert/connect sequence.
 */
static void modem_service_thread_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);
	int ret;

	k_sem_take(&local_hw_ready_sem, K_FOREVER);

	LOG_INF("Initializing modem library");
	ret = nrf_modem_lib_init();
	if (ret) {
		LOG_ERR("Modem library init failed: %d", ret);
	} else {
		LOG_INF("Modem library init succeeded");
		modem_ready = true;

		configure_psm();

		ret = provision_fairway_ca_certificate();
		if (ret) {
			LOG_ERR("Cloud Run CA certificate provisioning failed: %d", ret);
		} else {
			LOG_INF("Cloud Run CA certificate ready");
		}

		LOG_INF("Starting LTE connection (asynchronous)");
		ret = lte_lc_connect_async(lte_evt_handler);
		if (ret) {
			LOG_ERR("lte_lc_connect_async failed: %d", ret);
			LOG_WRN("Continuing without an LTE connection attempt in progress; "
				"the golfer path remains available and any request made "
				"before connectivity is established reaches bounded FAILURE");
		} else {
			LOG_INF("LTE connection attempt started; registration reported asynchronously");
		}
	}

	while (1) {
		if (!lte_registered_pending) {
			k_sem_take(&network_wake_sem, K_FOREVER);
		}

		if (lte_registered_pending) {
			lte_registered_pending = false;

			/* One-time, non-blocking DNS pre-warm: never waited on here. */
			http_transport_dns_prewarm();
		}
	}
}
K_THREAD_DEFINE(modem_service_thread, MODEM_SERVICE_THREAD_STACK_SIZE,
		modem_service_thread_entry, NULL, NULL, NULL,
		MODEM_SERVICE_THREAD_PRIORITY, 0, 0);

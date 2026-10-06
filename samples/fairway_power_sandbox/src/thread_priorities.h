#ifndef THREAD_PRIORITIES_H
#define THREAD_PRIORITIES_H

/*
 * Single place for the cross-module thread-priority invariant. Each
 * priority is owned/used by its respective module's K_THREAD_DEFINE; this
 * header exists purely so main.c's BUILD_ASSERT chain can see all three
 * without main.c owning any of their definitions.
 */
#define TRANSACTION_THREAD_PRIORITY       1
#define MODEM_SERVICE_THREAD_PRIORITY     2
#define DNS_RESOLVER_THREAD_PRIORITY      3

#endif /* THREAD_PRIORITIES_H */

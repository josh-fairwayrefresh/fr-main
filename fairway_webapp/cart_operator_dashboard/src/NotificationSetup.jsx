import React, { useEffect, useId, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { operatorRequest } from './lib/operator';
import { courseKey } from './lib/courseContext.mjs';

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function NotificationSetup({ user, apiBaseUrl, operatorConfig, onMutationPending, refreshRecoveryRef }) {
  const [preferences, setPreferences] = useState(operatorConfig.notification_preferences || {});
  const [busyCourse, setBusyCourse] = useState('');
  const [error, setError] = useState('');
  const [guidanceVisible, setGuidanceVisible] = useState(false);
  const serviceWorkerRef = useRef(null);
  const subscriptionRef = useRef(undefined);
  const recoveryPromiseRef = useRef(null);
  const permissionRequestRef = useRef(null);
  const recoverSubscriptionsRef = useRef(null);
  const guidanceId = useId();
  const supported = Boolean(navigator.serviceWorker && window.PushManager && window.Notification);
  const installed = isInstalled();
  const canEnable = supported && installed && Boolean(operatorConfig.push?.vapid_public_key);
  const configuredEnabledCourses = operatorConfig.courses.filter((course) => (
    operatorConfig.notification_preferences?.[courseKey(course)] === true
  ));

  async function registerWithBackend(course, subscription) {
    await operatorRequest(user, apiBaseUrl, '/api/v1/operator/push-subscriptions', {
      method: 'POST',
      body: { customer_id: course.customer_id, course_id: course.course_id, subscription: subscription.toJSON() },
    });
  }

  async function savePreference(course, enabled) {
    await operatorRequest(user, apiBaseUrl, '/api/v1/operator/notification-preferences', {
      method: 'PATCH',
      body: { customer_id: course.customer_id, course_id: course.course_id, enabled },
    });
    setPreferences((current) => ({ ...current, [courseKey(course)]: enabled }));
  }

  async function recoverSubscriptions(fromUserGesture = false) {
    const enabledCourses = operatorConfig.courses.filter((course) => (
      operatorConfig.notification_preferences?.[courseKey(course)] === true
    ));
    if (enabledCourses.length === 0) return;

    if (fromUserGesture && supported && installed && operatorConfig.push?.vapid_public_key &&
        Notification.permission !== 'granted' && subscriptionRef.current !== true) {
      try {
        permissionRequestRef.current = Notification.requestPermission();
      } catch (reason) {
        setError(`Unable to request notification permission: ${reason.message}`);
      }
    }

    if (recoveryPromiseRef.current) return recoveryPromiseRef.current;
    setError('');
    let gestureSubscription = null;
    if (fromUserGesture && operatorConfig.push?.vapid_public_key && subscriptionRef.current === false &&
        Notification.permission === 'granted' && serviceWorkerRef.current) {
      gestureSubscription = serviceWorkerRef.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(operatorConfig.push.vapid_public_key),
      }).then(
        (subscription) => ({ subscription }),
        (reason) => ({ error: reason }),
      );
    }
    const task = (async () => {
      try {
        if (!supported) {
          throw new Error('Web Push is unavailable on this browser. Use a browser that supports notifications.');
        }
        if (!installed) {
          throw new Error('Open the installed Fairway Home Screen app to use push notifications.');
        }
        if (!operatorConfig.push?.vapid_public_key) {
          throw new Error('Push notifications are unavailable in this environment. Contact support if this continues.');
        }

        if (!serviceWorkerRef.current) {
          await navigator.serviceWorker.register('/sw.js', { scope: '/' });
          serviceWorkerRef.current = await navigator.serviceWorker.ready;
        }
        const registration = serviceWorkerRef.current;
        const subscription = await registration.pushManager.getSubscription();
        subscriptionRef.current = Boolean(subscription);

        let permission = Notification.permission;
        if (permissionRequestRef.current) {
          const permissionRequest = permissionRequestRef.current;
          permissionRequestRef.current = null;
          permission = await permissionRequest;
        }
        if (!subscription && permission !== 'granted') {
          throw new Error(permission === 'denied'
            ? 'Notifications are blocked. Allow them in this device’s Settings, then press Refresh App again.'
            : 'Notifications are enabled in your saved preference, but this device has not granted permission. Press Refresh App to allow notifications.');
        }

        const proactiveResult = !subscription && gestureSubscription
          ? await gestureSubscription
          : null;
        if (proactiveResult?.error) throw proactiveResult.error;
        const currentSubscription = subscription || proactiveResult?.subscription ||
          await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey(operatorConfig.push.vapid_public_key),
          });
        subscriptionRef.current = true;
        const results = await Promise.allSettled(enabledCourses.map((course) => (
          registerWithBackend(course, currentSubscription)
        )));
        const failed = results.find((result) => result.status === 'rejected');
        if (failed) throw failed.reason;
        setError('');
      } catch (reason) {
        subscriptionRef.current = reason.name === 'NotAllowedError' ? false : subscriptionRef.current;
        setError(`${reason.message || 'Unable to recover push notifications.'} Press Refresh App to retry.`);
      }
    })();
    recoveryPromiseRef.current = task;
    try {
      await task;
    } finally {
      if (recoveryPromiseRef.current === task) recoveryPromiseRef.current = null;
    }
  }

  useEffect(() => {
    setPreferences(operatorConfig.notification_preferences || {});
    recoverSubscriptionsRef.current = () => recoverSubscriptions(true);
    if (refreshRecoveryRef) refreshRecoveryRef.current = recoverSubscriptionsRef.current;
    if (configuredEnabledCourses.length > 0) void recoverSubscriptions();
    return () => {
      if (refreshRecoveryRef?.current === recoverSubscriptionsRef.current) refreshRecoveryRef.current = null;
      recoverSubscriptionsRef.current = null;
    };
  }, [apiBaseUrl, installed, operatorConfig, supported, user, refreshRecoveryRef]);

  async function changePreference(course, enabled) {
    onMutationPending?.(true);
    const key = courseKey(course);
    setBusyCourse(key);
    setError('');
    try {
      if (!enabled) {
        await savePreference(course, false);
        return;
      }
      if (!canEnable) {
        setError('Push notifications are unavailable on this device or environment.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError(permission === 'denied'
          ? 'Notifications are blocked by this browser or device.'
          : 'Browser notification permission was not granted.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(operatorConfig.push.vapid_public_key),
      });
      await registerWithBackend(course, subscription);
      await savePreference(course, true);
      subscriptionRef.current = true;
    } catch (reason) {
      setError(`${reason.message} Try enabling notifications again to retry.`);
    } finally {
      onMutationPending?.(false);
      setBusyCourse('');
    }
  }

  const permission = supported ? Notification.permission : 'unsupported';
  const guidance = !supported
    ? 'Web Push is unavailable on this device. Use a browser that supports push notifications.'
    : !installed
      ? 'Install Fairway and open the installed application to enable push notifications.'
      : !operatorConfig.push?.vapid_public_key
        ? 'Push notifications are unavailable in this environment.'
        : permission === 'denied'
          ? 'Notifications are blocked. Allow notifications in your browser or device settings, then try again.'
          : '';

  return (
    <section className="notification-setup" aria-label="New request notifications">
      <div className="notification-heading">
        <Bell size={17} aria-hidden="true" />
        <strong>New request notifications</strong>
      </div>
      <div className="notification-course-options">
        {operatorConfig.courses.map((course) => {
          const key = courseKey(course);
          const enabled = preferences[key] === true;
          const unavailable = !enabled && !canEnable;
          return (
            <label key={key}
              tabIndex={unavailable ? 0 : undefined}
              aria-describedby={unavailable ? guidanceId : undefined}
              onFocus={() => setGuidanceVisible(Boolean(guidance))}
              onClick={() => setGuidanceVisible(Boolean(guidance))}
              onBlur={() => setGuidanceVisible(false)}
            >
              <span>{course.course_name}</span>
              <input
                type="checkbox"
                checked={enabled}
                disabled={busyCourse === key || unavailable}
                aria-describedby={unavailable ? guidanceId : undefined}
                onChange={(event) => changePreference(course, event.target.checked)}
              />
            </label>
          );
        })}
      </div>
      {guidance && <p id={guidanceId} className="notification-guidance" hidden={!guidanceVisible}>{guidance}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

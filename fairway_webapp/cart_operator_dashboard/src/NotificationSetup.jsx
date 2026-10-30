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

export default function NotificationSetup({ user, apiBaseUrl, operatorConfig, onMutationPending }) {
  const [preferences, setPreferences] = useState(operatorConfig.notification_preferences || {});
  const [busyCourse, setBusyCourse] = useState('');
  const [error, setError] = useState('');
  const [guidanceVisible, setGuidanceVisible] = useState(false);
  const [subscriptionStates, setSubscriptionStates] = useState({});
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const recoveryInFlight = useRef(false);
  const guidanceId = useId();
  const supported = Boolean(navigator.serviceWorker && window.PushManager && window.Notification);
  const installed = isInstalled();
  const canEnable = supported && installed && Boolean(operatorConfig.push?.vapid_public_key);
  const enabledCourses = operatorConfig.courses.filter((course) => preferences[courseKey(course)] === true);
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

  async function recoverSubscriptions(fromUserGesture = false, courses = enabledCourses) {
    if (recoveryInFlight.current || courses.length === 0) return;
    recoveryInFlight.current = true;
    setRecoveryBusy(true);
    setError('');
    setSubscriptionStates((current) => Object.fromEntries([
      ...Object.entries(current),
      ...courses.map((course) => [courseKey(course), 'checking']),
    ]));
    onMutationPending?.(true);

    try {
      if (!supported) {
        throw new Error('Web Push is unavailable on this browser. Use a browser that supports notifications.');
      }
      if (!installed) {
        throw new Error('Open the installed Fairway Home Screen app to restore notifications.');
      }
      if (!operatorConfig.push?.vapid_public_key) {
        throw new Error('Push notifications are unavailable in this environment. Contact support if this continues.');
      }

      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      let permission = Notification.permission;

      if (fromUserGesture && permission !== 'granted') {
        permission = await Notification.requestPermission();
      }

      if (!subscription && permission !== 'granted') {
        const message = permission === 'denied'
          ? 'Notifications are blocked. Allow them in this device’s Settings, then tap Restore Notifications.'
          : 'Tap Restore Notifications to allow this device to create a push subscription.';
        setSubscriptionStates((current) => Object.fromEntries([
          ...Object.entries(current),
          ...courses.map((course) => [courseKey(course), 'needs-restore']),
        ]));
        setError(message);
        return;
      }

      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey(operatorConfig.push.vapid_public_key),
          });
        } catch (reason) {
          if (!fromUserGesture && reason.name === 'NotAllowedError') {
            setSubscriptionStates((current) => Object.fromEntries([
              ...Object.entries(current),
              ...courses.map((course) => [courseKey(course), 'needs-restore']),
            ]));
            setError('This browser requires a tap to restore notifications. Tap Restore Notifications to continue.');
            return;
          }
          throw reason;
        }
      }

      const results = await Promise.all(courses.map(async (course) => {
        try {
          await registerWithBackend(course, subscription);
          return { key: courseKey(course), name: course.course_name, error: '' };
        } catch (reason) {
          return { key: courseKey(course), name: course.course_name, error: reason.message };
        }
      }));
      setSubscriptionStates((current) => ({
        ...current,
        ...Object.fromEntries(results.map(({ key, error: reason }) => [key, reason ? 'error' : 'registered'])),
      }));

      const failed = results.filter((result) => result.error);
      if (failed.length > 0) {
        setError(`Could not register notifications for ${failed.map(({ name }) => name).join(', ')}. Tap Restore Notifications to retry. ${failed[0].error}`);
      } else if (permission !== 'granted') {
        setSubscriptionStates((current) => Object.fromEntries([
          ...Object.entries(current),
          ...courses.map((course) => [courseKey(course), 'needs-restore']),
        ]));
        setError('The subscription is registered, but notifications are blocked until permission is granted in device Settings. Tap Restore Notifications after allowing them.');
      }
    } catch (reason) {
      setSubscriptionStates((current) => ({
        ...current,
        ...Object.fromEntries(courses.map((course) => [courseKey(course), 'error'])),
      }));
      setError(`${reason.message || 'Unable to restore notifications.'} Tap Restore Notifications to retry.`);
    } finally {
      onMutationPending?.(false);
      recoveryInFlight.current = false;
      setRecoveryBusy(false);
    }
  }

  useEffect(() => {
    setPreferences(operatorConfig.notification_preferences || {});
    if (configuredEnabledCourses.length === 0) {
      setSubscriptionStates({});
      return;
    }
    void recoverSubscriptions(false, configuredEnabledCourses);
  }, [apiBaseUrl, installed, operatorConfig, supported, user]);

  async function changePreference(course, enabled) {
    onMutationPending?.(true);
    const key = courseKey(course);
    setBusyCourse(key);
    setError('');
    try {
      if (!enabled) {
        await savePreference(course, false);
        setSubscriptionStates((current) => ({ ...current, [key]: 'off' }));
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
      setSubscriptionStates((current) => ({ ...current, [key]: 'registered' }));
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
      {enabledCourses.map((course) => {
        const key = courseKey(course);
        const state = subscriptionStates[key] || 'checking';
        const status = {
          checking: 'Checking push subscription…',
          registered: 'Preference enabled; subscription registered.',
          'needs-restore': 'Preference enabled; this device needs notification restoration.',
          error: 'Preference enabled; subscription registration needs attention.',
        }[state];
        return <p className="notification-subscription-status" role="status" key={key}>{course.course_name}: {status}</p>;
      })}
      {enabledCourses.some((course) => subscriptionStates[courseKey(course)] !== 'registered') && (
        <button type="button" className="notification-restore"
          onClick={() => void recoverSubscriptions(true)} disabled={recoveryBusy || Boolean(busyCourse)}>
          {recoveryBusy ? 'Restoring Notifications…' : 'Restore Notifications'}
        </button>
      )}
      {guidance && <p id={guidanceId} className="notification-guidance" hidden={!guidanceVisible}>{guidance}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

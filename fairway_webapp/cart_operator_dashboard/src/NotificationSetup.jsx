import React, { useEffect, useId, useState } from 'react';
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
  const guidanceId = useId();
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const installed = isInstalled();
  const canEnable = supported && installed && Boolean(operatorConfig.push?.vapid_public_key);

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

  useEffect(() => {
    let active = true;
    setPreferences(operatorConfig.notification_preferences || {});
    if (!supported || !installed || !operatorConfig.push?.vapid_public_key) {
      return () => { active = false; };
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!active || !subscription) return;
        const enabledCourses = operatorConfig.courses.filter((course) => (
          operatorConfig.notification_preferences?.[courseKey(course)] === true
        ));
        await Promise.all(enabledCourses.map((course) => registerWithBackend(course, subscription)));
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => { active = false; };
  }, [apiBaseUrl, installed, operatorConfig, supported, user]);

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
    } catch (reason) {
      setError(reason.message);
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

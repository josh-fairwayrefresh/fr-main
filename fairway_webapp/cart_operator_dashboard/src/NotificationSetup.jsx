import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Smartphone } from 'lucide-react';
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
  const permissionText = permission === 'granted'
    ? 'Browser permission granted'
    : permission === 'denied'
      ? 'Browser permission blocked'
      : permission === 'unsupported'
        ? 'Web Push unavailable on this device'
        : 'Browser permission not yet granted';

  return (
    <section className="notification-setup" aria-label="New request notifications">
      <div className="notification-heading">
        {!supported ? <BellOff size={18} /> : installed ? <Bell size={18} /> : <Smartphone size={18} />}
        <div>
          <strong>New request notifications</strong>
          <span>{permissionText}{!installed && supported ? ' · install Fairway to enable push' : ''}</span>
        </div>
      </div>
      <div className="notification-course-options">
        {operatorConfig.courses.map((course) => {
          const key = courseKey(course);
          const enabled = preferences[key] === true;
          return (
            <label key={key}>
              <input
                type="checkbox"
                checked={enabled}
                disabled={busyCourse === key || (!enabled && !canEnable)}
                onChange={(event) => changePreference(course, event.target.checked)}
              />
              <span>{course.course_name}</span>
            </label>
          );
        })}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

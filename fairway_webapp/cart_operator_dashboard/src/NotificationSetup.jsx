import React, { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle, Smartphone } from 'lucide-react';
import { operatorRequest } from './lib/operator';

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function NotificationSetup({ user, apiBaseUrl, operatorConfig }) {
  const [state, setState] = useState('checking');
  const [error, setError] = useState('');
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const installed = isInstalled();

  async function registerWithBackend(subscription) {
    await Promise.all(operatorConfig.courses.map((course) => operatorRequest(
      user,
      apiBaseUrl,
      '/api/v1/operator/push-subscriptions',
      {
        method: 'POST',
        body: { course_id: course.course_id, subscription: subscription.toJSON() },
      }
    )));
  }

  useEffect(() => {
    let active = true;
    if (!supported || !installed) {
      setState(supported ? 'install_required' : 'unsupported');
      return () => { active = false; };
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!active) return;
        if (!subscription) {
          setState(Notification.permission === 'denied' ? 'denied' : 'ready');
          return;
        }
        await registerWithBackend(subscription);
        if (active) setState('enabled');
      })
      .catch((reason) => {
        if (active) {
          setError(reason.message);
          setState('error');
        }
      });
    return () => { active = false; };
  }, [apiBaseUrl, installed, operatorConfig, supported, user]);

  async function enable() {
    setState('enabling');
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'ready');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(operatorConfig.push.vapid_public_key),
      });
      await registerWithBackend(subscription);
      setState('enabled');
    } catch (reason) {
      setError(reason.message);
      setState('error');
    }
  }

  if (state === 'enabled') {
    return <div className="notification-setup notification-ok"><CheckCircle size={18} /><span>Notifications enabled for {operatorConfig.courses.map((course) => course.course_name).join(', ')}</span></div>;
  }
  if (state === 'install_required') {
    return <div className="notification-setup"><Smartphone size={18} /><span>Add Fairway to the Home Screen, then open the installed app to enable notifications.</span></div>;
  }
  if (state === 'unsupported') {
    return <div className="notification-setup notification-error"><BellOff size={18} /><span>Web Push is unavailable on this device.</span></div>;
  }
  if (state === 'denied') {
    return <div className="notification-setup notification-error"><BellOff size={18} /><span>Notifications are blocked. Allow Fairway in iPhone Settings.</span></div>;
  }

  return <div className={`notification-setup ${state === 'error' ? 'notification-error' : ''}`}><Bell size={18} /><span>{error || 'Receive new golfer requests when Fairway is closed.'}</span><button type="button" onClick={enable} disabled={state === 'checking' || state === 'enabling'}>{state === 'enabling' ? 'Enabling...' : 'Enable notifications'}</button></div>;
}
import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { inventoryRefreshBlocker } from './InventorySession';
import './appRefresh.css';

export default function AppRefresh({ user, getBlockReason, className }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const currentGuard = useRef(getBlockReason);
  currentGuard.current = getBlockReason;

  function verifySafe() {
    const reason = currentGuard.current?.() || inventoryRefreshBlocker(user);
    if (reason) throw new Error(reason);
  }

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError('');
    let timer;
    try {
      verifySafe();
      setChecking(true);
      const controller = new AbortController();
      timer = window.setTimeout(() => controller.abort(), 15000);
      const response = await fetch(window.location.href, {
        cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
      });
      if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('text/html')) {
        throw new Error('Unable to retrieve the application. Check your connection and try again.');
      }
      await response.text();
      verifySafe();
      window.location.reload();
    } catch (reason) {
      setError(reason.name === 'AbortError'
        ? 'Refresh timed out. Your current session is unchanged. Check your connection and try again.'
        : `App not refreshed: ${reason.message}`);
    } finally {
      window.clearTimeout(timer);
      inFlight.current = false;
      setChecking(false);
    }
  }

  return <div className="app-refresh">
    <button className={className} type="button" onClick={refresh} disabled={checking}
      aria-label="Refresh App" title="Refresh App" aria-busy={checking}>
      <RefreshCw size={18} aria-hidden="true" />
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import MenuCategoryGrid from './MenuCategoryGrid';
import { publicMenuRequest } from './lib/inventoryApi.mjs';
import { groupPublishedProducts } from './lib/inventoryModel.mjs';
// Trimmed web derivative of docs/logo_source_files/fairway-refresh/fairway-refresh-horizontal-transparent.png.
import fairwayRefreshLogo from './assets/fairway-refresh-horizontal-web.png';
import './bayRequest.css';

const MENU_STATES = ['ready', 'submitting', 'retry', 'accepted', 'declined'];

function BayBanner({ bay }) {
  return <header className="bay-banner">
    <div className="bb-text">
      <p>Bar and Restaurant service</p>
      {bay?.course_name && <p>At the {bay.course_name}</p>}
    </div>
    <div className="bb-power"><span>powered by</span><img src={fairwayRefreshLogo} alt="Fairway Refresh" /></div>
  </header>;
}

export default function BayRequestApp({ apiBaseUrl, menuApiBaseUrl = apiBaseUrl, bayId, sandbox = false }) {
  const [bay, setBay] = useState(null);
  const [menu, setMenu] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const operation = useRef(null);
  const storageKey = `fairway.bay.submission.${bayId}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBaseUrl}/api/v1/public/bays/${encodeURIComponent(bayId)}`, {
      signal: controller.signal, cache: 'no-store',
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load this bay.');
      if (typeof result.available !== 'boolean') {
        throw new Error('Unable to verify Driving Range service availability.');
      }
      setBay(result);
      operation.current = sessionStorage.getItem(storageKey);
      setState(!result.available ? 'suspended' : operation.current ? 'retry' : 'ready');
    }).catch((reason) => {
      if (reason.name !== 'AbortError') { setError(reason.message); setState('error'); }
    });
    return () => controller.abort();
  }, [apiBaseUrl, bayId, storageKey]);

  // The Customer's restaurant menu is optional context: any failure hides it
  // without affecting the request flow.
  const menuSlug = bay?.available ? bay.restaurant_menu_slug : null;
  useEffect(() => {
    setMenu(null);
    if (typeof menuSlug !== 'string' || !menuSlug) return undefined;
    const controller = new AbortController();
    publicMenuRequest(menuApiBaseUrl, menuSlug, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted && result && Array.isArray(result.products) &&
          (result.categories == null || Array.isArray(result.categories))) setMenu(result);
    }).catch(() => {});
    return () => controller.abort();
  }, [menuApiBaseUrl, menuSlug]);
  const categories = useMemo(() => {
    try { return menu ? groupPublishedProducts(menu.products, menu.categories || []) : []; } catch { return []; }
  }, [menu]);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError('');
    setState('submitting');
    try {
      if (!operation.current) {
        operation.current = crypto.randomUUID();
        sessionStorage.setItem(storageKey, operation.current);
      }
      const response = await fetch(`${apiBaseUrl}/api/v1/public/bays/${encodeURIComponent(bayId)}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation_id: operation.current }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setState('unavailable'); setError(result.error); return; }
        throw new Error(result.error || 'Unable to confirm your request.');
      }
      setState('accepted');
      sessionStorage.removeItem(storageKey);
    } catch (reason) {
      setError(`Your request has not been confirmed. ${reason.message} Retry to check the same submission.`);
      setState('retry');
    } finally {
      inFlight.current = false;
    }
  }

  const bayName = bay && <h1 className="bay-name">Bay {bay.bay_number}{bay.bay_side || ''}</h1>;

  if (state === 'suspended') {
    return <main className="bay-page bay-suspended">
      <BayBanner bay={bay} />
      <section className="bay-card bay-closed" role="status">
        <h2 className="bay-q">Sorry, we are outside of service hours.</h2>
      </section>
      <p className="bay-close-note">You may close this window.</p>
    </main>;
  }

  return <main className="bay-page">
    <BayBanner bay={bay} />
    {sandbox && <p className="bay-test">SANDBOX TEST — NOT FOR PRODUCTION</p>}
    <div className="bay-card">
      {state === 'loading' && <p role="status">Loading bay…</p>}
      {['ready', 'submitting', 'retry'].includes(state) && <>
        <h2 className="bay-q">Would you like a server from the restaurant to come and take your order?</h2>
        {bayName}
        <div className="bay-actions"><button type="button" disabled={state === 'submitting'} onClick={submit}>
          {state === 'submitting' ? 'Sending…' : state === 'retry' ? 'Retry request' : 'Yes'}
        </button>{state === 'ready' && <button type="button" onClick={() => setState('declined')}>No</button>}</div>
      </>}
      {state === 'accepted' && <section className="bay-confirmation" role="status">
        <h2 className="bay-q">Thank you!</h2>
        {bayName}
        <div className="bay-done">
          <p>A server will visit your bay shortly.</p>
          <p className="bay-close">You can close this browser tab.</p>
        </div>
      </section>}
      {state === 'declined' && <section className="bay-confirmation" role="status">
        <h2 className="bay-q">No service request was sent.</h2>
        {bayName}
        <div className="bay-done"><p className="bay-close">You can close this browser tab.</p></div>
      </section>}
      {state === 'unavailable' && <section role="status">
        <h2 className="bay-q">Server requests are currently unavailable.</h2>
        {bayName}
        <p>Please visit the restaurant.</p>
      </section>}
      {state === 'error' && bayName}
      {error && <p className="bay-error" role="alert">{error}</p>}
      {['unavailable', 'error'].includes(state) &&
        <button className="bay-reload" type="button" onClick={() => window.location.reload()}>Reload bay page</button>}
    </div>
    {MENU_STATES.includes(state) && categories.length > 0 && <section className="bay-menu" aria-label="Restaurant menu">
      <h2 className="bay-sub-bar"><span>Restaurant Menu</span><i aria-hidden="true" /><span>Order from Server only</span></h2>
      <MenuCategoryGrid categories={categories} />
    </section>}
  </main>;
}

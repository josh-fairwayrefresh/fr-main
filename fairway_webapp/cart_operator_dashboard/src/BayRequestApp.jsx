import React, { useEffect, useRef, useState } from 'react';
import './bayRequest.css';

export default function BayRequestApp({ apiBaseUrl, bayId, sandbox = false }) {
  const [bay, setBay] = useState(null);
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
      setBay(result);
      operation.current = sessionStorage.getItem(storageKey);
      setState(operation.current ? 'retry' : result.available ? 'ready' : 'unavailable');
    }).catch((reason) => {
      if (reason.name !== 'AbortError') { setError(reason.message); setState('error'); }
    });
    return () => controller.abort();
  }, [apiBaseUrl, bayId, storageKey]);

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

  return <main className="bay-page">
    <img src="/icons/logo-and-name-row-banner.jpg" alt="Fairway Refresh" />
    {sandbox && <p className="bay-test">SANDBOX TEST — NOT FOR PRODUCTION</p>}
    {bay && <><p>{bay.course_name}</p><h1>Bay {bay.bay_number}{bay.bay_side || ''}</h1></>}
    {state === 'loading' && <p role="status">Loading bay…</p>}
    {state === 'retry' && bay && !bay.available && <p role="status">Server requests are currently unavailable. You can still check your earlier submission.</p>}
    {['ready', 'submitting', 'retry'].includes(state) && <>
      <h2>Would you like a server to come and take your order?</h2>
      <div className="bay-actions"><button type="button" disabled={state === 'submitting'} onClick={submit}>
        {state === 'submitting' ? 'Sending…' : state === 'retry' ? 'Retry request' : 'Yes'}
      </button>{state === 'ready' && <button type="button" onClick={() => setState('declined')}>No</button>}</div>
    </>}
    {state === 'accepted' && <section className="bay-confirmation" role="status">
      <h2>Thank you!</h2>
      <p>A server will visit your bay shortly.</p>
      <p>You can close this browser tab.</p>
    </section>}
    {state === 'declined' && <section className="bay-confirmation" role="status">
      <h2>No service request was sent.</h2>
      <p>You can close this browser tab.</p>
    </section>}
    {state === 'unavailable' && <section role="status"><h2>Server requests are currently unavailable.</h2><p>Please visit the restaurant.</p></section>}
    {error && <p role="alert">{error}</p>}
    {['unavailable', 'error'].includes(state) &&
      <button type="button" onClick={() => window.location.reload()}>Reload bay page</button>}
  </main>;
}

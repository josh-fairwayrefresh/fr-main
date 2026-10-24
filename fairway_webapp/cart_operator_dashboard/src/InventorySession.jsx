import React, { useEffect, useRef, useState } from 'react';
import { inventoryRequest } from './lib/inventoryApi.mjs';
import { usdPriceFromInput } from './lib/inventoryModel.mjs';
import './inventorySession.css';

export function inventoryCoursePath(course, suffix = '') {
  return `/api/v1/inventory/courses/${encodeURIComponent(course.customer_id)}/${encodeURIComponent(course.course_id)}${suffix}`;
}

export function useInventorySession(user, apiBaseUrl, course) {
  const key = user && course ? `inventory-session:${user.uid}:${course.customer_id}:${course.course_id}` : '';
  const [state, setState] = useState({ key: '', shift: null, staff: [], error: '', ready: false });
  const [choosing, setChoosing] = useState(false);
  const [, setPendingVersion] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const continuation = useRef(null);
  const requestInFlight = useRef(false);
  const loadVersion = useRef(0);
  const currentKey = useRef(key);
  currentKey.current = key;
  const stored = key ? JSON.parse(sessionStorage.getItem(key) || 'null') : null;
  const sessionId = stored?.session_id;
  const value = state.key === key ? state : { shift: null, staff: [], error: '', ready: false };

  function storeSession() {
    const existing = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (existing) return existing;
    const session = { session_id: crypto.randomUUID(), pending: {} };
    sessionStorage.setItem(key, JSON.stringify(session));
    return session;
  }

  async function load() {
    if (!key) return;
    const version = ++loadVersion.current;
    const session = storeSession();
    const [directory, selected] = await Promise.all([
      inventoryRequest(user, apiBaseUrl, inventoryCoursePath(course, '/staff')),
      inventoryRequest(user, apiBaseUrl, inventoryCoursePath(course, `/shifts/session?session_id=${encodeURIComponent(session.session_id)}`)),
    ]);
    if (currentKey.current !== key || version !== loadVersion.current) return;
    const latest = storeSession();
    const closingUncertain = Object.keys(latest.pending || {}).some(signature => JSON.parse(signature)[1].endsWith('/close'));
    const shift = selected.shift || (closingUncertain ? latest.shift : null);
    latest.shift = shift;
    sessionStorage.setItem(key, JSON.stringify(latest));
    setState({ key, staff: directory.staff, shift, error: '', ready: true });
  }

  useEffect(() => {
    setChoosing(false);
    if (continuation.current) continuation.current.reject(new Error('Course or account changed. Please retry the action.'));
    continuation.current = null;
    if (!key) return;
    const refresh = () => load().catch(error => {
      if (currentKey.current === key) setState({ key, staff: [], shift: null, error: error.message, ready: false });
    });
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [key, apiBaseUrl]);

  async function submitRequest(suffix, body, method, requireShift, shift) {
    if (!navigator.onLine) throw new Error('Connectivity is required. Nothing has been submitted.');
    const session = storeSession();
    const payload = { ...body, ...(requireShift ? { shift_id: shift.shift_id } : {}) };
    const signature = JSON.stringify([method, suffix, payload]);
    const pendingEntries = Object.entries(session.pending || {});
    const unresolved = pendingEntries.find(([other]) => other !== signature);
    if (unresolved) throw new Error('A previous submission is unresolved. Retry that unchanged action before starting another.');
    const operationId = session.pending?.[signature] || crypto.randomUUID();
    session.pending = { ...session.pending, [signature]: operationId };
    sessionStorage.setItem(key, JSON.stringify(session));
    setPendingVersion(version => version + 1);
    try {
      const result = await inventoryRequest(user, apiBaseUrl, inventoryCoursePath(course, suffix), {
        method, body: { ...payload, operation_id: operationId },
      });
      delete session.pending[signature];
      sessionStorage.setItem(key, JSON.stringify(session));
      setPendingVersion(version => version + 1);
      if (requireShift && currentKey.current === key) setState(previous => ({
        ...previous, shift: { ...shift, has_activity: true },
      }));
      if (requireShift) {
        session.shift = { ...shift, has_activity: true };
        sessionStorage.setItem(key, JSON.stringify(session));
      }
      return result;
    } catch (error) {
      if (error.status && error.status < 500) {
        delete session.pending[signature];
        sessionStorage.setItem(key, JSON.stringify(session));
        setPendingVersion(version => version + 1);
      } else {
        error.message = `${error.message} Submission is not confirmed; retry the same action to resolve it safely.`;
      }
      throw error;
    }
  }

  async function request(suffix, body = {}, method = 'POST', requireShift = true) {
    if (requestInFlight.current) throw new Error('Wait for the current submission before continuing.');
    let shift = value.shift;
    if (requireShift && !shift) {
      if (!value.ready) throw new Error(value.error || 'Staff context is still loading. Please retry.');
      if (continuation.current) throw new Error('Select an operator to finish the current action first.');
      setChoosing(true);
      shift = await new Promise((resolve, reject) => { continuation.current = { resolve, reject }; });
      if (currentKey.current !== key) throw new Error('Course changed. Please retry.');
    }
    requestInFlight.current = true;
    setSubmitting(true);
    try { return await submitRequest(suffix, body, method, requireShift, shift); }
    finally { requestInFlight.current = false; setSubmitting(false); }
  }

  async function select(staffId, name) {
    let id = staffId;
    if (id === 'custom') {
      const person = await request('/staff', { name }, 'POST', false);
      id = person.staff_id;
    }
    const result = await request('/shifts/select', {
      session_id: storeSession().session_id, staff_id: id,
    }, 'POST', false);
    const shift = result.shift;
    if (!shift) throw new Error('The server did not confirm the selected shift.');
    const selectedSession = storeSession();
    selectedSession.shift = shift;
    sessionStorage.setItem(key, JSON.stringify(selectedSession));
    await load();
    setChoosing(false);
    continuation.current?.resolve(shift);
    continuation.current = null;
  }

  async function close(amount) {
    const parsed = usdPriceFromInput(amount);
    if (parsed.error || !parsed.price) throw new Error(parsed.error || 'Enter the shift total in dollars.');
    await request(`/shifts/${encodeURIComponent(value.shift.shift_id)}/close`, {
      session_id: storeSession().session_id, amount_minor: parsed.price.amount_minor,
    }, 'POST', false);
    const closedSession = storeSession();
    closedSession.shift = null;
    closedSession.close_amount = '';
    sessionStorage.setItem(key, JSON.stringify(closedSession));
    if (currentKey.current === key) {
      loadVersion.current++;
      setChoosing(false);
      if (continuation.current) continuation.current.reject(new Error('Shift closed. Start a new action to select an operator.'));
      continuation.current = null;
      setState(previous => ({ ...previous, shift: null }));
    }
  }

  async function resolvePending() {
    if (requestInFlight.current) throw new Error('Wait for the current submission before retrying.');
    const session = storeSession();
    const entry = Object.entries(session.pending || {})[0];
    if (!entry) return;
    const [signature, operationId] = entry;
    const [method, suffix, payload] = JSON.parse(signature);
    requestInFlight.current = true;
    try {
      await inventoryRequest(user, apiBaseUrl, inventoryCoursePath(course, suffix), {
        method, body: { ...payload, operation_id: operationId },
      });
    } catch (error) {
      if (error.status && error.status < 500) {
        delete session.pending[signature];
        sessionStorage.setItem(key, JSON.stringify(session));
        setPendingVersion(version => version + 1);
      }
      throw error;
    } finally { requestInFlight.current = false; }
    delete session.pending[signature];
    if (suffix.endsWith('/close')) session.close_amount = '';
    sessionStorage.setItem(key, JSON.stringify(session));
    setPendingVersion(version => version + 1);
    await load();
    window.dispatchEvent(new Event('inventory-updated'));
  }

  return {
    ...value, sessionId, request, select, close, choosing, resolvePending, submitting,
    closeDraft: stored?.close_amount || '',
    saveCloseDraft: amount => {
      const session = storeSession();
      session.close_amount = amount;
      sessionStorage.setItem(key, JSON.stringify(session));
      setPendingVersion(version => version + 1);
    },
    unresolved: Object.keys(stored?.pending || {}).length > 0,
    pendingCloseAmount: (() => {
      const entry = Object.keys(stored?.pending || {}).map(signature => JSON.parse(signature)).find(([, suffix]) => suffix.endsWith('/close'));
      return entry ? (entry[2].amount_minor / 100).toFixed(2) : null;
    })(),
    choose: () => setChoosing(true), reload: load,
    cancel: () => {
      setChoosing(false);
      continuation.current?.reject(new Error('Select an operator before continuing.'));
      continuation.current = null;
    },
  };
}

export function InventorySessionControls({ session, actions }) {
  const [staffId, setStaffId] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [closing, setClosing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  useEffect(() => {
    if (session.pendingCloseAmount !== null && session.shift) {
      setClosing(true);
      setAmount(session.pendingCloseAmount);
    }
  }, [session.pendingCloseAmount, session.shift?.shift_id]);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || (!closing && !session.choosing)) return;
    submitting.current = true;
    setPending(true); setError('');
    try {
      if (closing) { await session.close(amount); setClosing(false); setAmount(''); }
      else await session.select(staffId, name);
    } catch (reason) { setError(reason.message); }
    finally { submitting.current = false; setPending(false); }
  }
  return <div className="inventory-session">
    <span>Operator: <strong>{session.shift?.staff_name || 'Not selected'}</strong></span>
    <div className="inventory-session-actions"><button className={session.shift?.has_activity ? 'inventory-close-out' : undefined} type="button" disabled={!session.ready || pending || session.submitting || session.unresolved} onClick={() => {
      setError(''); setClosing(Boolean(session.shift?.has_activity));
      setAmount(session.closeDraft);
      if (!session.shift?.has_activity) session.choose();
    }}>{session.shift?.has_activity ? <><span>Close out</span><span>Enter final sales</span></> : 'Select operator'}</button>
    {actions}</div>
    {session.unresolved && <button type="button" disabled={pending} onClick={async () => {
      setPending(true); setError('');
      try { await session.resolvePending(); setClosing(false); setAmount(''); }
      catch (reason) { setError(`Submission remains unconfirmed: ${reason.message}`); }
      finally { setPending(false); }
    }}>Resolve last submission</button>}
    {session.error && <span role="alert">{session.error} <button type="button" onClick={() => session.reload().catch(reason => setError(reason.message))}>Retry staff</button></span>}
    {(session.choosing || closing) && <div className="inventory-session-overlay"><section role="dialog" aria-modal="true" aria-labelledby="inventory-session-title">
      <h2 id="inventory-session-title">{closing ? 'Close shift' : 'Select operator'}</h2>
      <form onSubmit={submit}>
        {closing ? <><p>Close {session.shift?.staff_name}’s shift before selecting another operator. Stock and today’s sales remain unchanged.</p><label>Total sales ($)<input autoFocus type="number" min="0" step="0.01" required value={amount} onChange={event => { setAmount(event.target.value); session.saveCloseDraft(event.target.value); }} disabled={pending} /></label></> : <>
          <label>Staff name<select required value={staffId} onChange={event => setStaffId(event.target.value)} disabled={pending}><option value="">Select a name</option>{session.staff.filter(person => person.active !== false).map(person => <option key={person.staff_id} value={person.staff_id}>{person.name}</option>)}<option value="custom">Custom</option></select></label>
          {staffId === 'custom' && <label>New name<input autoFocus required maxLength="160" value={name} onChange={event => setName(event.target.value)} disabled={pending} /></label>}
        </>}
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" disabled={pending} onClick={() => { setClosing(false); session.cancel(); }}>Cancel</button><button type="submit" disabled={pending}>{pending ? 'Submitting…' : closing ? 'Submit shift total' : 'Confirm operator'}</button></footer>
      </form>
    </section></div>}
    {!session.choosing && !closing && error && <p role="alert">{error}</p>}
  </div>;
}

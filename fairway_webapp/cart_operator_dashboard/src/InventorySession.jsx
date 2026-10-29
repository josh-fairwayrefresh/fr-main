import React, { useEffect, useRef, useState } from 'react';
import { inventoryRequest } from './lib/inventoryApi.mjs';
import { usdPriceFromInput } from './lib/inventoryModel.mjs';
import './inventorySession.css';

export function inventoryCoursePath(course, suffix = '') {
  return `/api/v1/inventory/courses/${encodeURIComponent(course.customer_id)}/${encodeURIComponent(course.course_id)}${suffix}`;
}

const SESSION_CHANGED = 'inventory-session-changed';

export function useInventorySession(user, apiBaseUrl, course) {
  const key = user && course ? `inventory-session:${user.uid}:${course.customer_id}:${course.course_id}` : '';
  const [state, setState] = useState({ key: '', staff: [], error: '', ready: false });
  const [choosing, setChoosing] = useState(false);
  const [, setPendingVersion] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const continuation = useRef(null);
  const requestInFlight = useRef(false);
  const loadVersion = useRef(0);
  const lifetime = useRef(0);
  const currentKey = useRef(key);
  currentKey.current = key;
  const stored = key ? JSON.parse(sessionStorage.getItem(key) || 'null') : null;
  const sessionId = stored?.session_id;
  const value = {
    ...(state.key === key ? state : { staff: [], error: '', ready: false }),
    shift: stored?.shift || null,
  };

  function storeSession() {
    const existing = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (existing) return existing;
    const session = { session_id: crypto.randomUUID(), pending: {} };
    sessionStorage.setItem(key, JSON.stringify(session));
    return session;
  }

  function updateSession(update) {
    const latest = storeSession();
    const previousShift = latest.shift;
    update(latest);
    latest.revision = (latest.revision || 0) + 1;
    sessionStorage.setItem(key, JSON.stringify(latest));
    window.dispatchEvent(new CustomEvent(SESSION_CHANGED, {
      detail: { key, closed: Boolean(previousShift && !latest.shift) },
    }));
  }

  async function load() {
    if (!key) return;
    const version = ++loadVersion.current;
    const started = lifetime.current;
    const session = storeSession();
    const [directory, selected] = await Promise.allSettled([
      inventoryRequest(user, apiBaseUrl, inventoryCoursePath(course, '/staff')),
      inventoryRequest(user, apiBaseUrl, inventoryCoursePath(course, `/shifts/session?session_id=${encodeURIComponent(session.session_id)}`)),
    ]);
    if (currentKey.current !== key || started !== lifetime.current || version !== loadVersion.current) return;
    const latest = storeSession();
    // A read begun before a local transition cannot undo it, including on remount.
    if ((latest.revision || 0) === (session.revision || 0) &&
        selected.status === 'fulfilled' && !Object.keys(latest.pending || {}).length) {
      updateSession(record => { record.shift = selected.value.shift || null; });
    }
    const failures = [directory, selected].filter(result => result.status === 'rejected');
    setState({
      key, staff: directory.status === 'fulfilled' ? directory.value.staff : [],
      error: failures.map(result => result.reason.message).join(' '),
      ready: failures.length === 0,
    });
  }

  useEffect(() => {
    lifetime.current++;
    setChoosing(false);
    setSubmitting(false);
    if (continuation.current) continuation.current.reject(new Error('Course or account changed. Please retry the action.'));
    continuation.current = null;
    if (!key) return;
    const refresh = () => { void load(); };
    const changed = event => {
      if (event.detail.key !== key) return;
      setPendingVersion(version => version + 1);
      if (event.detail.closed) {
        setChoosing(false);
        continuation.current?.reject(new Error('Shift closed. Start a new action to select an operator.'));
        continuation.current = null;
      }
    };
    window.addEventListener(SESSION_CHANGED, changed);
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      lifetime.current++;
      loadVersion.current++;
      continuation.current?.reject(new Error('Course or page changed. Please retry the action.'));
      continuation.current = null;
      window.removeEventListener(SESSION_CHANGED, changed);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [key, apiBaseUrl]);

  function finishOperation(signature, operationId, result) {
    const [, suffix, payload] = JSON.parse(signature);
    if (suffix === '/shifts/select' && !result.shift) throw new Error('The server did not confirm the selected shift. Retry the same submission.');
    updateSession(latest => {
      if (latest.pending?.[signature] !== operationId) return;
      delete latest.pending[signature];
      if (suffix === '/shifts/select') latest.shift = result.shift;
      else if (suffix.endsWith('/close') && suffix === `/shifts/${encodeURIComponent(latest.shift?.shift_id)}/close`) {
        latest.shift = null;
        latest.close_amount = '';
      } else if (payload.shift_id && latest.shift?.shift_id === payload.shift_id) {
        latest.shift = { ...latest.shift, has_activity: true };
      }
    });
  }

  async function submitRequest(suffix, body, method, requireShift, shift) {
    if (!navigator.onLine) throw new Error('Connectivity is required. Nothing has been submitted.');
    const session = storeSession();
    const payload = { ...body, ...(requireShift ? { shift_id: shift.shift_id } : {}) };
    const signature = JSON.stringify([method, suffix, payload]);
    const pendingEntries = Object.entries(session.pending || {});
    const unresolved = pendingEntries.find(([other]) => other !== signature);
    if (unresolved) throw new Error('A previous submission is unresolved. Retry that unchanged action before starting another.');
    const operationId = session.pending?.[signature] || crypto.randomUUID();
    updateSession(latest => { latest.pending = { ...latest.pending, [signature]: operationId }; });
    try {
      const result = await inventoryRequest(user, apiBaseUrl, inventoryCoursePath(course, suffix), {
        method, body: { ...payload, operation_id: operationId },
      });
      finishOperation(signature, operationId, result);
      return result;
    } catch (error) {
      if (error.status && error.status < 500) {
        if (suffix.endsWith('/close')) {
          error.message = `${error.message} Close out was not completed; the operator, amount and retry identity are retained.`;
        } else {
          updateSession(latest => {
            if (latest.pending?.[signature] === operationId) delete latest.pending[signature];
          });
        }
      } else {
        error.message = `${error.message} Submission is not confirmed; retry the same action to resolve it safely.`;
      }
      throw error;
    }
  }

  async function request(suffix, body = {}, method = 'POST', requireShift = true) {
    if (requestInFlight.current) throw new Error('Wait for the current submission before continuing.');
    const started = lifetime.current;
    let shift = storeSession().shift;
    if (requireShift && !shift) {
      if (!value.ready) throw new Error(value.error || 'Staff context is still loading. Please retry.');
      if (continuation.current) throw new Error('Select an operator to finish the current action first.');
      setChoosing(true);
      shift = await new Promise((resolve, reject) => { continuation.current = { resolve, reject }; });
      if (currentKey.current !== key || started !== lifetime.current) throw new Error('Course or page changed. Please retry.');
    }
    requestInFlight.current = true;
    setSubmitting(true);
    try { return await submitRequest(suffix, body, method, requireShift, shift); }
    finally {
      requestInFlight.current = false;
      if (currentKey.current === key && started === lifetime.current) setSubmitting(false);
    }
  }

  async function select(staffId, name) {
    const started = lifetime.current;
    let id = staffId;
    if (id === 'custom') {
      const person = await request('/staff', { name }, 'POST', false);
      id = person.staff_id;
    }
    if (currentKey.current !== key || started !== lifetime.current) throw new Error('Course or page changed. Please retry.');
    const result = await request('/shifts/select', {
      session_id: storeSession().session_id, staff_id: id,
    }, 'POST', false);
    const shift = result.shift;
    if (!shift) throw new Error('The server did not confirm the selected shift.');
    if (currentKey.current !== key || started !== lifetime.current) return;
    setChoosing(false);
    continuation.current?.resolve(shift);
    continuation.current = null;
  }

  async function close(amount) {
    const parsed = usdPriceFromInput(amount);
    if (parsed.error || !parsed.price) throw new Error(parsed.error || 'Enter the shift total in dollars.');
    const shift = storeSession().shift;
    if (!shift) throw new Error('No operator shift is selected.');
    await request(`/shifts/${encodeURIComponent(shift.shift_id)}/close`, {
      session_id: storeSession().session_id, amount_minor: parsed.price.amount_minor,
    }, 'POST', false);
  }

  async function resolvePending() {
    if (requestInFlight.current) throw new Error('Wait for the current submission before retrying.');
    const session = storeSession();
    const entry = Object.entries(session.pending || {})[0];
    if (!entry) return;
    const [signature, operationId] = entry;
    const [method, suffix, payload] = JSON.parse(signature);
    const started = lifetime.current;
    requestInFlight.current = true;
    setSubmitting(true);
    try {
      const result = await inventoryRequest(user, apiBaseUrl, inventoryCoursePath(course, suffix), {
        method, body: { ...payload, operation_id: operationId },
      });
      finishOperation(signature, operationId, result);
    } catch (error) {
      if (error.status && error.status < 500 && !suffix.endsWith('/close')) {
        updateSession(latest => {
          if (latest.pending?.[signature] === operationId) delete latest.pending[signature];
        });
      }
      throw error;
    } finally {
      requestInFlight.current = false;
      if (currentKey.current === key && started === lifetime.current) setSubmitting(false);
    }
    if (currentKey.current === key && started === lifetime.current) await load();
    window.dispatchEvent(new Event('inventory-updated'));
  }

  return {
    ...value, sessionId, request, select, close, choosing, resolvePending, submitting,
    isSubmitting: () => requestInFlight.current,
    closeDraft: stored?.close_amount || '',
    saveCloseDraft: amount => {
      updateSession(session => { session.close_amount = amount; });
    },
    unresolved: Object.keys(stored?.pending || {}).length > 0,
    pendingCloseAmount: (() => {
      const entry = Object.keys(stored?.pending || {}).map(signature => JSON.parse(signature)).find(([, suffix]) => suffix.endsWith('/close'));
      if (!entry) return null;
      const draft = usdPriceFromInput(stored?.close_amount || '');
      return draft.price?.amount_minor === entry[2].amount_minor
        ? stored.close_amount : (entry[2].amount_minor / 100).toFixed(2);
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
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  useEffect(() => {
    if (!session.shift) {
      setClosing(false);
      setConfirmingClose(false);
      setAmount('');
      return;
    }
    if (session.pendingCloseAmount !== null && session.shift) {
      setClosing(true);
      setAmount(session.pendingCloseAmount);
    }
  }, [session.pendingCloseAmount, session.shift?.shift_id]);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || (!closing && !session.choosing)) return;
    if (closing && !confirmingClose) {
      const parsed = usdPriceFromInput(amount);
      if (parsed.error || !parsed.price) { setError(parsed.error || 'Enter the shift total in dollars.'); return; }
      setError('');
      setConfirmingClose(true);
      return;
    }
    submitting.current = true;
    setPending(true); setError('');
    try {
      if (closing) { await session.close(amount); setClosing(false); setConfirmingClose(false); setAmount(''); }
      else await session.select(staffId, name);
    } catch (reason) { setError(reason.message); }
    finally { submitting.current = false; setPending(false); }
  }
  return <div className="inventory-session">
    <span>Operator: <strong>{session.shift?.staff_name || (session.error ? 'Unavailable' : session.ready ? 'Not selected' : 'Loading…')}</strong></span>
    <div className="inventory-session-actions"><button className={session.shift ? 'inventory-close-out' : undefined} type="button" disabled={(!session.shift && !session.ready) || pending || session.submitting || session.unresolved} onClick={() => {
      setError(''); setConfirmingClose(false); setClosing(Boolean(session.shift));
      setAmount(session.closeDraft);
      if (!session.shift) session.choose();
    }}>{session.shift ? <><span>Close out</span><span>Enter final sales</span></> : 'Select operator'}</button>
    {session.shift && !session.shift.has_activity && <button type="button" disabled={!session.ready || pending || session.submitting || session.unresolved} onClick={() => {
      setError(''); setClosing(false); setConfirmingClose(false); session.choose();
    }}>Change operator</button>}
    {actions}</div>
    {session.unresolved && <button type="button" disabled={pending} onClick={async () => {
      setPending(true); setError('');
      try { await session.resolvePending(); setClosing(false); setConfirmingClose(false); setAmount(''); }
      catch (reason) { setError(`Submission remains unconfirmed: ${reason.message}`); }
      finally { setPending(false); }
    }}>Resolve last submission</button>}
    {session.error && <span role="alert">{session.error} <button type="button" onClick={() => session.reload().catch(reason => setError(reason.message))}>Retry staff</button></span>}
    {(session.choosing || closing) && <div className="inventory-session-overlay"><section role="dialog" aria-modal="true" aria-labelledby="inventory-session-title">
      <h2 id="inventory-session-title">{closing ? confirmingClose ? 'Are you sure?' : 'Close shift' : 'Select operator'}</h2>
      <form onSubmit={submit}>
        {closing ? confirmingClose
          ? <p>Close {session.shift?.staff_name}’s shift with final sales of <strong>${(usdPriceFromInput(amount).price.amount_minor / 100).toFixed(2)}</strong>?</p>
          : <><p>Close {session.shift?.staff_name}’s shift before selecting another operator. Stock and today’s sales remain unchanged.</p><label>Total sales ($)<input autoFocus type="number" min="0" step="0.01" required value={amount} onChange={event => { setAmount(event.target.value); session.saveCloseDraft(event.target.value); }} disabled={pending || session.unresolved} /></label></> : <>
          <label>Staff name<select required value={staffId} onChange={event => setStaffId(event.target.value)} disabled={pending}><option value="">Select a name</option>{session.staff.filter(person => person.active !== false).map(person => <option key={person.staff_id} value={person.staff_id}>{person.name}</option>)}<option value="custom">Custom</option></select></label>
          {staffId === 'custom' && <label>New name<input autoFocus required maxLength="160" value={name} onChange={event => setName(event.target.value)} disabled={pending} /></label>}
        </>}
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" disabled={pending} onClick={() => {
          if (confirmingClose) setConfirmingClose(false);
          else { setClosing(false); session.cancel(); }
        }}>Cancel</button><button type="submit" disabled={pending}>{pending ? 'Submitting…' : closing ? confirmingClose ? 'Confirm close out' : 'Submit shift total' : 'Confirm operator'}</button></footer>
      </form>
    </section></div>}
    {!session.choosing && !closing && error && <p role="alert">{error}</p>}
  </div>;
}

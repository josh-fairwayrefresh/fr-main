import React, { useEffect, useState } from 'react';
import { adminRequest } from './adminApi';

export default function CustomerStaff({ user, apiBaseUrl, customer }) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState([]);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('cart_operator');
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const path = `/api/v1/admin/customers/${encodeURIComponent(customer.customer_id)}/staff`;
  async function load() {
    const result = await adminRequest(user, apiBaseUrl, path);
    setStaff(result.staff);
  }
  useEffect(() => {
    if (open) load().catch(reason => setError(reason.message));
  }, [open, customer.customer_id]);
  function edit(person = null) {
    setEditing(person); setName(person?.name || ''); setRole(person?.role || 'cart_operator');
    setActive(person?.active !== false); setError(''); setOperationId(crypto.randomUUID());
  }
  async function save(event) {
    event.preventDefault(); setPending(true); setError('');
    try {
      await adminRequest(user, apiBaseUrl, `${path}${editing ? `/${encodeURIComponent(editing.staff_id)}` : ''}`, {
        method: editing ? 'PATCH' : 'POST', body: { name, role, active, operation_id: operationId },
      });
      await load(); edit();
    } catch (reason) { setError(reason.message); }
    finally { setPending(false); }
  }
  return <section className="a-panel">
    <button className="a-secondary" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Staff list · {customer.customer_name}</button>
    {open && <div><p>Operational names only. Adding staff does not grant login, Course access, or Admin access. Both roles have equal operational rights.</p>
      <ul>{staff.map(person => <li key={person.staff_id}><button type="button" disabled={pending} onClick={() => edit(person)}>{person.name} · {person.role === 'fnb_management' ? 'F&B Management' : 'Cart Operator'}{person.active === false ? ' · Inactive' : ''}</button></li>)}</ul>
      <form className="a-form" onSubmit={save}><h4>{editing ? 'Edit staff' : 'Add staff'}</h4>
        <label>Name<input required maxLength="160" value={name} onChange={event => setName(event.target.value)} disabled={pending} /></label>
        <label>Role<select value={role} onChange={event => setRole(event.target.value)} disabled={pending}><option value="cart_operator">Cart Operator</option><option value="fnb_management">F&B Management</option></select></label>
        <label><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} disabled={pending} />Active</label>
        {error && <p role="alert">{error} <button type="button" onClick={() => load().catch(reason => setError(reason.message))}>Retry list</button></p>}
        <button className="a-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save staff'}</button>
        {editing && <button type="button" disabled={pending} onClick={() => edit()}>Add another person</button>}
      </form>
    </div>}
  </section>;
}

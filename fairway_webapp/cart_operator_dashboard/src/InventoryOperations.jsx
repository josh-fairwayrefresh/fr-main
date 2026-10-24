import React, { useState } from 'react';

export function StockDialog({ action, session, onSaved, onClose }) {
  const { product, kind, state } = action;
  const [amount, setAmount] = useState(kind === 'sale' ? '1' : String(product.quantity ?? 0));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const quantity = Number(amount);
    if (!Number.isSafeInteger(quantity) || quantity < (kind === 'sale' || state === 'on_cart' ? 1 : 0)) {
      setError(kind === 'sale' || state === 'on_cart' ? 'Enter a positive whole-unit quantity.' : 'Enter a whole-unit quantity of zero or more.');
      return;
    }
    setPending(true); setError('');
    try {
      await session.request(`/products/${encodeURIComponent(product.product_id)}/stock`, {
        kind,
        ...(kind === 'sale' ? { units: quantity } : {
          quantity, expected_stock_revision: product.stock_revision ?? 0,
          ...(state ? { state } : {}),
        }),
      });
      await onSaved();
      onClose();
    } catch (reason) { setError(reason.message); }
    finally { setPending(false); }
  }
  const title = kind === 'sale' ? 'Record sale' : state === 'on_cart' ? 'Load onto cart' : 'Adjust quantity';
  return <div className="inv-overlay"><section className="inv-dialog inv-small-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-stock-title">
    <header><h2 id="inv-stock-title">{title}</h2></header>
    <form onSubmit={submit}><p>{product.name}</p><p>Recorded quantity: {product.quantity ?? 0}</p>
      <label>{kind === 'sale' ? 'Units sold' : 'Quantity'}<input autoFocus type="number" min={kind === 'sale' || state === 'on_cart' ? '1' : '0'} step="1" required value={amount} onChange={event => setAmount(event.target.value)} disabled={pending} /></label>
      {kind === 'sale' && <p>Sales cannot exceed current On Cart stock. Correct the quantity first if the count is inaccurate.</p>}
      {error && <p className="inv-form-error" role="alert">{error}</p>}
      <footer><button type="button" className="inv-secondary" disabled={pending} onClick={onClose}>Cancel</button><button className="inv-primary" disabled={pending} type="submit">{pending ? 'Submitting…' : 'Confirm'}</button></footer>
    </form>
  </section></div>;
}

export function AuditDialog({ inventory, session, onSaved, onClose }) {
  const [approver, setApprover] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [snapshot] = useState(() => ({
    revision: inventory.inventory_revision,
    products: inventory.products.filter(product => !product.archived && ['on_cart', 'sold_out'].includes(product.state)),
  }));
  async function submit(event) {
    event.preventDefault(); setPending(true); setError('');
    try {
      await session.request('/audits', { inventory_revision: snapshot.revision, approver_staff_id: approver, authorized });
      await onSaved(); onClose();
    } catch (reason) { setError(reason.message); }
    finally { setPending(false); }
  }
  return <div className="inv-overlay"><section className="inv-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-audit-title">
    <header><h2 id="inv-audit-title">Confirm cart inventory audit</h2></header>
    <form onSubmit={submit}>
      <p>Entire cart at revision {snapshot.revision}. In Inventory and archived products are excluded.</p>
      <ul>{snapshot.products.map(product => <li key={product.product_id}>{product.name} · {product.state === 'sold_out' ? 'Sold Out' : 'On Cart'} · Quantity {product.quantity ?? 0}</li>)}</ul>
      <label>Approver<select required value={approver} onChange={event => setApprover(event.target.value)} disabled={pending}><option value="">Select approver</option>{session.staff.filter(person => person.active !== false).map(person => <option key={person.staff_id} value={person.staff_id}>{person.name}</option>)}</select></label>
      <label><input type="checkbox" required checked={authorized} onChange={event => setAuthorized(event.target.checked)} disabled={pending} />Confirm you are authorized to approve this inventory count audit.</label>
      {error && <p className="inv-form-error" role="alert">{error}</p>}
      <footer><button className="inv-secondary" type="button" disabled={pending} onClick={onClose}>Cancel</button><button className="inv-primary" type="submit" disabled={pending || !authorized}>{pending ? 'Submitting…' : 'Confirm audit'}</button></footer>
    </form>
  </section></div>;
}

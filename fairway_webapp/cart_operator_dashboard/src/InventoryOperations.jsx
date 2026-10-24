import React, { useRef, useState } from 'react';
import QuantityInput from './QuantityInput';

export function StockDialog({ action, session, onSaved, onRefresh, onClose }) {
  const { kind, state, remaining = false } = action;
  const [product, setProduct] = useState(action.product);
  const minimum = kind === 'sale' || state === 'on_cart' ? 1 : 0;
  const [amount, setAmount] = useState(kind === 'sale' ? '1' : String(Math.max(minimum, product.quantity ?? 0)));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const submitting = useRef(false);
  async function refreshConfirmation() {
    setPending(true);
    try {
      const snapshot = await onRefresh();
      if (!snapshot) throw new Error('Inventory could not be loaded. Retry refresh before confirming.');
      const current = snapshot?.products.find(item => item.product_id === product.product_id);
      if (!current || current.archived || !['on_cart', 'in_inventory'].includes(current.state) || current.quantity <= 0) {
        setError('No remaining stock is available to sell. Cancel and review the refreshed inventory.');
        return;
      }
      setProduct(current);
      setNeedsRefresh(false);
      setError('Stock refreshed. Review the remaining units and confirm again.');
    } catch (reason) { setError(`Unable to refresh confirmation: ${reason.message}`); }
    finally { setPending(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || needsRefresh) return;
    const quantity = remaining ? product.quantity : Number(amount);
    if (!Number.isSafeInteger(quantity) || quantity < (kind === 'sale' || state === 'on_cart' ? 1 : 0)) {
      setError(kind === 'sale' || state === 'on_cart' ? 'Enter a positive whole-unit quantity.' : 'Enter a whole-unit quantity of zero or more.');
      return;
    }
    submitting.current = true;
    setPending(true); setError('');
    try {
      await session.request(`/products/${encodeURIComponent(product.product_id)}/stock`, {
        kind,
        ...(kind === 'sale' ? { units: quantity, ...(remaining ? { state: 'sold_out', expected_stock_revision: product.stock_revision ?? 0 } : {}) } : {
          quantity, expected_stock_revision: product.stock_revision ?? 0,
          ...(state ? { state } : {}),
        }),
      });
      await onSaved();
      onClose();
    } catch (reason) {
      submitting.current = false;
      setError(reason.message);
      if (remaining && reason.status === 409) setNeedsRefresh(true);
    }
    finally { setPending(false); }
  }
  const title = remaining ? 'Confirm remaining sale' : kind === 'sale' ? 'Record sale' : state === 'on_cart' ? 'Load onto cart' : 'Adjust quantity';
  return <div className="inv-overlay"><section className="inv-dialog inv-small-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-stock-title">
    <header><h2 id="inv-stock-title">{title}</h2></header>
    <form onSubmit={submit}><p>{product.name}</p><p>Recorded quantity: {product.quantity ?? 0}</p>
      {remaining ? <p>Confirm that you sold the remaining {product.quantity} units of {product.name}.</p>
        : <QuantityInput label={kind === 'sale' ? 'Units sold' : 'Quantity'} min={minimum} value={amount} onChange={setAmount} disabled={pending} />}
      {kind === 'sale' && !remaining && <p>Sales cannot exceed current On Cart stock. Correct the quantity first if the count is inaccurate.</p>}
      {error && <p className="inv-form-error" role="alert">{error}</p>}
      {needsRefresh && <button type="button" className="inv-secondary" disabled={pending} onClick={refreshConfirmation}>Refresh confirmation</button>}
      <footer><button type="button" className="inv-secondary" disabled={pending} onClick={onClose}>Cancel</button><button className="inv-primary" disabled={pending || needsRefresh} type="submit">{pending ? 'Submitting…' : 'Confirm'}</button></footer>
    </form>
  </section></div>;
}

export function AuditDialog({ inventory, session, onSaved, onClose }) {
  const [approver, setApprover] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const [snapshot] = useState(() => ({
    revision: inventory.inventory_revision,
    products: inventory.products.filter(product => !product.archived && product.state === 'on_cart'),
  }));
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true); setError('');
    try {
      await session.request('/audits', { inventory_revision: snapshot.revision, approver_staff_id: approver, authorized });
      await onSaved(); onClose();
    } catch (reason) { submitting.current = false; setError(reason.message); }
    finally { setPending(false); }
  }
  return <div className="inv-overlay"><section className="inv-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-audit-title">
    <header><h2 id="inv-audit-title">Confirm cart inventory audit</h2></header>
    <form onSubmit={submit}>
      <p>Record your cart inventory at the start and end of a shift.</p>
      <ul>{snapshot.products.map(product => <li key={product.product_id}>{product.name} · On Cart · Quantity {product.quantity ?? 0}</li>)}</ul>
      <label>Approver<select required value={approver} onChange={event => setApprover(event.target.value)} disabled={pending}><option value="">Select approver</option>{session.staff.filter(person => person.active !== false).map(person => <option key={person.staff_id} value={person.staff_id}>{person.name}</option>)}</select></label>
      <label><input type="checkbox" required checked={authorized} onChange={event => setAuthorized(event.target.checked)} disabled={pending} />Confirm you are authorized to approve this inventory count audit.</label>
      {error && <p className="inv-form-error" role="alert">{error}</p>}
      <footer><button className="inv-secondary" type="button" disabled={pending} onClick={onClose}>Cancel</button><button className="inv-primary" type="submit" disabled={pending || !authorized}>{pending ? 'Submitting…' : 'Confirm audit'}</button></footer>
    </form>
  </section></div>;
}

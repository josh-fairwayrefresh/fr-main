import React, { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { mergeProductDraft, usdPriceFromInput, usdPriceInput } from './lib/inventoryModel.mjs';

function buildProductBody(draft, state, preservedPrice = null) {
  const name = draft.name.trim();
  const categoryName = draft.category_name.trim();
  if (!name) return { error: 'Product name is required.' };
  if (!categoryName) return { error: 'Category is required.' };
  const parsedPrice = usdPriceFromInput(draft.price_amount);
  if (parsedPrice.error) return { error: parsedPrice.error };
  const price = parsedPrice.price || (preservedPrice?.currency_code !== 'USD' ? preservedPrice : null);
  return { body: {
    name, category_name: categoryName,
    subcategory_name: draft.subcategory_name.trim() || null,
    brand: draft.brand.trim() || null,
    description: draft.description.trim() || null,
    price, ...(state ? { state } : {}),
  } };
}

function draftFromProduct(product) {
  return {
    name: product?.name || '', category_name: product?.category_name || '',
    subcategory_name: product?.subcategory_name || '', brand: product?.brand || '',
    description: product?.description || '', price_amount: usdPriceInput(product?.price),
  };
}

function ProductFields({ draft, setDraft, categories, id, priceLocked }) {
  return <>
    <label>Product name<input autoFocus value={draft.name} maxLength="160" onChange={event => setDraft({ ...draft, name: event.target.value })} required /></label>
    <label>Category<input list={`${id}-categories`} value={draft.category_name} maxLength="100" onChange={event => setDraft({ ...draft, category_name: event.target.value, subcategory_name: '' })} required /><datalist id={`${id}-categories`}>{categories.map(category => <option key={category.category_id} value={category.name} />)}</datalist></label>
    <label>Brand <span className="inv-optional">Optional</span><input value={draft.brand} maxLength="120" onChange={event => setDraft({ ...draft, brand: event.target.value })} /></label>
    <label>Description <span className="inv-optional">Optional</span><textarea rows="3" maxLength="4000" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
    <label>Price ($) <span className="inv-optional">Optional</span><input type="number" min="0" step="0.01" inputMode="decimal" value={draft.price_amount} disabled={priceLocked} onChange={event => setDraft({ ...draft, price_amount: event.target.value })} /></label>
    {priceLocked && <small className="inv-price-note">Existing non-USD price is preserved while editing other fields.</small>}
  </>;
}

export default function MenuProductEditor({ product, categories, onClose, onCreate, onSave, initialState = 'on_cart' }) {
  const [draft, setDraft] = useState(() => draftFromProduct(product));
  const [saveStatus, setSaveStatus] = useState(product ? 'saved' : 'idle');
  const [saveError, setSaveError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const currentDraft = useRef(draft);
  const initialServerDraft = draftFromProduct(product);
  const lastServerDraft = useRef(initialServerDraft);
  const initialServerBody = buildProductBody(initialServerDraft, undefined, product?.price);
  const lastSaved = useRef(initialServerBody.body ? JSON.stringify(initialServerBody.body) : '');
  const saveQueue = useRef(Promise.resolve());
  const onSaveRef = useRef(onSave);
  currentDraft.current = draft;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!product) return;
    const remoteDraft = draftFromProduct(product);
    const remote = buildProductBody(remoteDraft, undefined, product.price);
    if (remote.error) return;
    const signature = JSON.stringify(remote.body);
    if (signature === lastSaved.current) {
      lastServerDraft.current = remoteDraft;
      return;
    }
    const merged = mergeProductDraft(lastServerDraft.current, currentDraft.current, remoteDraft);
    lastServerDraft.current = remoteDraft;
    lastSaved.current = signature;
    currentDraft.current = merged;
    setDraft(merged);
  }, [product]);

  useEffect(() => {
    if (!product) return undefined;
    const validation = buildProductBody(draft, undefined, product.price);
    if (validation.error) { setSaveError(validation.error); setSaveStatus('error'); return undefined; }
    const signature = JSON.stringify(validation.body);
    if (signature === lastSaved.current) { setSaveError(''); setSaveStatus('saved'); return undefined; }
    setSaveError('');
    setSaveStatus('waiting');
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
        if (signature === lastSaved.current) return;
        setSaveStatus('saving');
        const saved = await onSaveRef.current(product.product_id, validation.body);
        const savedDraft = saved ? draftFromProduct(saved) : currentDraft.current;
        const savedBody = buildProductBody(savedDraft, undefined, saved?.price);
        lastServerDraft.current = savedDraft;
        lastSaved.current = savedBody.error ? signature : JSON.stringify(savedBody.body);
        const latest = buildProductBody(currentDraft.current, undefined, saved?.price);
        if (!latest.error && JSON.stringify(latest.body) === lastSaved.current) setSaveStatus('saved');
      }).catch(error => {
        const latest = buildProductBody(currentDraft.current, undefined, product.price);
        if (!latest.error && JSON.stringify(latest.body) === signature) {
          setSaveError(error.message);
          setSaveStatus('error');
        }
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft, product?.product_id, attempt]);

  async function create(event) {
    event.preventDefault();
    const validation = buildProductBody(draft, initialState);
    if (validation.error) { setCreateError(validation.error); return; }
    setCreateError('');
    setCreating(true);
    try { await onCreate(validation.body); onClose(); }
    catch (error) { setCreateError(error.message); }
    finally { setCreating(false); }
  }
  const busy = creating || saveStatus === 'waiting' || saveStatus === 'saving';
  return <div className="inv-overlay"><section className="inv-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-product-title">
    <header><div><span className="inv-eyebrow">{product ? 'PRODUCT DETAILS' : 'NEW ITEM'}</span><h2 id="inv-product-title">{product ? 'Edit product' : 'Add product'}</h2></div><button className="inv-icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Close product editor"><X size={19} /></button></header>
    <form onSubmit={product ? event => event.preventDefault() : create}>
      <div className="inv-form-grid"><ProductFields draft={draft} setDraft={setDraft} categories={categories} id="inv-product" priceLocked={Boolean(product?.price && product.price.currency_code !== 'USD')} /></div>
      {product ? <div className={`inv-save-status ${saveStatus === 'error' ? 'error' : ''}`} role={saveStatus === 'error' ? 'alert' : 'status'}>
        {saveStatus === 'waiting' && 'Saving shortly…'}
        {saveStatus === 'saving' && 'Saving…'}
        {saveStatus === 'saved' && <><Check size={15} /> Saved</>}
        {saveStatus === 'error' && <>{saveError}<button type="button" onClick={() => setAttempt(attempt + 1)}>Retry save</button></>}
      </div> : <div className="inv-form-error" role="alert">{createError}</div>}
      {!product && <footer><button className="inv-secondary" type="button" onClick={onClose} disabled={creating}>Cancel</button><button className="inv-primary" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Add product'}</button></footer>}
    </form>
  </section></div>;
}

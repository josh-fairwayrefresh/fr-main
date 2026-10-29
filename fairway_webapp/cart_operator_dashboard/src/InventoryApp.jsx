import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, Check, ChevronDown, CircleAlert, Eye, LogOut, PackagePlus,
  Settings, ShieldCheck, ShoppingCart, Trash2, X,
} from 'lucide-react';
import { inventoryRequest } from './lib/inventoryApi.mjs';
import { downloadBlob } from './admin/adminApi';
import { InventoryDragFeedback, useInventoryDrag } from './InventoryDrag';
import { InventorySessionControls, useInventorySession } from './InventorySession';
import { AuditDialog, StockDialog } from './InventoryOperations';
import AppRefresh from './AppRefresh';
import { courseContextUrl, courseDisplayNames, courseKey, replaceCourseContext, selectedCourseFromLocation } from './lib/courseContext.mjs';
import { filterInventoryByCategory, filterInventoryBySubcategory, formatPrice, INVENTORY_STATES, INVENTORY_STATE_LABELS as STATE_LABELS, mergeProductDraft, subcategoryNamesInProducts, usdPriceFromInput, usdPriceInput } from './lib/inventoryModel.mjs';
import { publicMenuPath } from './lib/courseMenuConfig';
import './inventory.css';

function coursePath(course, suffix = '') {
  return `/api/v1/inventory/courses/${encodeURIComponent(course.customer_id)}/${encodeURIComponent(course.course_id)}${suffix}`;
}

function buildProductBody(draft, state, preservedPrice = null) {
  const name = draft.name.trim();
  const categoryName = draft.category_name.trim();
  if (!name) return { error: 'Product name is required.' };
  if (!categoryName) return { error: 'Category is required.' };
  const parsedPrice = usdPriceFromInput(draft.price_amount);
  if (parsedPrice.error) return { error: parsedPrice.error };
  const price = parsedPrice.price || (preservedPrice?.currency_code !== 'USD' ? preservedPrice : null);
  return {
    body: {
      name,
      category_name: categoryName,
      subcategory_name: draft.subcategory_name.trim() || null,
      brand: draft.brand.trim() || null,
      description: draft.description.trim() || null,
      price,
      ...(state ? { state } : {}),
    },
  };
}

function draftFromProduct(product) {
  return {
    name: product?.name || '',
    category_name: product?.category_name || '',
    subcategory_name: product?.subcategory_name || '',
    brand: product?.brand || '',
    description: product?.description || '',
    price_amount: usdPriceInput(product?.price),
  };
}

function ProductFields({ draft, setDraft, categories, id, priceLocked }) {
  const selectedCategory = categories.find((category) => (
    category.name.toLocaleLowerCase() === draft.category_name.trim().toLocaleLowerCase()
  ));
  return <>
    <label>Product name<input autoFocus value={draft.name} maxLength="160" onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
    <label>Category<input list={`${id}-categories`} value={draft.category_name} maxLength="100" onChange={(event) => setDraft({ ...draft, category_name: event.target.value, subcategory_name: '' })} required /><datalist id={`${id}-categories`}>{categories.map((category) => <option key={category.category_id} value={category.name} />)}</datalist></label>
    <label>Subcategory <span className="inv-optional">Optional</span><input list={`${id}-subcategories`} value={draft.subcategory_name} maxLength="100" onChange={(event) => setDraft({ ...draft, subcategory_name: event.target.value })} /><datalist id={`${id}-subcategories`}>{(selectedCategory?.subcategories || []).map((subcategory) => <option key={subcategory.subcategory_id} value={subcategory.name} />)}</datalist></label>
    <label>Brand <span className="inv-optional">Optional</span><input value={draft.brand} maxLength="120" onChange={(event) => setDraft({ ...draft, brand: event.target.value })} /></label>
    <label>Description <span className="inv-optional">Optional</span><textarea rows="3" maxLength="4000" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    <label>Price ($) <span className="inv-optional">Optional</span><input type="number" min="0" step="0.01" inputMode="decimal" value={draft.price_amount} disabled={priceLocked} onChange={(event) => setDraft({ ...draft, price_amount: event.target.value })} /></label>
    {priceLocked && <small className="inv-price-note">Existing non-USD price is preserved while editing other fields.</small>}
  </>;
}

function ProductDialog({ product, categories, onClose, onCreate, onSave }) {
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
    if (validation.error) {
      setSaveError(validation.error);
      setSaveStatus('error');
      return undefined;
    }
    const signature = JSON.stringify(validation.body);
    if (signature === lastSaved.current) {
      setSaveError('');
      setSaveStatus('saved');
      return undefined;
    }
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
      }).catch((error) => {
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
    const validation = buildProductBody(draft, 'on_cart');
    if (validation.error) {
      setCreateError(validation.error);
      return;
    }
    setCreateError('');
    setCreating(true);
    try {
      await onCreate(validation.body);
      onClose();
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setCreating(false);
    }
  }

  const busy = creating || saveStatus === 'waiting' || saveStatus === 'saving';
  return <div className="inv-overlay"><section className="inv-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-product-title">
    <header><div><span className="inv-eyebrow">{product ? 'PRODUCT DETAILS' : 'NEW ITEM'}</span><h2 id="inv-product-title">{product ? 'Edit product' : 'Add product'}</h2></div><button className="inv-icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Close product editor"><X size={19} /></button></header>
    <form onSubmit={product ? (event) => event.preventDefault() : create}>
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

function CategoryDialog({ categories, session, onClose, onSaved }) {
  const [kind, setKind] = useState('category');
  const [categoryId, setCategoryId] = useState(categories[0]?.category_id || '');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const suffix = kind === 'category' ? '/categories' : `/categories/${encodeURIComponent(categoryId)}/subcategories`;
      await session.request(suffix, { name });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setPending(false);
    }
  }

  return <div className="inv-overlay"><section className="inv-dialog inv-small-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-category-title">
    <header><div><span className="inv-eyebrow">CATALOG ORGANIZATION</span><h2 id="inv-category-title">Add category</h2></div><button className="inv-icon-button" type="button" onClick={onClose} aria-label="Close category editor"><X size={19} /></button></header>
    <form onSubmit={submit}>
      <label>Type<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="category">Category</option><option value="subcategory" disabled={categories.length === 0}>Subcategory</option></select></label>
      {kind === 'subcategory' && <label>Parent category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{categories.map((category) => <option key={category.category_id} value={category.category_id}>{category.name}</option>)}</select></label>}
      <label>{kind === 'category' ? 'Category name' : 'Subcategory name'}<input autoFocus maxLength="100" value={name} onChange={(event) => setName(event.target.value)} required /></label>
      {error && <p className="inv-form-error" role="alert">{error}</p>}
      <footer><button className="inv-secondary" type="button" onClick={onClose} disabled={pending}>Cancel</button><button className="inv-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Add'}</button></footer>
    </form>
  </section></div>;
}

function CategoryManagerDialog({ category, productCount, session, onClose, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const canDelete = productCount === 0;

  async function confirmDelete() {
    setPending(true);
    setError('');
    try {
      await session.request(`/categories/${encodeURIComponent(category.category_id)}`, {}, 'DELETE');
      await onDeleted();
      onClose();
    } catch (reason) {
      setError(reason.message);
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  return <div className="inv-overlay"><section className="inv-dialog inv-small-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-category-manage-title">
    <header><div><span className="inv-eyebrow">CATEGORY MANAGEMENT</span><h2 id="inv-category-manage-title">{category.name}</h2></div><button className="inv-icon-button" type="button" onClick={onClose} disabled={pending} aria-label="Close category management"><X size={19} /></button></header>
    <div className="inv-category-manage-body">
      <p className="inv-category-manage-detail"><strong>{productCount}</strong> {productCount === 1 ? 'product' : 'products'} in this category</p>
      {category.subcategories?.length > 0 && <div className="inv-category-manage-subcategories"><span>Subcategories</span><ul>{category.subcategories.map((subcategory) => <li key={subcategory.subcategory_id}>{subcategory.name}</li>)}</ul></div>}
      {!canDelete && <p className="inv-category-manage-note">This category still has products. Reassign or remove its products before deleting it.</p>}
      {error && <p className="inv-form-error" role="alert">{error}</p>}
      {confirming ? (
        <div className="inv-category-manage-confirm" role="alertdialog" aria-label={`Confirm deletion of ${category.name}`}>
          <p>Are you sure you want to delete the “{category.name}” category? This cannot be undone.</p>
          <div className="inv-category-manage-confirm-actions">
            <button className="inv-secondary" type="button" onClick={() => setConfirming(false)} disabled={pending}>Cancel</button>
            <button className="inv-danger" type="button" onClick={confirmDelete} disabled={pending}>{pending ? 'Deleting…' : 'Yes, delete category'}</button>
          </div>
        </div>
      ) : (
        <footer>
          <button className="inv-secondary" type="button" onClick={onClose}>Close</button>
          <button className="inv-danger" type="button" onClick={() => setConfirming(true)} disabled={!canDelete} title={canDelete ? undefined : 'Reassign or remove its products first'}>
            <Trash2 size={15} />Delete Category
          </button>
        </footer>
      )}
    </div>
  </section></div>;
}

function ProductTile({ product, busy, onStateChange, onEdit, onArchive, movement, onStock }) {
  const description = product.description || product.brand;
  return <article className={`inv-product-tile ${movement.drag?.product.product_id === product.product_id ? 'is-dragging' : ''}`} {...movement.bindings(product)}>
    <div className="inv-product-heading"><button className="inv-drag-handle" data-inventory-drag-handle type="button" disabled={busy} aria-label={`Move ${product.name}`} aria-pressed={movement.drag?.product.product_id === product.product_id} aria-describedby="inv-drag-help" onClick={() => movement.pick(product)}><span aria-hidden="true">::</span><strong>{product.name}</strong></button><div className="inv-product-actions"><button className="inv-icon-button" type="button" onClick={() => onEdit(product)} title="Edit product" aria-label={`Edit ${product.name}`}><Eye size={16} /></button><button className="inv-icon-button" type="button" onClick={() => onArchive(product)} title="Archive product" aria-label={`Archive ${product.name}`}><Archive size={16} /></button></div></div>
    {(product.subcategory_name || description) && <p className="inv-product-detail">{[product.subcategory_name, product.brand, product.description].filter(Boolean).join(' · ')}</p>}
    {formatPrice(product.price) && <p className="inv-product-price">{formatPrice(product.price)}</p>}
    <div className="inv-stock-controls"><button type="button" disabled={busy} onClick={() => onStock({ product, kind: 'adjustment' })} aria-label={`Edit quantity for ${product.name}`}>Quantity: <strong>{product.quantity ?? 0}</strong></button><button type="button" disabled={busy || product.state !== 'on_cart'} onClick={() => onStock({ product, kind: 'sale' })} aria-label={`Record sale for ${product.name}`}><ShoppingCart size={16} />Sale</button></div>
    <label className="inv-state-select"><span>Availability</span><select aria-label={`${product.name} state`} value={product.state} disabled={busy} onChange={(event) => onStateChange(product, event.target.value)}>{INVENTORY_STATES.map((state) => <option key={state} value={state}>{STATE_LABELS[state]}</option>)}</select><ChevronDown size={14} /></label>
  </article>;
}

function InventoryColumn({ state, products, busyId, onStateChange, onEdit, onArchive, movement, onStock }) {
  return <section aria-label={`${STATE_LABELS[state]} products`} data-inventory-drop={state} className={`inv-column inv-column-${state} ${movement.drag?.target === state ? 'drag-over' : ''}`}>
    <header><div><h2>{STATE_LABELS[state]}</h2><span>{products.length}</span></div></header>
    {movement.drag?.keyboard && <button className="inv-move-here" type="button" disabled={movement.drag.product.state === state} onClick={() => movement.drop(state)}>Move here: {STATE_LABELS[state]}</button>}
    <div className="inv-column-products">{products.map((product) => <ProductTile key={product.product_id} product={product} busy={Boolean(busyId)} onStateChange={onStateChange} onEdit={onEdit} onArchive={onArchive} movement={movement} onStock={onStock} />)}{products.length === 0 && <p className="inv-empty-column">No products</p>}</div>
  </section>;
}

export default function InventoryApp({ user, apiBaseUrl, courses, isAdmin = false, onOpenAdmin, onSignOut }) {
  const [selectedKey, setSelectedKey] = useState(() => {
    const selected = selectedCourseFromLocation(courses, window.location.search);
    return selected ? courseKey(selected) : '';
  });
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');
  const [inventory, setInventory] = useState(null);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [editor, setEditor] = useState(null);
  const [categoryEditor, setCategoryEditor] = useState(false);
  const [categoryManager, setCategoryManager] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [stockAction, setStockAction] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sessionEditing, setSessionEditing] = useState(false);
  const exportStateRef = useRef(null);
  const refreshRef = useRef(async () => {});
  const course = courses.find((item) => courseKey(item) === selectedKey)
    || selectedCourseFromLocation(courses, window.location.search);
  const session = useInventorySession(user, apiBaseUrl, course);
  const categories = inventory?.categories || [];
  const products = (inventory?.products || []).filter((product) => product.archived !== true);
  const categoryFilteredProducts = useMemo(() => (
    filterInventoryByCategory(products, selectedCategory)
  ), [products, selectedCategory]);
  const visibleProducts = useMemo(() => (
    selectedCategory === 'all'
      ? categoryFilteredProducts
      : filterInventoryBySubcategory(categoryFilteredProducts, selectedSubcategory)
  ), [categoryFilteredProducts, selectedCategory, selectedSubcategory]);
  const categoryCounts = useMemo(() => products.reduce((counts, product) => {
    counts[product.category_name] = (counts[product.category_name] || 0) + 1;
    return counts;
  }, {}), [products]);
  const subcategoryNames = useMemo(() => (
    selectedCategory === 'all' ? [] : subcategoryNamesInProducts(categoryFilteredProducts)
  ), [categoryFilteredProducts, selectedCategory]);
  const subcategoryCounts = useMemo(() => categoryFilteredProducts.reduce((counts, product) => {
    if (product.subcategory_name) counts[product.subcategory_name] = (counts[product.subcategory_name] || 0) + 1;
    return counts;
  }, {}), [categoryFilteredProducts]);
  const hasCurrentInventory = inventory?.customer_id === course?.customer_id && inventory?.course_id === course?.course_id;
  const canExport = hasCurrentInventory
    && loadStatus === 'ready' && !session.unresolved && !session.submitting && !busyId;
  const exportSignature = JSON.stringify([selectedKey, inventory?.inventory_revision, inventory?.daily_sales, selectedCategory, selectedSubcategory, showArchived, session.shift?.staff_name]);
  exportStateRef.current = { canExport, signature: exportSignature };
  const movement = useInventoryDrag({
    scope: `${user?.uid}:${course?.customer_id}:${course?.course_id}:${selectedCategory}:${selectedSubcategory}`,
    disabled: Boolean(busyId || session.submitting || session.unresolved || session.choosing || stockAction || editor || auditing),
    onMove: changeState,
  });

  function selectCategory(categoryName) {
    setSelectedCategory(categoryName);
    setSelectedSubcategory('all');
  }

  useEffect(() => {
    if (!course) return undefined;
    let active = true;
    setInventory(null);
    setSelectedCategory('all');
    setSelectedSubcategory('all');
    setLoadError('');
    setEditor(null); setCategoryEditor(false); setCategoryManager(null);
    setStockAction(null); setAuditing(false); setNotice('');
    async function refresh(silent = false) {
      if (!silent) setLoadStatus('loading');
      try {
        const result = await inventoryRequest(user, apiBaseUrl, coursePath(course));
        if (!active) return;
        setInventory(result);
        setLoadError('');
        setLoadStatus('ready');
        return result;
      } catch (error) {
        if (!active) return;
        setLoadError(error.message);
        setLoadStatus('error');
      }
    }
    refreshRef.current = refresh;
    refresh();
    const interval = window.setInterval(() => refresh(true), 15000);
    const onFocus = () => refresh(true);
    const onResolved = () => { setStockAction(null); setAuditing(false); refresh(true); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('inventory-updated', onResolved);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('inventory-updated', onResolved);
    };
  }, [apiBaseUrl, course?.customer_id, course?.course_id, user]);

  async function refreshInventory(silent = true) {
    return refreshRef.current(silent);
  }

  async function saveProduct(productId, body) {
    const saved = await session.request(`/products/${encodeURIComponent(productId)}`, body, 'PATCH');
    await refreshInventory(true);
    return saved;
  }

  async function createProduct(body) {
    await session.request('/products', body);
    await refreshInventory(true);
  }

  async function changeState(product, state) {
    if (busyId) return;
    if (product.state === state) return;
    if (state === 'sold_out' && product.quantity > 0) {
      setStockAction({ product, kind: 'sale', remaining: true });
      return;
    }
    if (state === 'on_cart') {
      setStockAction({ product, kind: 'availability', state });
      return;
    }
    setBusyId(product.product_id);
    setNotice('');
    try {
      await session.request(`/products/${encodeURIComponent(product.product_id)}/stock`, {
        kind: 'availability', state, expected_stock_revision: product.stock_revision ?? 0,
      });
      await refreshInventory(true);
    } catch (error) {
      setNotice(`Unable to save ${product.name}: ${error.message}`);
      if (error.status === 409) await refreshInventory(true);
    } finally {
      setBusyId('');
    }
  }

  async function archiveProduct(product) {
    if (!window.confirm(`Archive ${product.name}? It will be removed from active inventory and menus.`)) return;
    setBusyId(product.product_id);
    setNotice('');
    try {
      await session.request(`/products/${encodeURIComponent(product.product_id)}/archive`);
      await refreshInventory(true);
    } catch (error) {
      setNotice(`Unable to archive ${product.name}: ${error.message}`);
    } finally {
      setBusyId('');
    }
  }

  async function exportView() {
    if (!canExport || exporting) {
      setNotice('Export is unavailable until inventory is loaded and pending submissions are resolved.');
      return;
    }
    setNotice('');
    setExporting(true);
    try {
      const { inventoryViewWorkbook, INVENTORY_WORKBOOK_TYPE } = await import('./lib/inventoryExport.mjs');
      const auditHistory = await inventoryRequest(user, apiBaseUrl, coursePath(course, '/audits'));
      const buffer = await inventoryViewWorkbook({
        course, inventory, auditHistory, products: columnStates.flatMap(state => visibleProducts.filter(product => product.state === state)),
        archivedProducts: showArchived ? inventory.archived_products || [] : [],
        category: selectedCategory, subcategory: selectedSubcategory, operator: session.shift?.staff_name,
      });
      if (!exportStateRef.current.canExport || exportStateRef.current.signature !== exportSignature) {
        throw new Error('Inventory or submission state changed while preparing the report. Resolve pending submissions and export again.');
      }
      downloadBlob(new Blob([buffer], { type: INVENTORY_WORKBOOK_TYPE }), `inventory-${course.customer_id}-${course.course_id}-view.xlsx`);
    } catch (error) { setNotice(`Unable to export inventory: ${error.message}`); }
    finally { setExporting(false); }
  }

  const columnStates = ['on_cart', 'sold_out', 'in_inventory'];
  if (!course) return <main className="inventory-app"><section className="inv-empty-access"><h1>No course access</h1><p>This account is not assigned to a customer course.</p><button className="inv-secondary" type="button" onClick={onSignOut}><LogOut size={16} />Sign out</button></section></main>;

  const displayNames = courseDisplayNames(course);
  return <main className="inventory-app">
    <header className="inv-header">
      <div className="inv-header-main">
        <a href={courseContextUrl('/', course)} className="inv-brand" title="Return to Cart Operations"><img src="/icons/logo-and-name-row-banner.jpg" alt="Fairway Refresh" /></a>
        <nav className="inv-header-nav" aria-label="Inventory navigation">
          <a className="inv-cart-link" href={courseContextUrl('/', course)} title="Return to Cart Operations">Cart Operations</a>
          <span aria-current="page">Inventory</span>
        </nav>
        <div className="inv-header-account">
          <AppRefresh className="inv-icon-button" user={user} getBlockReason={() => {
            if (session.isSubmitting() || session.unresolved || busyId || exporting) return 'Wait for Inventory submissions or export to finish, and resolve any unconfirmed submission before refreshing.';
            if (editor || categoryEditor || categoryManager || stockAction || auditing || sessionEditing || session.choosing || movement.drag) return 'Finish or cancel the open Inventory dialog or move before refreshing. Your edits have not been discarded.';
            return '';
          }} />
          {isAdmin && <button className="inv-icon-button" type="button" onClick={onOpenAdmin} title="Open Admin" aria-label="Open Admin"><ShieldCheck size={18} /></button>}
          <button className="inv-icon-button" type="button" onClick={onSignOut} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </div>
      <div className="inv-header-context">
        <div className="inv-course-identity"><span>{displayNames.customer}</span><strong>{displayNames.course}</strong></div>
        {courses.length > 1 && <label className="inv-course-picker"><span>Course</span><select value={courseKey(course)} onChange={(event) => { const selected = courses.find((item) => courseKey(item) === event.target.value); if (!selected) return; setSelectedKey(courseKey(selected)); replaceCourseContext('/inventory', selected); }} aria-label="Select course">{courses.map((item) => <option key={courseKey(item)} value={courseKey(item)}>{item.customer_name} · {item.course_name}</option>)}</select></label>}
        <div className="inv-header-tools">
          <span className="inv-user-label">{user.email}</span>
          <button className="inv-secondary" type="button" onClick={exportView} disabled={!canExport || exporting}>{exporting ? 'Preparing export…' : 'Export'}</button>
        </div>
      </div>
    </header>
    <div className="inv-main">
      <section className="inv-title-row">
        <div className="inv-title"><p className="inv-eyebrow">{course.customer_name || 'MONARCH BAY GC'}</p><h1>CART INVENTORY MANAGEMENT DASHBOARD</h1><p className="inv-subtitle">{course.course_name}</p></div>
        <section className="inv-daily-sales" aria-label="Today's inventory sales">
          <div className="inv-sales-total"><strong>Sales Today</strong>
            <span>{inventory ? `${inventory.daily_sales?.total_units ?? 0} units sold` : 'Loading…'}</span>
          </div>
          <InventorySessionControls key={`${user.uid}:${selectedKey}`} session={session}
            onEditingChange={setSessionEditing}
            actions={<button className="inv-secondary" type="button" disabled={!hasCurrentInventory || loadStatus !== 'ready' || session.submitting || session.unresolved} onClick={() => setAuditing(true)}>Confirm Inventory Audit</button>} />
        </section>
      </section>
      {loadError && <div className="inv-alert" role="alert"><CircleAlert size={17} /><span>{loadError}</span><button type="button" onClick={() => refreshInventory(false)}>Retry</button></div>}
      {notice && <div className="inv-notice" role="alert">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}
      {loadStatus === 'loading' && <div className="inv-loading" role="status">Loading course inventory…</div>}
      <div className="inv-catalog-actions" role="group" aria-label="Catalog and menu actions">
        <button className="inv-secondary" type="button" onClick={() => setCategoryEditor(true)}><PackagePlus size={16} />Add Category</button>
        <button className="inv-primary" type="button" onClick={() => setEditor({ product: null })}>+ Add Product</button>
      </div>
      {inventory && <div className="inv-filter-row"><nav className="inv-category-filters" aria-label="Filter inventory by category">
        <button className={`inv-category-filter ${selectedCategory === 'all' ? 'active' : ''}`} type="button" aria-pressed={selectedCategory === 'all'} onClick={() => selectCategory('all')}>All Products <span>{products.length}</span></button>
        {categories.map((category) => <div className="inv-category-filter-group" key={category.category_id}>
          <button className={`inv-category-filter ${selectedCategory === category.name ? 'active' : ''}`} type="button" aria-pressed={selectedCategory === category.name} onClick={() => selectCategory(category.name)}>{category.name} <span>{categoryCounts[category.name] || 0}</span></button>
          <button className="inv-category-manage-trigger" type="button" onClick={() => setCategoryManager(category)} title={`Manage ${category.name}`} aria-label={`Manage ${category.name} category`}><Settings size={13} /></button>
        </div>)}
      </nav><div className="inv-audit-action">
        {hasCurrentInventory && inventory?.public_menu_slug
          ? <a className="inv-secondary inv-menu-link" href={publicMenuPath(inventory.public_menu_slug)} target="_blank" rel="noopener noreferrer">Golfer-View Menu</a>
          : hasCurrentInventory && loadStatus === 'ready' && <span className="inv-menu-unconfigured">Public menu link not configured for this Course. Contact Admin.</span>}
      </div></div>}
      {inventory && selectedCategory !== 'all' && subcategoryNames.length > 0 && <nav className="inv-subcategory-filters" aria-label="Filter inventory by subcategory">
        <button className={`inv-subcategory-filter ${selectedSubcategory === 'all' ? 'active' : ''}`} type="button" aria-pressed={selectedSubcategory === 'all'} onClick={() => setSelectedSubcategory('all')}>All <span>{categoryFilteredProducts.length}</span></button>
        {subcategoryNames.map((name) => <button className={`inv-subcategory-filter ${selectedSubcategory === name ? 'active' : ''}`} type="button" aria-pressed={selectedSubcategory === name} key={name} onClick={() => setSelectedSubcategory(name)}>{name} <span>{subcategoryCounts[name] || 0}</span></button>)}
      </nav>}
      <p id="inv-drag-help" className="inv-sync-note">Drag the product name or grip to an availability column. Scroll normally outside the grip. Or select the name, then choose Move here. Escape cancels.</p>
      {inventory && <div className="inv-board">{columnStates.map((state) => <InventoryColumn key={state} state={state} products={visibleProducts.filter((product) => product.state === state)} busyId={busyId} onStateChange={changeState} onEdit={(product) => setEditor({ product })} onArchive={archiveProduct} movement={movement} onStock={setStockAction} />)}</div>}
      <InventoryDragFeedback drag={movement.drag} />
      {inventory?.archived_products?.length > 0 && <section className="inv-archive"><button type="button" className="inv-archive-toggle" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}><Archive size={16} />Archived products <span>{inventory.archived_products.length}</span><ChevronDown size={16} /></button>{showArchived && <ul>{inventory.archived_products.map((product) => <li key={product.product_id}><strong>{product.name}</strong><span>{product.category_name}</span></li>)}</ul>}</section>}
      <p className="inv-sync-note">Inventory refreshes from the server while open. Your saved changes are shared with assigned staff.</p>
    </div>
    {editor && <ProductDialog key={editor.product?.product_id || 'new'} product={editor.product} categories={categories} onClose={() => setEditor(null)} onCreate={createProduct} onSave={saveProduct} />}
    {categoryEditor && <CategoryDialog categories={categories} session={session} onClose={() => setCategoryEditor(false)} onSaved={() => refreshInventory(true)} />}
    {categoryManager && <CategoryManagerDialog
      course={course}
      category={categoryManager}
      productCount={categoryCounts[categoryManager.name] || 0}
      apiBaseUrl={apiBaseUrl}
      user={user}
      session={session}
      onClose={() => setCategoryManager(null)}
      onDeleted={async () => {
        if (selectedCategory === categoryManager.name) selectCategory('all');
        await refreshInventory(true);
      }}
    />}
    {stockAction && <StockDialog action={stockAction} session={session} onSaved={() => refreshInventory(true)} onRefresh={() => refreshInventory(true)} onClose={() => setStockAction(null)} />}
    {auditing && <AuditDialog inventory={inventory} session={session} onSaved={() => refreshInventory(true)} onClose={() => setAuditing(false)} />}
  </main>;
}
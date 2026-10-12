import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, Check, ChevronDown, CircleAlert, Eye, LogOut, PackagePlus,
  Plus, Send, X,
} from 'lucide-react';
import { inventoryRequest } from './lib/inventoryApi.mjs';
import { filterInventoryByCategory, formatPrice, formatPublishedAt, groupPublishedProducts, INVENTORY_STATES, mergeProductDraft, usdPriceFromInput, usdPriceInput } from './lib/inventoryModel.mjs';
import { presentationForCourse } from './lib/courseMenuConfig';
import './inventory.css';

const STATE_LABELS = Object.freeze({
  on_cart: 'On Cart',
  sold_out: 'Sold Out',
  in_inventory: 'In Inventory',
});

function coursePath(course, suffix = '') {
  return `/api/v1/inventory/courses/${encodeURIComponent(course.customer_id)}/${encodeURIComponent(course.course_id)}${suffix}`;
}

function productBody(product, state = product.state) {
  return {
    name: product.name,
    category_name: product.category_name || product.category,
    subcategory_name: product.subcategory_name || product.subcategory || null,
    brand: product.brand || null,
    description: product.description || null,
    price: product.price || null,
    state,
  };
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
      state,
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
  const initialServerBody = buildProductBody(initialServerDraft, product?.state, product?.price);
  const lastSaved = useRef(initialServerBody.body ? JSON.stringify(initialServerBody.body) : '');
  const saveQueue = useRef(Promise.resolve());
  const onSaveRef = useRef(onSave);
  currentDraft.current = draft;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!product) return;
    const remoteDraft = draftFromProduct(product);
    const remote = buildProductBody(remoteDraft, product.state, product.price);
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
    const validation = buildProductBody(draft, product.state, product.price);
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
        const savedState = saved?.state || product.state;
        const savedBody = buildProductBody(savedDraft, savedState, saved?.price);
        lastServerDraft.current = savedDraft;
        lastSaved.current = savedBody.error ? signature : JSON.stringify(savedBody.body);
        const latest = buildProductBody(currentDraft.current, savedState, saved?.price);
        if (!latest.error && JSON.stringify(latest.body) === lastSaved.current) setSaveStatus('saved');
      }).catch((error) => {
        const latest = buildProductBody(currentDraft.current, product.state, product.price);
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

function CategoryDialog({ course, categories, apiBaseUrl, user, onClose, onSaved }) {
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
      await inventoryRequest(user, apiBaseUrl, coursePath(course, suffix), { method: 'POST', body: { name } });
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

function DraftPreviewDialog({ preview, course, onClose }) {
  const categories = groupPublishedProducts(preview.products);
  return <div className="inv-overlay"><section className="inv-dialog inv-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-preview-title">
    <header><div><span className="inv-eyebrow">UNPUBLISHED DRAFT · REVISION {preview.inventory_revision}</span><h2 id="inv-preview-title">Menu preview</h2></div><button className="inv-icon-button" type="button" onClick={onClose} aria-label="Close menu preview"><X size={19} /></button></header>
    <div className="inv-preview-body"><h3>Today’s Cart Menu</h3><p>{course.course_name}</p>{categories.length === 0 ? <p className="inv-empty">No On Cart or Sold Out products are saved in this draft.</p> : categories.map((category) => <section key={category.name}><h4>{category.name}</h4>{category.products.map((product) => <PreviewProduct key={product.product_id} product={product} />)}{category.subcategories.map((subcategory) => <div key={subcategory.name}><h5>{subcategory.name}</h5>{subcategory.products.map((product) => <PreviewProduct key={product.product_id} product={product} />)}</div>)}</section>)}</div>
  </section></div>;
}

function PreviewProduct({ product }) {
  return <div className="inv-preview-product"><div><strong>{product.name}</strong>{product.description && <p>{product.description}</p>}</div><span className={product.state === 'sold_out' ? 'sold-out' : ''}>{product.state === 'sold_out' ? 'Sold Out' : 'Available'}</span>{formatPrice(product.price) && <b>{formatPrice(product.price)}</b>}</div>;
}

function ProductTile({ product, busy, onStateChange, onEdit, onArchive, onDragStart }) {
  const description = product.description || product.brand;
  return <article className="inv-product-tile" draggable="true" onDragStart={(event) => onDragStart(event, product.product_id)}>
    <div className="inv-product-heading"><strong>{product.name}</strong><div className="inv-product-actions"><button className="inv-icon-button" type="button" onClick={() => onEdit(product)} title="Edit product" aria-label={`Edit ${product.name}`}><Eye size={16} /></button><button className="inv-icon-button" type="button" onClick={() => onArchive(product)} title="Archive product" aria-label={`Archive ${product.name}`}><Archive size={16} /></button></div></div>
    {(product.subcategory_name || description) && <p className="inv-product-detail">{[product.subcategory_name, product.brand, product.description].filter(Boolean).join(' · ')}</p>}
    {formatPrice(product.price) && <p className="inv-product-price">{formatPrice(product.price)}</p>}
    <label className="inv-state-select"><span>Availability</span><select aria-label={`${product.name} state`} value={product.state} disabled={busy} onChange={(event) => onStateChange(product, event.target.value)}>{INVENTORY_STATES.map((state) => <option key={state} value={state}>{STATE_LABELS[state]}</option>)}</select><ChevronDown size={14} /></label>
  </article>;
}

function InventoryColumn({ state, products, busyId, onStateChange, onEdit, onArchive, onDrop, onDragStart }) {
  const [dragOver, setDragOver] = useState(false);
  return <section className={`inv-column inv-column-${state} ${dragOver ? 'drag-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false); }} onDrop={(event) => { event.preventDefault(); setDragOver(false); onDrop(event, state); }}>
    <header><div><h2>{STATE_LABELS[state]}</h2><span>{products.length}</span></div></header>
    <div className="inv-column-products">{products.map((product) => <ProductTile key={product.product_id} product={product} busy={busyId === product.product_id} onStateChange={onStateChange} onEdit={onEdit} onArchive={onArchive} onDragStart={onDragStart} />)}{products.length === 0 && <p className="inv-empty-column">No products</p>}</div>
  </section>;
}

export default function InventoryApp({ user, apiBaseUrl, courses, onSignOut }) {
  const [selectedKey, setSelectedKey] = useState(() => courses[0] ? `${courses[0].customer_id}/${courses[0].course_id}` : '');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [inventory, setInventory] = useState(null);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [editor, setEditor] = useState(null);
  const [categoryEditor, setCategoryEditor] = useState(false);
  const [preview, setPreview] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publication, setPublication] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const refreshRef = useRef(async () => {});
  const course = courses.find((item) => `${item.customer_id}/${item.course_id}` === selectedKey) || courses[0];
  const coursePresentation = course && presentationForCourse(course);
  const categories = inventory?.categories || [];
  const products = (inventory?.products || []).filter((product) => product.archived !== true);
  const visibleProducts = useMemo(() => filterInventoryByCategory(products, selectedCategory), [products, selectedCategory]);
  const categoryCounts = useMemo(() => products.reduce((counts, product) => {
    counts[product.category_name] = (counts[product.category_name] || 0) + 1;
    return counts;
  }, {}), [products]);
  const localTimeZone = coursePresentation?.timeZone;

  useEffect(() => {
    if (!course) return undefined;
    let active = true;
    async function refresh(silent = false) {
      if (!silent) setLoadStatus(inventory ? 'refreshing' : 'loading');
      try {
        const result = await inventoryRequest(user, apiBaseUrl, coursePath(course));
        if (!active) return;
        setInventory(result);
        setLoadError('');
        setLoadStatus('ready');
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
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [apiBaseUrl, course?.customer_id, course?.course_id, user]);

  async function refreshInventory(silent = true) {
    await refreshRef.current(silent);
  }

  async function saveProduct(productId, body) {
    const saved = await inventoryRequest(user, apiBaseUrl, coursePath(course, `/products/${encodeURIComponent(productId)}`), { method: 'PATCH', body });
    await refreshInventory(true);
    return saved;
  }

  async function createProduct(body) {
    await inventoryRequest(user, apiBaseUrl, coursePath(course, '/products'), { method: 'POST', body });
    await refreshInventory(true);
  }

  async function changeState(product, state) {
    if (product.state === state) return;
    setBusyId(product.product_id);
    setNotice('');
    try {
      await saveProduct(product.product_id, productBody(product, state));
      setNotice(`${product.name} saved as ${STATE_LABELS[state]}.`);
    } catch (error) {
      setNotice(`Unable to save ${product.name}: ${error.message}`);
    } finally {
      setBusyId('');
    }
  }

  async function archiveProduct(product) {
    if (!window.confirm(`Archive ${product.name}? It will be removed from active inventory and menus.`)) return;
    setBusyId(product.product_id);
    setNotice('');
    try {
      await inventoryRequest(user, apiBaseUrl, coursePath(course, `/products/${encodeURIComponent(product.product_id)}/archive`), { method: 'POST' });
      await refreshInventory(true);
      setNotice(`${product.name} archived.`);
    } catch (error) {
      setNotice(`Unable to archive ${product.name}: ${error.message}`);
    } finally {
      setBusyId('');
    }
  }

  async function dropProduct(event, state) {
    const productId = event.dataTransfer.getData('text/plain');
    const product = products.find((item) => item.product_id === productId);
    if (product) await changeState(product, state);
  }

  function startProductDrag(event, productId) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', productId);
  }

  async function loadPreview() {
    setNotice('');
    try {
      const result = await inventoryRequest(user, apiBaseUrl, coursePath(course, '/preview'));
      setPreview(result);
    } catch (error) {
      setNotice(`Unable to load draft preview: ${error.message}`);
    }
  }

  async function publishMenu() {
    if (!window.confirm('Publish the saved menu for golfers? The published menu changes only after the publication succeeds.')) return;
    setPublishing(true);
    setNotice('');
    try {
      const result = await inventoryRequest(user, apiBaseUrl, coursePath(course, '/publish'), { method: 'POST' });
      setPublication(result);
      await refreshInventory(true);
      setNotice(`Menu version ${result.version} published.`);
    } catch (error) {
      setNotice(`Menu was not published: ${error.message}`);
    } finally {
      setPublishing(false);
    }
  }

  const columnStates = ['on_cart', 'sold_out', 'in_inventory'];
  if (!course) return <main className="inventory-app"><section className="inv-empty-access"><h1>No Inventory course access</h1><p>This account is not assigned to an Inventory course.</p><button className="inv-secondary" type="button" onClick={onSignOut}><LogOut size={16} />Sign out</button></section></main>;

  return <main className="inventory-app">
    <header className="inv-header"><a href="/" className="inv-brand"><img src={coursePresentation?.fairwayLogo} alt="Fairway Refresh" /><span>INVENTORY MANAGEMENT</span></a><div className="inv-header-controls">
      {courses.length > 1 && <label className="inv-course-picker"><span>Course</span><select value={selectedKey} onChange={(event) => { setSelectedKey(event.target.value); setPublication(null); }} aria-label="Select course">{courses.map((item) => <option key={`${item.customer_id}/${item.course_id}`} value={`${item.customer_id}/${item.course_id}`}>{item.course_name}</option>)}</select></label>}
      <span className="inv-user-label">{user.email}</span><button className="inv-icon-button" type="button" onClick={onSignOut} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
    </div></header>
    <div className="inv-main">
      <section className="inv-title-row"><div><p className="inv-eyebrow">{course.customer_name || 'MONARCH BAY GC'}</p><h1>CART INVENTORY MANAGEMENT DASHBOARD</h1><p className="inv-subtitle">{course.course_name}</p></div><div className="inv-title-actions"><div className="inv-edit-actions"><button className="inv-secondary" type="button" onClick={() => setCategoryEditor(true)}><PackagePlus size={16} />+ Category</button><button className="inv-primary" type="button" onClick={() => setEditor({ product: null })}><Plus size={17} />+ Product</button></div><div className="inv-publication-actions"><button className="inv-secondary" type="button" onClick={loadPreview}><Eye size={16} />Preview Draft</button><button className="inv-publish" type="button" onClick={publishMenu} disabled={publishing || loadStatus !== 'ready'}><Send size={16} />{publishing ? 'Publishing…' : 'Publish Menu'}</button></div></div></section>
      <section className={`inv-revision ${inventory?.has_unpublished_changes ? 'is-dirty' : ''}`} role="status"><span className="inv-revision-dot" /><strong>{inventory?.has_unpublished_changes ? 'Unpublished changes' : inventory?.published_version ? 'Published menu is current' : 'No menu published yet'}</strong><span>Revision {inventory?.inventory_revision ?? '—'}</span>{inventory?.published_version > 0 && <span>Published version {inventory.published_version}</span>}</section>
      {loadError && <div className="inv-alert" role="alert"><CircleAlert size={17} /><span>{loadError}</span><button type="button" onClick={() => refreshInventory(false)}>Retry</button></div>}
      {notice && <div className="inv-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}
      {loadStatus === 'loading' && <div className="inv-loading" role="status">Loading course inventory…</div>}
      {inventory && <nav className="inv-category-filters" aria-label="Filter inventory by category">
        <button className={`inv-category-filter ${selectedCategory === 'all' ? 'active' : ''}`} type="button" aria-pressed={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')}>All Products <span>{products.length}</span></button>
        {categories.map((category) => <button className={`inv-category-filter ${selectedCategory === category.name ? 'active' : ''}`} type="button" aria-pressed={selectedCategory === category.name} key={category.category_id} onClick={() => setSelectedCategory(category.name)}>{category.name} <span>{categoryCounts[category.name] || 0}</span></button>)}
      </nav>}
      {inventory && <div className="inv-board">{columnStates.map((state) => <InventoryColumn key={state} state={state} products={visibleProducts.filter((product) => product.state === state)} busyId={busyId} onStateChange={changeState} onEdit={(product) => setEditor({ product })} onArchive={archiveProduct} onDrop={dropProduct} onDragStart={startProductDrag} />)}</div>}
      {inventory?.archived_products?.length > 0 && <section className="inv-archive"><button type="button" className="inv-archive-toggle" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}><Archive size={16} />Archived products <span>{inventory.archived_products.length}</span><ChevronDown size={16} /></button>{showArchived && <ul>{inventory.archived_products.map((product) => <li key={product.product_id}><strong>{product.name}</strong><span>{product.category_name}</span></li>)}</ul>}</section>}
      {publication && <section className="inv-publication" role="status"><Check size={18} /><div><strong>Publication confirmed · Version {publication.version}</strong><span>{formatPublishedAt(publication.published_at, localTimeZone) || 'Course timezone not configured'} · Published by {user.email || user.uid}</span></div><button type="button" onClick={() => setPublication(null)} aria-label="Dismiss publication confirmation"><X size={16} /></button></section>}
      <p className="inv-sync-note">Inventory refreshes from the server while open. Your saved changes are shared with assigned staff.</p>
    </div>
    {editor && <ProductDialog key={editor.product?.product_id || 'new'} product={editor.product} categories={categories} onClose={() => setEditor(null)} onCreate={createProduct} onSave={saveProduct} />}
    {categoryEditor && <CategoryDialog course={course} categories={categories} apiBaseUrl={apiBaseUrl} user={user} onClose={() => setCategoryEditor(false)} onSaved={() => refreshInventory(true)} />}
    {preview && <DraftPreviewDialog preview={preview} course={course} onClose={() => setPreview(null)} />}
  </main>;
}
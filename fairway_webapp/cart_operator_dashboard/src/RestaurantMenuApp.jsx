import React, { useEffect, useMemo, useState } from 'react';
import { LogOut, PackagePlus, Settings, ShieldCheck } from 'lucide-react';
import { inventoryRequest } from './lib/inventoryApi.mjs';
import { filterInventoryByCategory } from './lib/inventoryModel.mjs';
import { normalizeRestaurantCatalog, restaurantProductBody } from './lib/menuCatalog.mjs';
import { useInventoryDrag, InventoryDragFeedback } from './InventoryDrag';
import { InventoryColumn } from './MenuProductBoard';
import ProductDialog from './MenuProductEditor';
import { CategoryDialog, CategoryManagerDialog } from './MenuCategories';
import AppRefresh from './AppRefresh';
import './inventory.css';

const STATES = ['on_menu', 'sold_out', 'in_inventory'];
const LABELS = { on_menu: 'On Menu', sold_out: 'Sold Out', in_inventory: 'In Inventory' };

export default function RestaurantMenuApp({ user, apiBaseUrl, customer, menu, isAdmin, onOpenAdmin, onSignOut, onSelectMenu }) {
  const [catalog, setCatalog] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [editor, setEditor] = useState(null);
  const [categoryEditor, setCategoryEditor] = useState(false);
  const [categoryManager, setCategoryManager] = useState(null);
  const path = `/api/v1/menus/customers/${encodeURIComponent(customer.customer_id)}/${encodeURIComponent(menu.menu_id)}`;
  const categories = catalog?.categories || [];
  const products = catalog?.products?.filter(product => !product.archived) || [];
  const visible = useMemo(() => filterInventoryByCategory(products, selectedCategory), [catalog, selectedCategory]);

  async function load(signal) {
    const result = normalizeRestaurantCatalog(await inventoryRequest(user, apiBaseUrl, path, { signal }));
    if (!signal?.aborted) { setCatalog(result); setStatus('ready'); setError(''); }
    return result;
  }

  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null); setStatus('loading'); setError(''); setSelectedCategory('all');
    load(controller.signal).catch(reason => {
      if (!controller.signal.aborted) { setError(reason.message); setStatus('error'); }
    });
    return () => controller.abort();
  }, [path, user, apiBaseUrl]);

  async function mutate(suffix, body, method = 'POST') {
    setBusy(true); setError('');
    try {
      const result = await inventoryRequest(user, apiBaseUrl, `${path}${suffix}`, { method, body });
      const currentCatalog = await load();
      return { result, currentCatalog };
    } finally { setBusy(false); }
  }
  const session = { request: mutate };
  async function changeState(product, state) {
    if (busy || state === product.state) return;
    try { await mutate(`/products/${encodeURIComponent(product.product_id)}`, { state }, 'PATCH'); }
    catch (reason) { setError(reason.message); }
  }
  async function archive(product) {
    if (!window.confirm(`Archive ${product.name}?`)) return;
    try { await mutate(`/products/${encodeURIComponent(product.product_id)}`, { archived: true }, 'PATCH'); }
    catch (reason) { setError(reason.message); }
  }
  const movement = useInventoryDrag({
    scope: `${customer.customer_id}:${menu.menu_id}:${selectedCategory}`,
    disabled: Boolean(busy || editor || categoryEditor || categoryManager), onMove: changeState,
  });
  return <main className="inventory-app">
    <header className="inv-header"><div className="inv-header-main">
      <a href="/" className="inv-brand"><img src="/icons/logo-and-name-row-banner.jpg" alt="Fairway Refresh" /></a>
      <nav className="inv-header-nav" aria-label="Menu navigation"><a href="/">Requests</a><span aria-current="page">Menu</span></nav>
      <div className="inv-header-account">
        <AppRefresh className="inv-icon-button" user={user} getBlockReason={() => busy || editor || categoryEditor || categoryManager || movement.drag ? 'Finish or cancel the current menu edit before refreshing.' : ''} />
        {isAdmin && <button className="inv-icon-button" type="button" onClick={onOpenAdmin} aria-label="Open Admin"><ShieldCheck size={18} /></button>}
        <button className="inv-icon-button" type="button" onClick={onSignOut} aria-label="Sign out"><LogOut size={18} /></button>
      </div>
    </div><div className="inv-header-context"><div className="inv-course-identity"><span>{customer.customer_name}</span><strong>{menu.name}</strong></div><button className="inv-secondary" type="button" onClick={onSelectMenu} disabled={busy || Boolean(editor || categoryEditor || categoryManager || movement.drag)}>Select menu</button></div></header>
    <div className="inv-main">
      <div className="inv-title"><p className="inv-eyebrow">{customer.customer_name}</p><h1>RESTAURANT MENU MANAGEMENT DASHBOARD</h1><p className="inv-subtitle">{menu.name}</p></div>
      {error && <div className="inv-alert" role="alert">{error}<button type="button" onClick={() => load().catch(reason => setError(reason.message))}>Retry</button></div>}
      {status === 'loading' && <p role="status">Loading menu…</p>}
      {status === 'ready' && <>
        <div className="inv-catalog-actions"><button className="inv-secondary" type="button" disabled={busy} onClick={() => setCategoryEditor(true)}><PackagePlus size={16} />Add Category</button><button className="inv-primary" type="button" disabled={busy} onClick={() => setEditor({ product: null })}>+ Add Product</button>
          {menu.public_url && <a className="inv-secondary" href={menu.public_url} target="_blank" rel="noreferrer">View public menu</a>}</div>
        <nav className="inv-category-filters" aria-label="Filter menu by category"><button className={`inv-category-filter ${selectedCategory === 'all' ? 'active' : ''}`} type="button" onClick={() => setSelectedCategory('all')}>All Products <span>{products.length}</span></button>
          {categories.map(category => <div className="inv-category-filter-group" key={category.category_id}><button className={`inv-category-filter ${selectedCategory === category.name ? 'active' : ''}`} type="button" onClick={() => setSelectedCategory(category.name)}>{category.name}</button><button className="inv-category-manage-trigger" type="button" aria-label={`Manage ${category.name} category`} onClick={() => setCategoryManager(category)}><Settings size={13} /></button></div>)}
        </nav>
        {products.length === 0 && <p role="status">This menu has no products yet. Add a category and product to get started.</p>}
        <p id="inv-drag-help" className="inv-drag-help">Drag a product or select it and choose Move here.</p>
        <div className="inv-board">{STATES.map(state => <InventoryColumn key={state} state={state} products={visible.filter(product => product.state === state)} busyId={busy ? 'busy' : ''} onStateChange={changeState} onEdit={product => setEditor({ product })} onArchive={archive} movement={movement} states={STATES} labels={LABELS} />)}</div>
        <InventoryDragFeedback drag={movement.drag} labels={LABELS} />
      </>}
    </div>
    {editor && <ProductDialog key={editor.product?.product_id || 'new'} product={products.find(product => product.product_id === editor.product?.product_id) || null} categories={categories} initialState="on_menu" onClose={() => setEditor(null)}
      onCreate={body => mutate('/products', restaurantProductBody(body, categories))}
      onSave={async (id, body) => {
        const { currentCatalog } = await mutate(`/products/${encodeURIComponent(id)}`, restaurantProductBody(body, categories), 'PATCH');
        const saved = currentCatalog.products.find(product => product.product_id === id);
        if (!saved) throw new Error('The saved product was not present when the menu was refreshed.');
        return saved;
      }} />}
    {categoryEditor && <CategoryDialog categories={categories} session={session} subcategories={false} onClose={() => setCategoryEditor(false)} onSaved={load} />}
    {categoryManager && <CategoryManagerDialog category={categoryManager} productCount={products.filter(product => product.category_name === categoryManager.name).length} session={session} onClose={() => setCategoryManager(null)} onDeleted={load} />}
  </main>;
}

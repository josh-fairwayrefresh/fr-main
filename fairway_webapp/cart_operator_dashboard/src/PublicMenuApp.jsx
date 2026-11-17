import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Beer, ChevronDown, GlassWater, Martini, RefreshCw, Sandwich, Utensils } from 'lucide-react';
import { publicMenuRequest } from './lib/inventoryApi.mjs';
import { formatPrice, formatPublishedAt, groupPublishedProducts } from './lib/inventoryModel.mjs';
import fairwayRefreshLogo from '../../../docs/logo_source_files/fairway-refresh/fairway-refresh-horizontal-transparent.png';
import './public-menu.css';

const CATEGORY_ICONS = {
  'craft beers': Beer,
  shots: GlassWater,
  cocktails: Martini,
  'canned cocktails': CannedCocktailIcon,
  food: Sandwich,
};

function CannedCocktailIcon({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 3h10l-.8 17H7.8L7 3Z" />
    <path d="M7.2 6h9.6M9 3V2h6v1M10 11h4" />
  </svg>;
}

function CategoryMark({ name }) {
  if (name.trim().toLowerCase() === 'non-alcoholic') return 'NA';
  const Icon = CATEGORY_ICONS[name.trim().toLowerCase()] || Utensils;
  return <Icon size={16} strokeWidth={2.25} />;
}

function ProductRow({ product }) {
  const price = formatPrice(product.price);
  return <li className="pm-product">
    <div className="pm-product-copy">
      <strong>{product.name}</strong>
      {product.brand && <span className="pm-brand">{product.brand}</span>}
      {product.description && <p>{product.description}</p>}
    </div>
    <div className="pm-product-meta">
      {price && <span className="pm-price">{price}</span>}
      <span className="pm-availability">Available</span>
    </div>
  </li>;
}

function ProductList({ products }) {
  if (products.length === 0) return null;
  return <ul className="pm-products">{products.map((product) => <ProductRow key={product.product_id} product={product} />)}</ul>;
}

function CategorySection({ category, expanded, onToggle, index }) {
  return <section className={`pm-category-section pm-tone-${index % 6}`}>
    <button
      className={`pm-category-card ${expanded ? 'expanded' : ''}`}
      type="button"
      aria-expanded={expanded}
      aria-controls={`pm-products-${index}`}
      onClick={onToggle}
    >
      <span className="pm-category-mark" aria-hidden="true"><CategoryMark name={category.name} /></span>
      <span className="pm-category-copy"><strong>{category.name}</strong><small>{category.count} {category.count === 1 ? 'item' : 'items'}</small></span>
      <ChevronDown size={19} aria-hidden="true" />
    </button>
    {expanded && <div id={`pm-products-${index}`} className="pm-category-products">
      {category.note && <p className="pm-category-note">{category.note}</p>}
      <ProductList products={category.products} />
      {category.subcategories.map((subcategory) => (
        <details className="pm-subcategory" key={subcategory.name} open>
          <summary><span>{subcategory.name}</span><small>{subcategory.products.length} {subcategory.products.length === 1 ? 'item' : 'items'}</small></summary>
          <ProductList products={subcategory.products} />
        </details>
      ))}
    </div>}
  </section>;
}

function MenuMessage({ title, detail, retry }) {
  return <section className="pm-message" role={retry ? 'alert' : 'status'}>
    <h2>{title}</h2>
    <p>{detail}</p>
    {retry && <button className="pm-retry" type="button" onClick={retry}><RefreshCw size={16} />Try again</button>}
  </section>;
}

// Customer logos are served by the menu API; only its relative paths are accepted.
function customerLogoUrl(apiBaseUrl, logoUrl) {
  return typeof logoUrl === 'string' && /^\/(?!\/)/.test(logoUrl) ? `${apiBaseUrl}${logoUrl}` : null;
}

// Shared template header for every Customer menu: Fairway Refresh · AT · Customer.
// The Customer slot shows the Customer-owned logo, or the Customer name when
// no logo is assigned or it cannot be loaded.
function BrandLockup({ apiBaseUrl, menu }) {
  const logoUrl = customerLogoUrl(apiBaseUrl, menu?.branding?.logo_url);
  const [failedUrl, setFailedUrl] = useState(null);
  const customerName = menu?.customer_name || menu?.course_name || '';
  return <div className="pm-brand-lockup">
    <img className="pm-fairway-logo" src={fairwayRefreshLogo} alt="Fairway Refresh" />
    <span className="pm-at">AT</span>
    {logoUrl && failedUrl !== logoUrl
      ? <img className="pm-course-logo" src={logoUrl} alt={customerName || 'Customer'} onError={() => setFailedUrl(logoUrl)} />
      : <span className="pm-customer-name">{customerName}</span>}
  </div>;
}

export default function PublicMenuApp({ apiBaseUrl, slug }) {
  const [status, setStatus] = useState('loading');
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState('');
  const [expandedCategory, setExpandedCategory] = useState(-1);
  const requestRef = useRef(null);
  const categories = useMemo(() => groupPublishedProducts(menu?.products, menu?.categories), [menu]);

  const loadMenu = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setError('');
    try {
      const result = await publicMenuRequest(apiBaseUrl, slug, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!result || !Array.isArray(result.products) ||
          (result.categories != null && !Array.isArray(result.categories)) ||
          (result.subtitle != null && typeof result.subtitle !== 'string' &&
            !(Array.isArray(result.subtitle) && result.subtitle.every(line => typeof line === 'string')))) {
        throw new Error('The menu response could not be verified.');
      }
      setMenu(result);
      setStatus('ready');
    } catch (reason) {
      if (controller.signal.aborted || reason.name === 'AbortError') return;
      setError(reason.message);
      setStatus('unavailable');
    }
  }, [apiBaseUrl, slug]);

  useEffect(() => {
    setMenu(null);
    setStatus('loading');
    setExpandedCategory(-1);
    loadMenu();
    return () => {
      requestRef.current?.abort();
    };
  }, [loadMenu]);

  const lastUpdated = formatPublishedAt(menu?.updated_at, menu?.timezone);
  const menuName = menu?.name || menu?.course_name || 'Menu';

  return <main className="public-menu-app">
    <div className="pm-gold-rule" />
    <header className="pm-header">
      <BrandLockup apiBaseUrl={apiBaseUrl} menu={menu} />
      <div className="pm-heading">
        <p>{menu?.customer_name || menuName}</p>
        <h1>{menu?.title || menuName}</h1>
        {(Array.isArray(menu?.subtitle) ? menu.subtitle : menu?.subtitle ? [menu.subtitle] : []).map(line => <p key={line}>{line}</p>)}
        <span id="menu-last-updated" data-field="updated_at" className="pm-last-updated">
          LAST UPDATED: {lastUpdated || '—'}
        </span>
      </div>
    </header>

    {status === 'loading' && <MenuMessage title="Loading menu" detail="The current menu is loading." />}
    {status === 'unavailable' && <MenuMessage title="Menu unavailable" detail={error || 'Please try again shortly.'} retry={() => loadMenu()} />}
    {status === 'ready' && categories.length === 0 && <MenuMessage title="No items listed" detail="There are no items currently on this menu." />}
    {status === 'ready' && categories.length > 0 && <>
      <p className="pm-section-label">BROWSE BY CATEGORY</p>
      <div className="pm-category-grid">
        {categories.map((category, index) => <CategorySection
          key={category.name}
          category={category}
          index={index}
          expanded={expandedCategory === index}
          onToggle={() => setExpandedCategory(expandedCategory === index ? -1 : index)}
        />)}
      </div>
    </>}
    <footer className="pm-footer">{menu?.footer || <>Fairway Refresh <span>·</span> {menuName}</>}</footer>
  </main>;
}
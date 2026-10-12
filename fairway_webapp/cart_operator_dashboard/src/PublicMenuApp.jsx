import React, { useEffect, useMemo, useState } from 'react';
import { Beer, ChevronDown, GlassWater, Martini, RefreshCw, Sandwich } from 'lucide-react';
import { publicMenuRequest } from './lib/inventoryApi.mjs';
import { formatPrice, formatPublishedAt, groupPublishedProducts } from './lib/inventoryModel.mjs';
import { courseMenuConfig } from './lib/courseMenuConfig';
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
      <span className={`pm-availability ${product.state === 'sold_out' ? 'sold-out' : ''}`}>
        {product.state === 'sold_out' ? 'Sold Out' : 'Available'}
      </span>
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

export default function PublicMenuApp({ apiBaseUrl, slug }) {
  const config = courseMenuConfig[slug];
  const [status, setStatus] = useState('loading');
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState('');
  const [expandedCategory, setExpandedCategory] = useState(0);
  const categories = useMemo(() => groupPublishedProducts(menu?.products), [menu]);

  async function loadMenu(signal) {
    if (!config) {
      setStatus('unavailable');
      setError('This course menu is not configured.');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const result = await publicMenuRequest(apiBaseUrl, config.apiSlug, { signal });
      setMenu(result);
      setExpandedCategory(0);
      setStatus('ready');
    } catch (reason) {
      if (reason.name === 'AbortError') return;
      setError(reason.message);
      setStatus(reason.status === 404 ? 'unpublished' : 'unavailable');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadMenu(controller.signal);
    return () => controller.abort();
  }, [apiBaseUrl, slug]);

  const lastUpdated = formatPublishedAt(menu?.published_at, config?.timeZone);

  return <main className="public-menu-app">
    <div className="pm-gold-rule" />
    <header className="pm-header">
      <div className="pm-brand-lockup">
        <img className="pm-fairway-logo" src={config?.fairwayLogo} alt="Fairway Refresh" />
        <span className="pm-at">AT</span>
        <img className="pm-course-logo" src={config?.courseLogo} alt="Monarch Bay Golf Club" />
      </div>
      <div className="pm-heading">
        <p>{config?.courseName || 'COURSE MENU'}</p>
        <h1>Today’s Cart Menu</h1>
        <span id="menu-last-updated" data-field="published_at" className="pm-last-updated">
          LAST UPDATED: {lastUpdated || '—'}
        </span>
      </div>
    </header>

    {status === 'loading' && <MenuMessage title="Loading menu" detail="The latest published menu is loading." />}
    {status === 'unpublished' && <MenuMessage title="Menu not published yet" detail="Please check back later." />}
    {status === 'unavailable' && <MenuMessage title="Menu unavailable" detail={error || 'Please try again shortly.'} retry={() => loadMenu()} />}
    {status === 'ready' && categories.length === 0 && <MenuMessage title="No items listed" detail="There are no available items on the current published menu." />}
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
    <footer className="pm-footer">Fairway Refresh <span>·</span> {config?.courseName}</footer>
  </main>;
}
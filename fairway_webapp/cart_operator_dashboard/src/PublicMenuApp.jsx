import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { publicMenuRequest } from './lib/inventoryApi.mjs';
import { formatPublishedAt, groupPublishedProducts } from './lib/inventoryModel.mjs';
import MenuCategoryGrid from './MenuCategoryGrid';
// Trimmed web derivative of docs/logo_source_files/fairway-refresh/fairway-refresh-stacked-transparent.png.
import fairwayRefreshStackedLogo from './assets/fairway-refresh-stacked-web.png';
import fairwayRefreshLogo from '../../../docs/logo_source_files/fairway-refresh/fairway-refresh-horizontal-transparent.png';
import './public-menu.css';

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
// Cart menus use the stacked logo with tagline; other menus keep the horizontal
// logo. Nothing is shown in that slot until the menu type is known.
// The Customer slot shows the Customer-owned logo, or the Customer name when
// no logo is assigned or it cannot be loaded.
function BrandLockup({ apiBaseUrl, menu, loading }) {
  const logoUrl = customerLogoUrl(apiBaseUrl, menu?.branding?.logo_url);
  const [failedUrl, setFailedUrl] = useState(null);
  const customerName = menu?.customer_name || menu?.course_name || '';
  return <div className="pm-brand-lockup">
    {menu?.type === 'cart'
      ? <span className="pm-fr-stack">
        <img className="pm-fairway-logo" src={fairwayRefreshStackedLogo} alt="Fairway Refresh" />
        <span className="pm-tagline"><b>Push Button.</b> Stay Refreshed.</span>
      </span>
      : loading ? <span className="pm-fr-pending" /> : <img className="pm-fairway-logo" src={fairwayRefreshLogo} alt="Fairway Refresh" />}
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
      <BrandLockup apiBaseUrl={apiBaseUrl} menu={menu} loading={!menu && status === 'loading'} />
      {menu?.type === 'cart' ? <><h1 className="pm-visually-hidden">{menu.title || menuName}</h1><p className="pm-pay">
        <span className="pm-pay-icon" aria-hidden="true"><CreditCard size={16} strokeWidth={2.25} /></span>
        PAY AT THE CART ONLY
      </p></> : menu && <div className="pm-heading">
        <p>{menu.customer_name || menuName}</p>
        <h1>{menu.title || menuName}</h1>
        {(Array.isArray(menu.subtitle) ? menu.subtitle : menu.subtitle ? [menu.subtitle] : []).map(line => <p key={line}>{line}</p>)}
        <span id="menu-last-updated" data-field="updated_at" className="pm-last-updated">
          LAST UPDATED: {lastUpdated || '—'}
        </span>
      </div>}
    </header>

    {status === 'loading' && <MenuMessage title="Loading menu" detail="The current menu is loading." />}
    {status === 'unavailable' && <MenuMessage title="Menu unavailable" detail={error || 'Please try again shortly.'} retry={() => loadMenu()} />}
    {status === 'ready' && categories.length === 0 && <MenuMessage title="No items listed" detail="There are no items currently on this menu." />}
    {status === 'ready' && categories.length > 0 && <MenuCategoryGrid key={slug} categories={categories} />}
    <footer className="pm-footer">{menu?.footer || <>Fairway Refresh <span>·</span> {menuName}</>}</footer>
  </main>;
}
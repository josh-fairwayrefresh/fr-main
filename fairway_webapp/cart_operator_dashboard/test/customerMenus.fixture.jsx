import React from 'react';
import { createRoot } from 'react-dom/client';
import MenuWorkspace from '../src/MenuWorkspace';
import PublicMenuApp from '../src/PublicMenuApp';
import { AccountSignOutProvider, useAccountSignOut } from '../src/AccountSignOut';

const user = { uid: 'fictional-user', email: 'fictional@example.invalid', getIdToken: async () => 'fictional' };
const customer = {
  customer_id: 'TEST-CUSTOMER', customer_name: 'Fictional Customer', menus: [
    { menu_id: 'TEST-CART', name: 'Fictional Cart', type: 'cart', state: 'active', asset_id: 'TEST-COURSE', public_url: '/cartmenus/fictional-cart' },
    { menu_id: 'TEST-RESTAURANT', name: 'Fictional Restaurant', type: 'restaurant', state: 'active', public_url: '/cartmenus/fictional-restaurant' },
  ],
};
const shift = { shift_id: 'legacy-shift', staff_id: 'staff-1', staff_name: 'Fictional Staff', has_activity: true };
const categories = [{ category_id: 'c1', name: 'Sandwiches', subcategories: [] }];
const restaurantProducts = [{ product_id: 'p1', category_id: 'c1', category_name: 'Sandwiches', name: 'Fictional Burger', state: 'on_menu', price: { amount_minor: 1200, currency_code: 'USD' } }];
const cartProducts = [{ product_id: 'p2', category_id: 'c1', category_name: 'Sandwiches', name: 'Fictional Cart Snack', state: 'on_cart', quantity: 3, stock_revision: 0 }];
globalThis.fixtureRequests = [];
globalThis.fixtureSignedOut = false;
window.fetch = async (input, options = {}) => {
  const url = new URL(input, location.origin);
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  const path = url.pathname;
  globalThis.fixtureRequests.push({ path, method, body, search: url.search });
  if (path.startsWith('/api/v1/public/menus/')) {
    if (path.endsWith('/archived')) return Response.json({ message: 'This menu is unavailable.' }, { status: 410 });
    return Response.json({
      customer_name: 'Fictional Customer', name: 'Fictional Restaurant', title: 'THE FICTIONAL',
      subtitle: 'FICTIONAL BISTRO', footer: 'Thank you for dining with us!',
      timezone: 'America/Los_Angeles', updated_at: '2026-01-15T20:05:00Z',
      branding: { logo_url: '/icons/logo-and-name-row-banner.jpg' },
      categories: [{ name: 'Sandwiches', note: 'Fictional cooking note' }],
      products: [{ ...restaurantProducts[0], category: 'Sandwiches' }],
    });
  }
  if (path.endsWith('/shifts/session')) return Response.json({ shift });
  if (path.endsWith('/staff')) return Response.json({ staff: [{ staff_id: 'staff-1', name: 'Fictional Staff', active: true }] });
  if (path === '/api/v1/inventory/customers/TEST-CUSTOMER/TEST-COURSE') return Response.json({
    customer_id: 'TEST-CUSTOMER', asset_id: 'TEST-COURSE', course_id: 'TEST-COURSE',
    customer_name: 'Fictional Customer', course_name: 'Fictional Course', timezone: 'America/Los_Angeles',
    products: cartProducts, categories, inventory_revision: 1, daily_sales: { total_units: 1, products: [] },
  });
  const base = '/api/v1/menus/customers/TEST-CUSTOMER/TEST-RESTAURANT';
  if (path === base) return Response.json({ menu: customer.menus[1], products: restaurantProducts, categories });
  if (path === `${base}/products/p1` && method === 'PATCH') {
    Object.assign(restaurantProducts[0], body);
    return Response.json({ product: restaurantProducts[0] });
  }
  throw new Error(`Unexpected fictional request ${method} ${path}`);
};

function Workspace() {
  const signOut = useAccountSignOut();
  return <MenuWorkspace user={user} apiBaseUrl={location.origin} customers={[customer]} isAdmin
    onOpenAdmin={() => {}} onSignOut={signOut} />;
}

const publicSlug = new URLSearchParams(location.search).get('public');
if (!publicSlug) {
  sessionStorage.setItem('inventory-session:fictional-user:TEST-CUSTOMER:TEST-COURSE', JSON.stringify({
    session_id: 'legacy-session', pending: {}, shift, revision: 1,
  }));
}
createRoot(document.getElementById('root')).render(publicSlug
  ? <PublicMenuApp apiBaseUrl={location.origin} slug={publicSlug} />
  : <AccountSignOutProvider getUser={() => user} apiBaseUrl={location.origin} onSignOut={() => { globalThis.fixtureSignedOut = true; }}>
      <Workspace />
    </AccountSignOutProvider>);

import React, { useState } from 'react';
import InventoryApp from './InventoryApp';
import RestaurantMenuApp from './RestaurantMenuApp';

export default function MenuWorkspace({ user, apiBaseUrl, customers, isAdmin, onOpenAdmin, onSignOut }) {
  const entries = customers.flatMap(customer => customer.menus
    .filter(menu => menu.state === 'active')
    .map(menu => ({ customer, menu, key: `${customer.customer_id}/${menu.menu_id}` })));
  const [selectedId, setSelectedId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('menu_id');
    const customer = params.get('customer_id');
    const legacy = params.get('course_id');
    return entries.find(entry => entry.customer.customer_id === customer && entry.menu.menu_id === requested)?.key
      || entries.find(entry => entry.customer.customer_id === customer && entry.menu.type === 'cart' && entry.menu.asset_id === legacy)?.key
      || (!requested && !legacy && entries.length === 1 ? entries[0].key : '');
  });
  const selected = entries.find(entry => entry.key === selectedId);
  if (!selected) return <main className="inventory-app"><section className="inv-empty-access">
    <h1>Select a menu</h1>
    {entries.length === 0 ? <p>This account has no menu access.</p> : entries.map(({ customer, menu, key }) => <button className="inv-secondary" type="button" key={key} onClick={() => setSelectedId(key)}>{customer.customer_name} · {menu.name} ({menu.type === 'cart' ? 'Cart' : 'Restaurant'})</button>)}
    {isAdmin && <button className="inv-secondary" type="button" onClick={onOpenAdmin}>Admin</button>}
    <button className="inv-secondary" type="button" onClick={onSignOut}>Sign out</button>
  </section></main>;
  const common = { user, apiBaseUrl, isAdmin, onOpenAdmin, onSignOut, onSelectMenu: () => setSelectedId('') };
  if (selected.menu.type === 'restaurant') return <RestaurantMenuApp key={`${selected.customer.customer_id}:${selected.menu.menu_id}`} {...common} customer={selected.customer} menu={selected.menu} />;
  const { customer, menu } = selected;
  const asset = {
    customer_id: customer.customer_id, customer_name: customer.customer_name,
    course_id: menu.asset_id, asset_id: menu.asset_id, course_name: menu.course_name || menu.name,
    menu_id: menu.menu_id, public_url: menu.public_url, timezone: menu.timezone,
  };
  return <InventoryApp key={`${customer.customer_id}:${menu.menu_id}`} {...common} courses={[asset]} />;
}

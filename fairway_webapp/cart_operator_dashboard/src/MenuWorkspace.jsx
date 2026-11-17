import React, { useState } from 'react';
import InventoryApp from './InventoryApp';
import RestaurantMenuApp from './RestaurantMenuApp';

export default function MenuWorkspace({ user, apiBaseUrl, customers, inventoryCourses = [], isAdmin, onOpenAdmin, onSignOut }) {
  const menuEntries = customers.flatMap(customer => customer.menus
    .filter(menu => menu.state === 'active')
    .map(menu => ({ kind: 'menu', customer, menu, key: `${customer.customer_id}/${menu.menu_id}` })));
  const menuAssets = new Set(menuEntries.filter(entry => entry.menu.type === 'cart')
    .map(entry => `${entry.customer.customer_id}/${entry.menu.asset_id}`));
  const inventoryEntries = inventoryCourses
    .filter(course => !menuAssets.has(`${course.customer_id}/${course.course_id}`))
    .map(course => ({
      kind: 'inventory',
      customer: { customer_id: course.customer_id, customer_name: course.customer_name },
      asset: course,
      key: `${course.customer_id}/${course.course_id}/inventory`,
    }));
  const entries = [...menuEntries, ...inventoryEntries];
  const [selectedId, setSelectedId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('menu_id');
    const customer = params.get('customer_id');
    const legacy = params.get('course_id');
    return entries.find(entry => entry.kind === 'menu' &&
      entry.customer.customer_id === customer && entry.menu.menu_id === requested)?.key
      || entries.find(entry => entry.customer.customer_id === customer &&
        ((entry.kind === 'menu' && entry.menu.type === 'cart' && entry.menu.asset_id === legacy) ||
          (entry.kind === 'inventory' && entry.asset.course_id === legacy)))?.key
      || (!requested && !legacy && entries.length === 1 ? entries[0].key : '');
  });
  const selected = entries.find(entry => entry.key === selectedId);
  if (!selected) return <main className="inventory-app"><section className="inv-empty-access">
    <h1>Select a menu or inventory</h1>
    {entries.length === 0 ? <p>This account has no menu or cart-inventory access.</p> : entries.map(entry => (
      <button className="inv-secondary" type="button" key={entry.key} onClick={() => setSelectedId(entry.key)}>
        {entry.customer.customer_name} · {entry.kind === 'inventory'
          ? `${entry.asset.course_name} (Cart inventory; no public menu)`
          : `${entry.menu.name} (${entry.menu.type === 'cart' ? 'Cart' : 'Restaurant'})`}
      </button>
    ))}
    {isAdmin && <button className="inv-secondary" type="button" onClick={onOpenAdmin}>Admin</button>}
    <button className="inv-secondary" type="button" onClick={onSignOut}>Sign out</button>
  </section></main>;
  const common = { user, apiBaseUrl, isAdmin, onOpenAdmin, onSignOut, onSelectMenu: () => setSelectedId('') };
  if (selected.kind === 'inventory') {
    return <InventoryApp key={selected.key} {...common} courses={[{
      ...selected.asset,
      public_menu_unavailable: true,
    }]} />;
  }
  if (selected.menu.type === 'restaurant') return <RestaurantMenuApp key={`${selected.customer.customer_id}:${selected.menu.menu_id}`} {...common} customer={selected.customer} menu={selected.menu} />;
  const { customer, menu } = selected;
  const asset = {
    customer_id: customer.customer_id, customer_name: customer.customer_name,
    course_id: menu.asset_id, asset_id: menu.asset_id, course_name: menu.course_name || menu.name,
    menu_id: menu.menu_id, public_url: menu.public_url, timezone: menu.timezone,
  };
  return <InventoryApp key={`${customer.customer_id}:${menu.menu_id}`} {...common} courses={[asset]} />;
}

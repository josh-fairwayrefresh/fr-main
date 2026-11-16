export function normalizeMenuBootstrap(result) {
  if (!Array.isArray(result?.customers)) throw new Error('The menu access directory could not be verified.');
  const customers = new Set();
  for (const customer of result.customers) {
    if (!customer || typeof customer.customer_id !== 'string' || !customer.customer_id ||
        typeof customer.customer_name !== 'string' || !Array.isArray(customer.menus) ||
        customers.has(customer.customer_id)) throw new Error('The menu access directory could not be verified.');
    customers.add(customer.customer_id);
    const menuIds = new Set();
    for (const menu of customer.menus) {
      if (!menu || typeof menu.menu_id !== 'string' || !menu.menu_id || menuIds.has(menu.menu_id) ||
          typeof menu.name !== 'string' || !['cart', 'restaurant'].includes(menu.type) ||
          !['active', 'archived'].includes(menu.state) ||
          (menu.type === 'cart' && (typeof menu.asset_id !== 'string' || !menu.asset_id))) {
        throw new Error('The menu access directory could not be verified.');
      }
      menuIds.add(menu.menu_id);
    }
  }
  return result.customers.filter(customer => customer.menus.some(menu => menu.state === 'active'));
}

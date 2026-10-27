export const INVENTORY_STATES = Object.freeze(['on_cart', 'sold_out', 'in_inventory']);
export const INVENTORY_STATE_LABELS = Object.freeze({
  on_cart: 'On Cart',
  sold_out: 'Sold Out',
  in_inventory: 'In Inventory',
});
export const PRODUCT_DRAFT_FIELDS = Object.freeze([
  'name',
  'category_name',
  'subcategory_name',
  'brand',
  'description',
  'price_amount',
]);

export function mergeProductDraft(base, local, remote) {
  return Object.fromEntries(PRODUCT_DRAFT_FIELDS.map((field) => [
    field,
    local[field] !== base[field] ? local[field] : remote[field],
  ]));
}

export function usdPriceInput(price) {
  if (!price || price.currency_code !== 'USD' || !Number.isSafeInteger(price.amount_minor)) return '';
  const dollars = Math.floor(price.amount_minor / 100);
  const cents = String(price.amount_minor % 100).padStart(2, '0');
  return `${dollars}.${cents}`;
}

export function usdPriceFromInput(value) {
  const amount = String(value ?? '').trim();
  if (!amount) return { price: null, error: null };
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return { price: null, error: 'Enter a nonnegative dollar amount with up to two decimal places.' };
  const wholeDollars = Number(match[1]);
  const cents = Number((match[2] || '').padEnd(2, '0'));
  const amountMinor = wholeDollars * 100 + cents;
  if (!Number.isSafeInteger(amountMinor)) return { price: null, error: 'Dollar amount is too large.' };
  return { price: { amount_minor: amountMinor, currency_code: 'USD' }, error: null };
}

export function filterInventoryByCategory(products = [], categoryName = 'all') {
  const active = products.filter((product) => product.archived !== true);
  return categoryName === 'all'
    ? active
    : active.filter((product) => product.category_name === categoryName);
}

export function filterInventoryBySubcategory(products = [], subcategoryName = 'all') {
  return subcategoryName === 'all'
    ? products
    : products.filter((product) => product.subcategory_name === subcategoryName);
}

export function subcategoryNamesInProducts(products = []) {
  const names = new Set();
  for (const product of products) {
    if (product.subcategory_name) names.add(product.subcategory_name);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

export function matchCoursePresentation(course, presentations) {
  if (!course) return null;
  return presentations.find((presentation) => (
    presentation.customerName === course.customer_name &&
    presentation.courseName === course.course_name
  )) || null;
}

export function groupPublishedProducts(products = []) {
  const categories = new Map();
  for (const product of products) {
    if (product.archived === true || product.state !== 'on_cart') continue;
    const categoryName = product.category || product.category_name;
    if (typeof categoryName !== 'string' || !categoryName.trim()) continue;
    if (!categories.has(categoryName)) {
      categories.set(categoryName, { name: categoryName, products: [], subcategories: new Map() });
    }
    const category = categories.get(categoryName);
    if (!product.subcategory) {
      category.products.push(product);
      continue;
    }
    if (!category.subcategories.has(product.subcategory)) {
      category.subcategories.set(product.subcategory, []);
    }
    category.subcategories.get(product.subcategory).push(product);
  }
  return [...categories.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((category) => ({
      ...category,
      subcategories: [...category.subcategories.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, items]) => ({ name, products: items })),
      count: category.products.length + [...category.subcategories.values()].reduce((sum, items) => sum + items.length, 0),
    }));
}

export function timestampDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
    if (typeof seconds === 'number') {
      const date = new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6));
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPublishedAt(value, timeZone) {
  const date = timestampDate(value);
  if (!date || !timeZone) return null;
  const dateText = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
  const timeText = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
  return `${dateText} ${timeText}`;
}

export function formatPrice(price, locale = 'en-US') {
  if (!price || !Number.isSafeInteger(price.amount_minor) ||
      typeof price.currency_code !== 'string' || !/^[A-Z]{3}$/.test(price.currency_code)) return null;
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: price.currency_code,
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits;
  return formatter.format(price.amount_minor / (10 ** fractionDigits));
}
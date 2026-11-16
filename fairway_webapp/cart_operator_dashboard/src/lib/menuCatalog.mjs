export function normalizeRestaurantCatalog(result) {
  if (!result || !Array.isArray(result.products) || !Array.isArray(result.categories)) {
    throw new Error('The menu catalog could not be verified.');
  }
  const categories = result.categories;
  const products = result.products.map(product => {
    if (!product || typeof product.product_id !== 'string' ||
        !['on_menu', 'sold_out', 'in_inventory'].includes(product.state)) {
      throw new Error('The menu contains an invalid product.');
    }
    const category = categories.find(item => item.category_id === product.category_id);
    const subcategory = category?.subcategories?.find(item => item.subcategory_id === product.subcategory_id);
    if (!product.category_name && !category?.name) throw new Error('The menu contains an unknown category.');
    return {
      ...product,
      category_name: product.category_name || category?.name || '',
      subcategory_name: product.subcategory_name || subcategory?.name || null,
    };
  });
  return { ...result, categories, products };
}

export function restaurantProductBody(body, categories) {
  const category = categories.find(item => item.name.toLocaleLowerCase() === body.category_name.toLocaleLowerCase());
  if (!category) throw new Error('Select an existing category.');
  const { category_name, subcategory_name, ...rest } = body;
  const subcategory = category.subcategories?.find(item => item.name === subcategory_name);
  if (subcategory_name && !subcategory) throw new Error('Select an existing subcategory.');
  return { ...rest, category_id: category.category_id, subcategory_id: subcategory?.subcategory_id || null };
}

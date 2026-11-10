import definitions from '../../../../fairway_backend/cloudrun_receiver/lib/service_categories.json';

export const serviceCategories = Object.freeze(Object.values(definitions).map(Object.freeze));

export function serviceCategory(id) {
  const category = serviceCategories.find((item) => item.id === id);
  if (!category) throw new Error(`Unknown service category: ${id}`);
  return category;
}

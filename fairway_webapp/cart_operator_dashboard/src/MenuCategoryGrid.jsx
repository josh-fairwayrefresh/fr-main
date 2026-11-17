import React, { useState } from 'react';
import { Beer, ChevronDown, GlassWater, Martini, Sandwich, Utensils } from 'lucide-react';
import { formatPrice } from './lib/inventoryModel.mjs';
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

// Shared golfer-menu category grid. An opened category spans the full row and
// returns to its grid cell when closed. Used by every public menu and the
// Driving Range bay page so menus present identically everywhere.
export default function MenuCategoryGrid({ categories }) {
  const [expandedCategory, setExpandedCategory] = useState(-1);
  return <>
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
  </>;
}

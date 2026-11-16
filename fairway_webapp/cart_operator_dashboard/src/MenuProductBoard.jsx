import React from 'react';
import { Archive, ChevronDown, Eye, ShoppingCart } from 'lucide-react';
import { formatPrice } from './lib/inventoryModel.mjs';

export function ProductTile({ product, busy, onStateChange, onEdit, onArchive, movement, onStock, states, labels }) {
  const description = product.description || product.brand;
  return <article className={`inv-product-tile ${movement.drag?.product.product_id === product.product_id ? 'is-dragging' : ''}`} {...movement.bindings(product)}>
    <div className="inv-product-heading"><button className="inv-drag-handle" data-inventory-drag-handle type="button" disabled={busy} aria-label={`Move ${product.name}`} aria-pressed={movement.drag?.product.product_id === product.product_id} aria-describedby="inv-drag-help" onClick={() => movement.pick(product)}><span aria-hidden="true">::</span><strong>{product.name}</strong></button><div className="inv-product-actions"><button className="inv-icon-button" type="button" onClick={() => onEdit(product)} title="Edit product" aria-label={`Edit ${product.name}`}><Eye size={16} /></button><button className="inv-icon-button" type="button" onClick={() => onArchive(product)} title="Archive product" aria-label={`Archive ${product.name}`}><Archive size={16} /></button></div></div>
    {(product.subcategory_name || description) && <p className="inv-product-detail">{[product.subcategory_name, product.brand, product.description].filter(Boolean).join(' · ')}</p>}
    {formatPrice(product.price) && <p className="inv-product-price">{formatPrice(product.price)}</p>}
    {onStock && <div className="inv-stock-controls"><button type="button" disabled={busy} onClick={() => onStock({ product, kind: 'adjustment' })} aria-label={`Edit quantity for ${product.name}`}>Quantity: <strong>{product.quantity ?? 0}</strong></button><button type="button" disabled={busy || product.state !== 'on_cart'} onClick={() => onStock({ product, kind: 'sale' })} aria-label={`Record sale for ${product.name}`}><ShoppingCart size={16} />Sale</button></div>}
    <label className="inv-state-select"><span>Availability</span><select aria-label={`${product.name} state`} value={product.state} disabled={busy} onChange={(event) => onStateChange(product, event.target.value)}>{states.map((state) => <option key={state} value={state}>{labels[state]}</option>)}</select><ChevronDown size={14} /></label>
  </article>;
}

export function InventoryColumn({ state, products, busyId, onStateChange, onEdit, onArchive, movement, onStock, states, labels }) {
  return <section aria-label={`${labels[state]} products`} data-inventory-drop={state} className={`inv-column inv-column-${state} ${movement.drag?.target === state ? 'drag-over' : ''}`}>
    <header><div><h2>{labels[state]}</h2><span>{products.length}</span></div></header>
    {movement.drag?.keyboard && <button className="inv-move-here" type="button" disabled={movement.drag.product.state === state} onClick={() => movement.drop(state)}>Move here: {labels[state]}</button>}
    <div className="inv-column-products">{products.map((product) => <ProductTile key={product.product_id} product={product} busy={Boolean(busyId)} onStateChange={onStateChange} onEdit={onEdit} onArchive={onArchive} movement={movement} onStock={onStock} states={states} labels={labels} />)}{products.length === 0 && <p className="inv-empty-column">No products</p>}</div>
  </section>;
}

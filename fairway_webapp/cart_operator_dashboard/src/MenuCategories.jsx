import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';

export function CategoryDialog({ categories, session, onClose, onSaved, subcategories = true }) {
  const [kind, setKind] = useState('category');
  const [categoryId, setCategoryId] = useState(categories[0]?.category_id || '');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const suffix = kind === 'category' ? '/categories' : `/categories/${encodeURIComponent(categoryId)}/subcategories`;
      await session.request(suffix, { name });
      await onSaved();
      onClose();
    } catch (reason) { setError(reason.message); }
    finally { setPending(false); }
  }
  return <div className="inv-overlay"><section className="inv-dialog inv-small-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-category-title">
    <header><div><span className="inv-eyebrow">CATALOG ORGANIZATION</span><h2 id="inv-category-title">Add category</h2></div><button className="inv-icon-button" type="button" onClick={onClose} aria-label="Close category editor"><X size={19} /></button></header>
    <form onSubmit={submit}>
      {subcategories && <label>Type<select value={kind} onChange={event => setKind(event.target.value)}><option value="category">Category</option><option value="subcategory" disabled={categories.length === 0}>Subcategory</option></select></label>}
      {kind === 'subcategory' && <label>Parent category<select value={categoryId} onChange={event => setCategoryId(event.target.value)} required>{categories.map(category => <option key={category.category_id} value={category.category_id}>{category.name}</option>)}</select></label>}
      <label>{kind === 'category' ? 'Category name' : 'Subcategory name'}<input autoFocus maxLength="100" value={name} onChange={event => setName(event.target.value)} required /></label>
      {error && <p className="inv-form-error" role="alert">{error}</p>}
      <footer><button className="inv-secondary" type="button" onClick={onClose} disabled={pending}>Cancel</button><button className="inv-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Add'}</button></footer>
    </form>
  </section></div>;
}

export function CategoryManagerDialog({ category, productCount, session, onClose, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const canDelete = productCount === 0;
  async function confirmDelete() {
    setPending(true);
    setError('');
    try {
      await session.request(`/categories/${encodeURIComponent(category.category_id)}`, {}, 'DELETE');
      await onDeleted();
      onClose();
    } catch (reason) { setError(reason.message); setConfirming(false); }
    finally { setPending(false); }
  }
  return <div className="inv-overlay"><section className="inv-dialog inv-small-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-category-manage-title">
    <header><div><span className="inv-eyebrow">CATEGORY MANAGEMENT</span><h2 id="inv-category-manage-title">{category.name}</h2></div><button className="inv-icon-button" type="button" onClick={onClose} disabled={pending} aria-label="Close category management"><X size={19} /></button></header>
    <div className="inv-category-manage-body">
      <p className="inv-category-manage-detail"><strong>{productCount}</strong> {productCount === 1 ? 'product' : 'products'} in this category</p>
      {category.subcategories?.length > 0 && <div className="inv-category-manage-subcategories"><span>Subcategories</span><ul>{category.subcategories.map(subcategory => <li key={subcategory.subcategory_id}>{subcategory.name}</li>)}</ul></div>}
      {!canDelete && <p className="inv-category-manage-note">This category still has products. Reassign or remove its products before deleting it.</p>}
      {error && <p className="inv-form-error" role="alert">{error}</p>}
      {confirming ? <div className="inv-category-manage-confirm" role="alertdialog" aria-label={`Confirm deletion of ${category.name}`}>
        <p>Are you sure you want to delete the “{category.name}” category? This cannot be undone.</p>
        <div className="inv-category-manage-confirm-actions"><button className="inv-secondary" type="button" onClick={() => setConfirming(false)} disabled={pending}>Cancel</button><button className="inv-danger" type="button" onClick={confirmDelete} disabled={pending}>{pending ? 'Deleting…' : 'Yes, delete category'}</button></div>
      </div> : <footer><button className="inv-secondary" type="button" onClick={onClose}>Close</button><button className="inv-danger" type="button" onClick={() => setConfirming(true)} disabled={!canDelete} title={canDelete ? undefined : 'Reassign or remove its products first'}><Trash2 size={15} />Delete Category</button></footer>}
    </div>
  </section></div>;
}

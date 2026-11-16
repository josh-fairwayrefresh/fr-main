import React, { useEffect, useState } from 'react';
import { adminRequest, downloadBlob } from './adminApi';

export default function CustomerMenus({ user, apiBaseUrl, customer }) {
  const [menus, setMenus] = useState([]);
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const path = `/api/v1/admin/customers/${encodeURIComponent(customer.customer_id)}/menus`;

  async function load(signal) {
    setLoading(true);
    try {
      const result = await adminRequest(user, apiBaseUrl, path, { signal });
      if (!Array.isArray(result.menus)) throw new Error('The menu register could not be verified.');
      if (!signal?.aborted) { setMenus(result.menus); setError(''); }
    } finally { if (!signal?.aborted) setLoading(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message);
    });
    return () => controller.abort();
  }, [user, apiBaseUrl, customer.customer_id]);

  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  async function save(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const { menu_id, name, type, aliases, asset_id } = editing;
      const aliasList = aliases.split('\n').map(value => value.trim()).filter(Boolean);
      if (menu_id && (editing.originalAliases || []).some(alias => !aliasList.includes(alias))) {
        throw new Error('Existing aliases are permanent and cannot be removed.');
      }
      await adminRequest(user, apiBaseUrl, menu_id ? `${path}/${encodeURIComponent(menu_id)}` : path, {
        method: menu_id ? 'PATCH' : 'POST',
        body: { name: name.trim(), ...(menu_id ? {} : { type, ...(type === 'cart' ? { asset_id: asset_id.trim() } : {}) }),
          aliases: aliasList },
      });
      await load();
      setEditing(null);
    } catch (reason) { setError(reason.message); }
    finally { setPending(false); }
  }

  async function archive(menu) {
    if (!window.confirm(`Archive ${menu.name}? Its current URL and all previous aliases will become unavailable and cannot be reused.`)) return;
    setPending(true);
    setError('');
    try {
      await adminRequest(user, apiBaseUrl, `${path}/${encodeURIComponent(menu.menu_id)}`, {
        method: 'PATCH', body: { state: 'archived' },
      });
      await load();
    } catch (reason) { setError(reason.message); }
    finally { setPending(false); }
  }

  async function downloadQr(menu, format) {
    setPending(true);
    setError('');
    try {
      const blob = await adminRequest(user, apiBaseUrl,
        `${path}/${encodeURIComponent(menu.menu_id)}/qr?format=${format}`, { responseType: 'blob' });
      downloadBlob(blob, `${menu.menu_id}-qr.${format}`);
    } catch (reason) { setError(reason.message); }
    finally { setPending(false); }
  }

  async function previewQr(menu) {
    setPending(true);
    setError('');
    try {
      const blob = await adminRequest(user, apiBaseUrl,
        `${path}/${encodeURIComponent(menu.menu_id)}/qr?format=png`, { responseType: 'blob' });
      setPreview({ name: menu.name, url: URL.createObjectURL(blob) });
    } catch (reason) { setError(reason.message); }
    finally { setPending(false); }
  }

  return <section className="a-panel" aria-label={`${customer.customer_name} menus`}>
    <div className="a-section-heading"><div><p>CUSTOMER ASSETS</p><h3>Menus</h3></div>
      <button type="button" className="a-primary" disabled={pending} onClick={() => setEditing({ name: '', type: 'cart', asset_id: '', aliases: '' })}>Add menu</button>
    </div>
    {error && <p className="a-notice a-error" role="alert">{error} <button type="button" onClick={() => load().catch(reason => setError(reason.message))}>Retry</button></p>}
    {loading && <p role="status">Loading menus…</p>}
    {!loading && menus.length === 0 && !error && <p>No menus configured.</p>}
    {menus.map(menu => <div className="a-course-row" key={menu.menu_id}>
      <div><strong>{menu.name}</strong> · {menu.type === 'restaurant' ? 'Restaurant' : 'Cart'} · {menu.state}
        <p>{menu.public_url}</p>{menu.aliases?.length > 0 && <p>Aliases: {menu.aliases.join(', ')}</p>}
      </div>
      {menu.state !== 'archived' && <div className="a-actions">
        <button type="button" disabled={pending} onClick={() => setEditing({ ...menu, originalAliases: menu.aliases || [], aliases: (menu.aliases || []).join('\n') })}>Edit</button>
        <button type="button" disabled={pending} onClick={() => previewQr(menu)}>View QR</button>
        <button type="button" disabled={pending} onClick={() => downloadQr(menu, 'png')}>Download QR PNG</button>
        <button type="button" disabled={pending} onClick={() => downloadQr(menu, 'svg')}>Download QR SVG</button>
        <button type="button" disabled={pending} onClick={() => archive(menu)}>Archive</button>
      </div>}
    </div>)}
    {preview && <div role="dialog" aria-label={`${preview.name} QR code`}>
      <h4>{preview.name} QR code</h4><img src={preview.url} alt={`QR code for ${preview.name}`} />
      <button type="button" onClick={() => setPreview(null)}>Close QR</button>
    </div>}
    {editing && <form className="a-form" onSubmit={save} aria-label={editing.menu_id ? 'Edit menu' : 'Add menu'}>
      <h4>{editing.menu_id ? 'Edit menu' : 'Add menu'}</h4>
      <label>Name<input value={editing.name} pattern="[a-z0-9]+((_|-)[a-z0-9]+)*" maxLength="64" onChange={event => setEditing({ ...editing, name: event.target.value })} required /><small>Use lowercase letters, numbers, underscores or hyphens. This name determines the current public URL.</small></label>
      {!editing.menu_id && <label>Type<select value={editing.type} onChange={event => setEditing({ ...editing, type: event.target.value })}><option value="cart">Cart menu</option><option value="restaurant">Restaurant menu</option></select></label>}
      {!editing.menu_id && editing.type === 'cart' && <label>Existing Customer cart inventory asset ID<input value={editing.asset_id} onChange={event => setEditing({ ...editing, asset_id: event.target.value })} required /><small>The asset must already belong to this Customer.</small></label>}
      <label>Current public URL<input value={editing.name ? `https://app.fairwayrefresh.com/cartmenus/${customer.customer_id.toLowerCase()}_${editing.name}` : ''} readOnly /><small>Derived from the Customer identity and menu name. Renaming reserves the previous URL as a permanent alias; existing printed QR codes continue to work.</small></label>
      <label>Aliases, one per line<textarea value={editing.aliases} onChange={event => setEditing({ ...editing, aliases: event.target.value })} /><small>Existing aliases are permanent; new aliases may be added.</small></label>
      <div className="a-actions"><button type="button" disabled={pending} onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="a-primary" disabled={pending}>{pending ? 'Saving…' : 'Save menu'}</button></div>
    </form>}
  </section>;
}

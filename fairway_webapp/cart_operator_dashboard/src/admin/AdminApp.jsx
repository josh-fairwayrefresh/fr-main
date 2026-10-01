import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, BatteryMedium, Building2, Check, ChevronRight,
  Clipboard, Download, FileDown, Gauge, HardDrive, LayoutDashboard, MapPin,
  Plus, Radio, RefreshCw, Save, Search, ShieldCheck, Signal, Thermometer,
  Wrench, X,
} from 'lucide-react';
import { adminRequest, downloadBlob } from './adminApi';
import './admin.css';

const NAVIGATION = [
  ['overview', 'Overview / Fleet', LayoutDashboard],
  ['customers', 'Customers & Courses', Building2],
  ['provision', 'Provision Device', Plus],
  ['export', 'Device-to-SIM Export', FileDown],
];
const STATES = ['in_inventory', 'deployed', 'maintenance', 'retired'];
const STATE_LABEL = { in_inventory: 'In Inventory', deployed: 'Deployed', maintenance: 'Maintenance', retired: 'Retired' };
const FIELD_STATUS_LABEL = {
  not_recorded: 'Not recorded',
  unavailable_at_acquisition: 'Unavailable for this observation',
  known_stale: 'Known stale — current value unavailable',
};

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const seconds = value.seconds ?? value._seconds;
  const date = typeof seconds === 'number' ? new Date(seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function formatDate(value, fallback = 'Not recorded') {
  const date = asDate(value);
  return date ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : fallback;
}
function locationText(location) {
  if (location?.type === 'hole') return `Hole ${location.hole}`;
  if (location?.type === 'custom') return location.name || 'Custom location';
  return 'Unassigned';
}
function FieldStatus({ status }) {
  if (!status || status === 'available') return null;
  return <small className={`a-field-status a-field-${status}`}>{FIELD_STATUS_LABEL[status]}</small>;
}
function valueOrStatus(value, status, fallback = 'Not recorded') {
  return value === null || value === undefined || value === ''
    ? FIELD_STATUS_LABEL[status] || fallback
    : value;
}
function metric(health, key, suffix = '', transform = (value) => value) {
  const value = health?.[key];
  return value == null
    ? FIELD_STATUS_LABEL[health?.field_status?.[key]] || 'Unavailable for this observation'
    : `${transform(value)}${suffix}`;
}
function StateBadge({ state }) {
  return <span className={`a-state a-state-${state || 'unknown'}`}>{STATE_LABEL[state] || state || 'Unknown'}</span>;
}
function Notice({ error, children }) {
  if (!error && !children) return null;
  return <div className={error ? 'a-notice a-error' : 'a-notice a-success'} role={error ? 'alert' : 'status'}>{error || children}</div>;
}
function LocationFields({ value, onChange, disabled = false }) {
  const type = value?.type || 'hole';
  return <div className="a-form-grid">
    <label>Location type<select value={type} disabled={disabled} onChange={(event) => onChange(event.target.value === 'hole' ? { type: 'hole', hole: 1 } : { type: 'custom', name: '' })}><option value="hole">Hole</option><option value="custom">Custom</option></select></label>
    {type === 'hole' ? <label>Hole<input type="number" min="1" max="18" value={value?.hole ?? ''} disabled={disabled} onChange={(event) => onChange({ type: 'hole', hole: Number(event.target.value) })} required /></label> : <label>Location name<input value={value?.name || ''} disabled={disabled} onChange={(event) => onChange({ type: 'custom', name: event.target.value })} placeholder={disabled ? 'Not recorded' : 'Practice Green'} required /></label>}
  </div>;
}

function FleetView({ fleet, loading, error, refresh, openDevice }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const devices = useMemo(() => fleet.devices.filter((device) => {
    const matchState = filter === 'all' || device.state === filter;
    const text = [device.device_id, device.customer_name, device.course_name, locationText(device.location), device.sim_iccid].join(' ').toLowerCase();
    return matchState && text.includes(search.trim().toLowerCase());
  }), [fleet.devices, filter, search]);
  return <section className="a-view" aria-labelledby="fleet-title">
    <PageHeading eyebrow="FLEET OPERATIONS" title="Overview" id="fleet-title"><button className="a-icon" type="button" onClick={refresh} disabled={loading} aria-label="Refresh fleet"><RefreshCw size={18} /></button></PageHeading>
    <Notice error={error} />
    <div className="a-stats">{STATES.map((state) => <button type="button" className={filter === state ? 'active' : ''} key={state} onClick={() => setFilter(filter === state ? 'all' : state)}><span>{STATE_LABEL[state]}</span><strong>{fleet.devices.filter((device) => device.state === state).length}</strong></button>)}</div>
    <div className="a-toolbar"><label className="a-search"><Search size={17} /><span className="sr-only">Search fleet</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, customer, course, location, SIM" /></label><label><span className="sr-only">State filter</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All states</option>{STATES.map((state) => <option key={state} value={state}>{STATE_LABEL[state]}</option>)}</select></label></div>
    <div className="a-table-wrap"><table className="a-table"><thead><tr><th>Device</th><th>Assignment</th><th>Location</th><th>State</th><th>Latest report</th><th>SOC</th><th>Battery</th><th>Signal</th><th /></tr></thead><tbody>{devices.map((device) => <tr key={device.device_id} tabIndex="0" onClick={() => openDevice(device.device_id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openDevice(device.device_id); }}><td><strong>{device.device_id}</strong></td><td>{device.customer_name || 'Unassigned'}<small>{device.course_name || 'No course'}</small></td><td>{locationText(device.location)}</td><td><StateBadge state={device.state} /></td><td>{formatDate(device.latest_health?.received_at, 'No report')}</td><td>{metric(device.latest_health, 'battery_soc_pct', '%')}</td><td>{metric(device.latest_health, 'battery_voltage_u_v', ' V', (value) => (value / 1e6).toFixed(2))}</td><td>{metric(device.latest_health, 'rsrp_dbm', ' dBm')}</td><td><ChevronRight size={16} /></td></tr>)}</tbody></table>{!loading && devices.length === 0 && <div className="a-empty">No devices match these filters.</div>}{loading && fleet.devices.length === 0 && <div className="a-empty">Loading fleet…</div>}</div>
  </section>;
}
function PageHeading({ eyebrow, title, id, children }) {
  return <div className="a-heading"><div><p>{eyebrow}</p><h2 id={id}>{title}</h2></div>{children}</div>;
}

function HealthSection({ device, history, historyStatus }) {
  const health = device.latest_health;
  return <section className="a-panel"><div className="a-section-heading"><div><p>DEVICE HEALTH</p><h3>Latest observation</h3></div><span>{formatDate(health?.received_at, 'No report received')}</span></div>
    <div className="a-health">{[
      [BatteryMedium, 'SOC', metric(health, 'battery_soc_pct', '%')],
      [Gauge, 'Voltage', metric(health, 'battery_voltage_u_v', ' V', (value) => (value / 1e6).toFixed(2))],
      [Signal, 'RSRP', metric(health, 'rsrp_dbm', ' dBm')],
      [Radio, 'RSRQ / SNR', `${metric(health, 'rsrq_db', ' dB')} / ${metric(health, 'snr_db', ' dB')}`],
      [Thermometer, 'Modem temp', metric(health, 'modem_temperature_m_c', ' °C', (value) => (value / 1000).toFixed(1))],
      [Activity, 'Last HTTPS', health?.https_succeeded === true ? 'Succeeded' : health?.https_succeeded === false ? 'Failed' : FIELD_STATUS_LABEL[health?.field_status?.https_succeeded] || 'Unavailable for this observation'],
    ].map(([Icon, label, value]) => <div key={label}><Icon size={18} /><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="a-planned"><button type="button" disabled><RefreshCw size={16} />Request Health Check</button><span>Planned / not operational</span></div>
    <div className="a-alert-placeholder"><ShieldCheck size={19} /><div><strong>WP6 Alerts</strong><p>No alert data. Alert monitoring is not operational.</p></div></div>
    <h4>Health history</h4>{historyStatus === 'loading' && <div className="a-empty">Loading health history…</div>}{historyStatus === 'error' && <Notice error="Unable to load health history." />}{historyStatus === 'ready' && history.length === 0 && <div className="a-empty">No historical observations.</div>}
    {history.length > 0 && <div className="a-table-wrap"><table className="a-history"><thead><tr><th>Received</th><th>SOC trend</th><th>Voltage</th><th>RSRP</th><th>RSRQ</th><th>SNR</th><th>Temp</th><th>Attempts</th></tr></thead><tbody>{history.map((row) => <tr key={row.history_id}><td>{formatDate(row.received_at)}</td><td>{row.battery_soc_pct != null && <span className="a-bar"><i style={{ width: `${row.battery_soc_pct}%` }} /></span>}{metric(row, 'battery_soc_pct', '%')}</td><td>{metric(row, 'battery_voltage_u_v', ' V', (value) => (value / 1e6).toFixed(2))}</td><td>{metric(row, 'rsrp_dbm', ' dBm')}</td><td>{metric(row, 'rsrq_db', ' dB')}</td><td>{metric(row, 'snr_db', ' dB')}</td><td>{metric(row, 'modem_temperature_m_c', ' °C', (value) => (value / 1000).toFixed(1))}</td><td>{metric(row, 'attempts')}</td></tr>)}</tbody></table></div>}
  </section>;
}

function DeviceDetail({ user, apiBaseUrl, device, customers, close, refresh }) {
  const assignmentFromDevice = () => device.state === 'in_inventory'
    ? { customer_id: '', course_id: '', location: null }
    : { customer_id: device.customer_id || '', course_id: device.course_id || '', location: device.location };
  const [assignment, setAssignment] = useState(assignmentFromDevice);
  const [metadata, setMetadata] = useState({ comments: device.comments || '', sim_iccid: device.sim_iccid || '' });
  const [history, setHistory] = useState([]); const [historyStatus, setHistoryStatus] = useState('loading'); const [pending, setPending] = useState(''); const [error, setError] = useState('');
  const customer = customers.find((item) => item.customer_id === assignment.customer_id);
  const identitySource = device.system_identity?.source === 'device_health'
    ? `Device Health · ${formatDate(device.system_identity.observed_at)}`
    : device.system_identity?.source === 'verified_provenance'
      ? 'Verified build / flash provenance'
      : 'Authoritative source unavailable';
  useEffect(() => { setAssignment(assignmentFromDevice()); }, [device]);
  useEffect(() => { let current = true; adminRequest(user, apiBaseUrl, `/api/v1/admin/devices/${encodeURIComponent(device.device_id)}/health-history`).then((result) => { if (current) { setHistory(result.history || []); setHistoryStatus('ready'); } }).catch(() => { if (current) setHistoryStatus('error'); }); return () => { current = false; }; }, [apiBaseUrl, device.device_id, user]);
  async function mutate(name, path, options) { setPending(name); setError(''); try { await adminRequest(user, apiBaseUrl, path, options); await refresh(); } catch (err) { setError(err.message); } finally { setPending(''); } }
  function saveAssignment(event) { event.preventDefault(); mutate('assignment', `/api/v1/admin/devices/${device.device_id}/assignment`, { method: 'PATCH', body: { customer_id: assignment.customer_id || null, course_id: assignment.course_id || null, location: assignment.location } }); }
  function saveMetadata(event) { event.preventDefault(); mutate('metadata', `/api/v1/admin/devices/${device.device_id}/metadata`, { method: 'PATCH', body: metadata }); }
  function changeState(event) { const state = event.target.value; if (state === device.state) return; if (state === 'deployed' && (!assignment.customer_id || !assignment.course_id || !assignment.location || (assignment.location.type === 'hole' ? !Number.isInteger(assignment.location.hole) || assignment.location.hole < 1 || assignment.location.hole > 18 : !assignment.location.name?.trim()))) { setError('Select a valid Customer, Course, and location before deploying.'); return; } const detail = state === 'retired' ? ' Retired devices cannot communicate.' : state === 'in_inventory' ? ' The current Customer, Course, and location assignment will be cleared.' : ''; if (!window.confirm(`Change ${device.device_id} to ${STATE_LABEL[state]}?${detail}`)) return; const body = state === 'deployed' ? { state, customer_id: assignment.customer_id, course_id: assignment.course_id, location: assignment.location } : { state }; mutate('state', `/api/v1/admin/devices/${device.device_id}/state`, { method: 'PATCH', body }); }
  function record(action) { if (!window.confirm(`Record ${action} for ${device.device_id}? This writes your administrator identity and server time.`)) return; mutate(action, `/api/v1/admin/devices/${device.device_id}/${action}`, { method: 'POST' }); }
  return <div className="a-overlay a-drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="a-drawer" role="dialog" aria-modal="true" aria-labelledby="device-title"><header><div><p>DEVICE RECORD</p><h2 id="device-title">{device.device_id}</h2></div><button className="a-icon" type="button" onClick={close} aria-label="Close device detail"><X size={20} /></button></header><div className="a-drawer-body">
    <div className="a-device-head"><div><StateBadge state={device.state} /><span>{device.state === 'in_inventory' ? 'Completely unassigned' : `${device.customer_name || 'Unassigned'} · ${device.course_name || 'No course'} · ${locationText(device.location)}`}</span></div><label>Lifecycle state<select value={device.state} onChange={changeState} disabled={Boolean(pending)}>{STATES.map((state) => <option key={state} value={state}>{STATE_LABEL[state]}</option>)}</select><FieldStatus status={device.field_status?.state} /></label></div><Notice error={error} />
    <section className="a-panel"><div className="a-section-heading"><div><p>IDENTITY & CONFIG</p><h3>Registry record</h3></div></div><dl className="a-definition"><div><dt>Hardware revision</dt><dd>{valueOrStatus(device.hardware_revision, device.field_status?.hardware_revision)}<FieldStatus status={device.field_status?.hardware_revision} /></dd></div><div><dt>Firmware generation</dt><dd>{valueOrStatus(device.firmware_generation, device.field_status?.firmware_generation)}<FieldStatus status={device.field_status?.firmware_generation} /></dd></div><div><dt>Identity source</dt><dd>{identitySource}</dd></div><div><dt>Credential</dt><dd>{device.credential_status ? `${device.credential_status.algorithm} · updated ${formatDate(device.credential_status.updated_at)}` : 'Not issued'}<FieldStatus status={device.field_status?.credential_status} /></dd></div><div><dt>Created</dt><dd>{formatDate(device.created_at)}<FieldStatus status={device.field_status?.created_at} /></dd></div><div><dt>Updated</dt><dd>{formatDate(device.updated_at)}<FieldStatus status={device.field_status?.updated_at} /></dd></div><div><dt>Commissioned</dt><dd>{formatDate(device.commissioning?.commissioned_at)}<FieldStatus status={device.field_status?.commissioning} /></dd></div><div><dt>Last service</dt><dd>{formatDate(device.service?.last_service_at)}<FieldStatus status={device.field_status?.service} /></dd></div></dl></section>
    <form className="a-panel a-form" onSubmit={saveAssignment}><SectionTitle eyebrow="PLACEMENT" title={device.state === 'in_inventory' ? 'Deployment assignment' : 'Assignment'} /><div className="a-form-grid"><label>Customer<select value={assignment.customer_id} onChange={(event) => setAssignment({ ...assignment, customer_id: event.target.value, course_id: '', location: null })} disabled={device.state !== 'in_inventory' && Boolean(device.customer_id)}><option value="">Unassigned</option>{customers.map((item) => <option key={item.customer_id} value={item.customer_id}>{item.customer_name}</option>)}</select><FieldStatus status={device.field_status?.customer_id} /></label><label>Course<select value={assignment.course_id} onChange={(event) => setAssignment({ ...assignment, course_id: event.target.value, location: event.target.value ? (assignment.location || { type: 'hole', hole: 1 }) : null })} disabled={!assignment.customer_id}><option value="">No course</option>{(customer?.courses || []).map((course) => <option key={course.course_id} value={course.course_id}>{course.course_name}</option>)}</select><FieldStatus status={device.field_status?.course_id} /></label></div><LocationFields value={assignment.location} onChange={(location) => setAssignment({ ...assignment, location })} disabled={!assignment.course_id} /><FieldStatus status={device.field_status?.location} />{device.state !== 'in_inventory' && <PrimaryButton pending={pending === 'assignment'} text="Save assignment" />}</form>
    <form className="a-panel a-form" onSubmit={saveMetadata}><SectionTitle eyebrow="ADMIN METADATA" title="SIM & comments" /><div className="a-form-grid"><label>SIM ICCID<input value={metadata.sim_iccid} placeholder="Not recorded" onChange={(event) => setMetadata({ ...metadata, sim_iccid: event.target.value })} /><FieldStatus status={device.field_status?.sim_iccid} /></label><label className="wide">Comments<textarea rows="3" value={metadata.comments} placeholder="Not recorded" onChange={(event) => setMetadata({ ...metadata, comments: event.target.value })} /><FieldStatus status={device.field_status?.comments} /></label></div><PrimaryButton pending={pending === 'metadata'} text="Save metadata" /></form>
    <section className="a-panel"><SectionTitle eyebrow="LIFECYCLE" title="Operational events" /><div className="a-actions"><button type="button" onClick={() => record('service')} disabled={Boolean(pending)}><Wrench size={16} />Record service</button><button type="button" onClick={() => record('commission')} disabled={Boolean(pending)}><Check size={16} />Record commissioning</button></div></section>
    <HealthSection device={device} history={history} historyStatus={historyStatus} />
  </div></aside></div>;
}
function SectionTitle({ eyebrow, title }) { return <div className="a-section-heading"><div><p>{eyebrow}</p><h3>{title}</h3></div></div>; }
function PrimaryButton({ pending, text }) { return <button className="a-primary" disabled={pending}><Save size={16} />{pending ? 'Saving…' : text}</button>; }

function CustomerModal({ user, apiBaseUrl, customer, course, close, refresh }) {
  const isCourse = course !== null; const editing = Boolean(isCourse ? course?.course_id : customer?.customer_id);
  const [form, setForm] = useState(isCourse ? { course_name: course?.course_name || '', timezone: course?.timezone || '', schedule: course?.health_report_schedule?.times?.join(', ') || '09:00, 17:00', comments: course?.comments || '' } : { customer_name: customer?.customer_name || '', comments: customer?.comments || '' });
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  async function submit(event) { event.preventDefault(); setPending(true); setError(''); let path = '/api/v1/admin/customers'; if (isCourse) path = `${path}/${customer.customer_id}/courses${editing ? `/${course.course_id}` : ''}`; else if (editing) path += `/${customer.customer_id}`; const body = isCourse ? { course_name: form.course_name, timezone: form.timezone, health_report_schedule: { times: form.schedule.split(',').map((value) => value.trim()).filter(Boolean) }, comments: form.comments } : form; try { await adminRequest(user, apiBaseUrl, path, { method: editing ? 'PATCH' : 'POST', body }); await refresh(); close(); } catch (err) { setError(err.message); } finally { setPending(false); } }
  return <div className="a-overlay"><div className="a-modal" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title"><header><h2 id="customer-modal-title">{editing ? 'Edit' : 'Add'} {isCourse ? 'course' : 'customer'}</h2><button className="a-icon" type="button" onClick={close} aria-label="Close"><X size={20} /></button></header><form className="a-form" onSubmit={submit}><Notice error={error} />{isCourse ? <><label>Course name<input value={form.course_name} onChange={(event) => setForm({ ...form, course_name: event.target.value })} required /></label><label>Timezone<input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} placeholder="America/Los_Angeles" required /></label><label>Health report times<input value={form.schedule} onChange={(event) => setForm({ ...form, schedule: event.target.value })} placeholder="09:00, 17:00" required /><small>Comma-separated local times in HH:MM format.</small></label></> : <label>Customer name<input value={form.customer_name} onChange={(event) => setForm({ ...form, customer_name: event.target.value })} required /></label>}<label>Comments<textarea rows="4" value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} /></label><div className="a-modal-actions"><button type="button" onClick={close}>Cancel</button><PrimaryButton pending={pending} text="Save" /></div></form></div></div>;
}
function CustomersView({ user, apiBaseUrl, customers, refresh }) {
  const [editor, setEditor] = useState(null);
  return <section className="a-view"><PageHeading eyebrow="ACCOUNT STRUCTURE" title="Customers & Courses" id="customers-title"><button className="a-primary" type="button" onClick={() => setEditor({ customer: null, course: null })}><Plus size={16} />Add customer</button></PageHeading><div className="a-customers">{customers.map((customer) => <article key={customer.customer_id}><header><div><span>{customer.customer_id}</span><h3>{customer.customer_name}</h3><p>{valueOrStatus(customer.comments, customer.field_status?.comments)}</p><FieldStatus status={customer.field_status?.comments} /></div><div><button type="button" onClick={() => setEditor({ customer, course: {} })}><Plus size={16} />Course</button><button className="a-icon" type="button" onClick={() => setEditor({ customer, course: null })} aria-label={`Edit ${customer.customer_name}`}><Wrench size={16} /></button></div></header><div className="a-courses">{(customer.courses || []).map((course) => <button type="button" key={course.course_id} onClick={() => setEditor({ customer, course })}><MapPin size={17} /><span><strong>{course.course_name}</strong><small>{course.course_id} · {valueOrStatus(course.timezone, course.field_status?.timezone)} · {(course.health_report_schedule?.times || []).join(', ') || valueOrStatus(null, course.field_status?.health_report_schedule, 'Not recorded')}</small><small>Comments: {valueOrStatus(course.comments, course.field_status?.comments)}</small></span><ChevronRight size={16} /></button>)}{customer.courses?.length === 0 && <p>No courses configured.</p>}</div></article>)}{customers.length === 0 && <div className="a-empty">No customers are configured.</div>}</div>{editor && <CustomerModal user={user} apiBaseUrl={apiBaseUrl} customer={editor.customer} course={editor.course} close={() => setEditor(null)} refresh={refresh} />}</section>;
}

function CredentialModal({ value, close }) {
  const [acknowledged, setAcknowledged] = useState(false); const [copyStatus, setCopyStatus] = useState('');
  const content = `#define FAIRWAY_DEVICE_ID "${value.device_id}"\n#define FAIRWAY_DEVICE_KEY "${value.one_time_credential}"\n`;
  async function copy() { try { await navigator.clipboard.writeText(content); setCopyStatus('Copied to clipboard.'); } catch { setCopyStatus('Clipboard access failed. Use Download header to save the credential.'); } }
  return <div className="a-overlay credential"><div className="a-modal a-credential" role="alertdialog" aria-modal="true" aria-labelledby="credential-title"><ShieldCheck size={30} /><h2 id="credential-title">One-time device credential</h2><p>This secret cannot be retrieved again. Install it only on <strong>{value.device_id}</strong>.</p><pre>{content}</pre><div className="a-actions"><button type="button" onClick={copy}><Clipboard size={16} />Copy</button><button type="button" onClick={() => downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), `${value.device_id}-fairway_device_key.h`)}><Download size={16} />Download header</button></div>{copyStatus && <p className={copyStatus.startsWith('Copied') ? 'copy-ok' : 'copy-error'} role="status">{copyStatus}</p>}<label className="a-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I have securely saved this credential and understand it will not be shown again.</label><button className="a-primary" type="button" disabled={!acknowledged} onClick={close}>Acknowledge and close</button></div></div>;
}
function ProvisionView({ user, apiBaseUrl, refresh }) {
  const initial = { sim_iccid: '', comments: '' };
  const [form, setForm] = useState(initial); const [pending, setPending] = useState(false); const [error, setError] = useState(''); const [credential, setCredential] = useState(null); const [recoveryDeviceId, setRecoveryDeviceId] = useState(null);
  async function submit(event) { event.preventDefault(); setPending(true); setError(''); try { const result = recoveryDeviceId ? await adminRequest(user, apiBaseUrl, `/api/v1/admin/devices/${encodeURIComponent(recoveryDeviceId)}/credential-recovery`, { method: 'POST' }) : await adminRequest(user, apiBaseUrl, '/api/v1/admin/devices', { method: 'POST', body: form }); setCredential(result); setRecoveryDeviceId(null); await refresh(); } catch (err) { if (err.details?.recovery_required && err.details.device_id) { setRecoveryDeviceId(err.details.device_id); setError(`Device ${err.details.device_id} was created without a credential. Select Provision device again to retry credential issuance for this exact Device; no new Device will be allocated.`); } else { setError(err.message); } } finally { setPending(false); } }
  return <section className="a-view"><PageHeading eyebrow="READY FOR DEPLOYMENT" title="Provision Device" id="provision-title" /><div className="a-provision"><div className="a-provision-note"><HardDrive size={30} /><h3>Allocate a permanent identity</h3><p>The backend assigns the next FRB ID and returns its credential once. Inventory Devices remain completely unassigned until deployment.</p></div><form className="a-form a-provision-form" onSubmit={submit}><Notice error={error} /><div className="a-form-grid"><label className="wide">SIM ICCID<input value={form.sim_iccid} onChange={(event) => setForm({ ...form, sim_iccid: event.target.value })} /></label><label className="wide">Comments<textarea rows="4" value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} /></label></div><button className="a-primary provision-submit" disabled={pending}><Plus size={17} />{pending ? 'Provisioning…' : 'Provision device'}</button></form></div>{credential && <CredentialModal value={credential} close={() => { setCredential(null); setForm(initial); }} />}</section>;
}
function ExportView({ user, apiBaseUrl }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  async function exportCsv() { setPending(true); setError(''); setDone(false); try { const blob = await adminRequest(user, apiBaseUrl, '/api/v1/admin/export/device-sim', { responseType: 'blob' }); downloadBlob(blob, 'fairway-device-sim.csv'); setDone(true); } catch (err) { setError(err.message); } finally { setPending(false); } }
  return <section className="a-view"><PageHeading eyebrow="FLEET DATA" title="Device-to-SIM Export" id="export-title" /><div className="a-export"><FileDown size={36} /><h3>Device and SIM registry</h3><p>Download the authorized fleet mapping as CSV. Credential material is not included.</p><Notice error={error}>{done ? 'Export downloaded.' : ''}</Notice><button className="a-primary" type="button" onClick={exportCsv} disabled={pending}><Download size={17} />{pending ? 'Preparing…' : 'Download CSV'}</button></div></section>;
}

export default function AdminApp({ user, apiBaseUrl, onExit }) {
  const [section, setSection] = useState('overview'); const [fleet, setFleet] = useState({ customers: [], devices: [] }); const [status, setStatus] = useState('loading'); const [error, setError] = useState(''); const [deviceId, setDeviceId] = useState(null);
  async function refresh() { setStatus('loading'); setError(''); try { const result = await adminRequest(user, apiBaseUrl, '/api/v1/admin/fleet'); setFleet({ customers: result.customers || [], devices: result.devices || [] }); setStatus('ready'); } catch (err) { setError(err.message); setStatus('error'); } }
  useEffect(() => { refresh(); }, []);
  const selected = fleet.devices.find((device) => device.device_id === deviceId);
  const navigation = <>{NAVIGATION.map(([id, label, Icon]) => <button type="button" key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)} title={label}><Icon size={18} /><span>{label}</span></button>)}</>;
  return <main className="admin-app"><aside className="a-sidebar"><Brand /> <nav aria-label="Admin sections">{navigation}</nav><footer><span>{user.email}</span><button type="button" onClick={onExit}><ArrowLeft size={16} />Operator dashboard</button></footer></aside><div className="a-main"><header className="a-mobile-head"><Brand /><button className="a-icon" type="button" onClick={onExit} aria-label="Return to operator dashboard"><X size={19} /></button></header><nav className="a-mobile-nav" aria-label="Admin sections">{navigation}</nav><div className="a-review-banner"><ShieldCheck size={16} /><strong>Live production fleet</strong><span>Authorized administration</span></div>{section === 'overview' && <FleetView fleet={fleet} loading={status === 'loading'} error={error} refresh={refresh} openDevice={setDeviceId} />}{section === 'customers' && <CustomersView user={user} apiBaseUrl={apiBaseUrl} customers={fleet.customers} refresh={refresh} />}{section === 'provision' && <ProvisionView user={user} apiBaseUrl={apiBaseUrl} refresh={refresh} />}{section === 'export' && <ExportView user={user} apiBaseUrl={apiBaseUrl} />}</div>{selected && <DeviceDetail key={selected.device_id} user={user} apiBaseUrl={apiBaseUrl} device={selected} customers={fleet.customers} close={() => setDeviceId(null)} refresh={refresh} />}</main>;
}
function Brand() { return <div className="a-brand"><i><ShieldCheck size={20} /></i><div><strong>Fairway Refresh</strong><small>Internal Admin</small></div></div>; }
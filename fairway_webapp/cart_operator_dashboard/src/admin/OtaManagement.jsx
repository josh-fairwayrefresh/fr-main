import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { adminRequest } from './adminApi';
import { buildDeviceTree, groupSelection, toggleDevices, formatWindow } from './otaModel.mjs';

function SelectionCheckbox({ label, ids, selected, onToggle, disabled }) {
  const ref = useRef(null);
  const state = groupSelection(ids, selected);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state.partial; }, [state.partial]);
  return <label className="a-ota-check">
    <input ref={ref} type="checkbox" checked={state.all} disabled={disabled || ids.length === 0}
      onChange={() => onToggle(ids, !state.all)} />
    <span>{label}</span>
  </label>;
}

function DeviceTree({ nodes, selected, onToggle, disabled }) {
  return <ul className="a-ota-tree">
    {nodes.map((node) => <li key={node.id}>
      {node.device ? <div>
        <SelectionCheckbox label={node.label} ids={node.device.eligible ? [node.id] : []}
          selected={selected} onToggle={onToggle} disabled={disabled || !node.device.eligible} />
        {!node.device.eligible && <small>{node.device.reason}</small>}
        {node.device.eligible && node.device.current_assignment_id && <small>
          Current target: {node.device.last_result?.release_id}. A new confirmed assignment supersedes this target.
        </small>}
        {node.device.eligible && node.device.assignment_notice && <small>{node.device.assignment_notice}</small>}
      </div> : <details open>
        <summary>{node.label}</summary>
        <SelectionCheckbox label={`Select ${node.label}`} ids={node.ids} selected={selected}
          onToggle={onToggle} disabled={disabled} />
        <DeviceTree nodes={node.children} selected={selected} onToggle={onToggle} disabled={disabled} />
      </details>}
    </li>)}
  </ul>;
}

export default function OtaManagement({ user, apiBaseUrl }) {
  const [releases, setReleases] = useState([]);
  const [fleet, setFleet] = useState({ customers: [], devices: [] });
  const [selected, setSelected] = useState(new Set());
  const [releaseId, setReleaseId] = useState('');
  const [review, setReview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);

  async function refresh() {
    const request = ++generation.current;
    setBusy(true);
    setError('');
    setReview(null);
    setConfirmed(false);
    try {
      const [releaseResult, fleetResult] = await Promise.all([
        adminRequest(user, apiBaseUrl, '/api/v1/admin/ota/releases'),
        adminRequest(user, apiBaseUrl, '/api/v1/admin/ota/fleet'),
      ]);
      if (request !== generation.current) return;
      setReleases(releaseResult.releases);
      setFleet(fleetResult);
      setSelected(new Set());
      setLoaded(true);
    } catch (failure) {
      if (request === generation.current) { setError(failure.message); setLoaded(false); }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
    return () => { generation.current++; };
  }, [user, apiBaseUrl]);

  function changeSelection(ids, enabled) {
    setSelected((current) => toggleDevices(current, ids, enabled));
    setReview(null);
    setConfirmed(false);
    setNotice('');
  }

  async function prepare() {
    setBusy(true);
    setError('');
    setReview(null);
    setConfirmed(false);
    try {
      setReview(await adminRequest(user, apiBaseUrl, '/api/v1/admin/ota/assignment-reviews', {
        method: 'POST', body: { release_id: releaseId, device_ids: [...selected].sort() },
      }));
    } catch (failure) {
      setError(failure.message);
    } finally { setBusy(false); }
  }

  async function authorize() {
    setBusy(true);
    setError('');
    try {
      const result = await adminRequest(user, apiBaseUrl,
        `/api/v1/admin/ota/assignment-reviews/${review.review_id}/confirm`, { method: 'POST', body: {} });
      setNotice(`${result.assignments.length} exact device assignment(s) authorized. Installation is not yet confirmed.`);
      await refresh();
    } catch (failure) {
      setError(failure.message);
      setReview(null);
      setConfirmed(false);
    } finally { setBusy(false); }
  }

  const available = releases.filter((release) => release.assignable && release.release_id !== 'OTA-0.1');
  const release = available.find((item) => item.release_id === releaseId);
  const tree = buildDeviceTree({
    ...fleet,
    devices: fleet.devices.map((device) => release && !release.authorized_device_ids.includes(device.device_id)
      ? { ...device, eligible: false, reason: 'Outside this release commissioning authorization.' } : device),
  });
  return <section className="a-view" aria-labelledby="ota-title">
    <div className="a-heading">
      <div><p>FLEET MANAGEMENT</p><h2 id="ota-title">Firmware Updates</h2></div>
      <button className="a-icon" type="button" onClick={refresh} disabled={busy} aria-label="Refresh firmware updates"><RefreshCw size={18} /></button>
    </div>
    {error && <div className="a-notice a-error" role="alert">{error}</div>}
    {notice && <div className="a-notice a-success" role="status">{notice}</div>}
    {!loaded && <p role="status">{busy ? 'Loading firmware and devices...' : 'Firmware and devices are unavailable. Use Refresh to retry.'}</p>}
    <div className="a-ota-columns">
      <section className="a-panel a-form" aria-labelledby="ota-release-title">
        <h3 id="ota-release-title">Approved Firmware Updates</h3>
        <label>Available firmware updates
          <select value={releaseId} disabled={busy || !loaded} onChange={(event) => {
            setReleaseId(event.target.value); setSelected(new Set()); setReview(null); setConfirmed(false);
          }}>
            <option value="">Select an approved release</option>
            {available.map((item) => <option key={item.release_id} value={item.release_id}>{item.release_id} - {item.version_string}</option>)}
          </select>
        </label>
        {release && <div><strong>{release.release_id} - {release.version_string}</strong>
          <p>{release.notes || 'No description supplied.'}</p>
          <p>Approved and published</p>
        </div>}
        {loaded && available.length === 0 && <p>No published firmware currently satisfies all release-approval requirements.</p>}
        <p>Routine updates become eligible at the next 12:30 AM in each device&apos;s local time zone.
          Installation occurs only when the device subsequently checks autonomously.</p>
        <p>FRB-0005&apos;s initial commissioning check remains a separate, one-time 900-second bootstrap.
          Its review will show that exception, not a nightly installation promise.</p>
        <p>You may assign a new approved target regardless of current firmware or earlier assignments.
          Confirming supersedes the prior target and preserves its history; it does not interrupt an image already installing.</p>
        <p>Inventory and Maintenance use headquarters time: America/Los_Angeles (Pacific, including daylight saving time).</p>
      </section>
      <section className="a-panel" aria-labelledby="ota-device-title">
        <h3 id="ota-device-title">Select Devices</h3>
        <p>{selected.size} selected. Group selection includes only currently eligible devices.
          Authorization records exact IDs, not future group membership.</p>
        <DeviceTree nodes={tree} selected={selected} onToggle={changeSelection} disabled={busy || !loaded} />
      </section>
    </div>
    <section className="a-panel" aria-labelledby="ota-review-title">
      <h3 id="ota-review-title">Review and Authorize</h3>
      <p>{release ? `${release.release_id} - ${release.version_string}` : 'Select an approved release'}; {selected.size} device(s).</p>
      {selected.size > 0 && <p className="a-ota-ids">{[...selected].sort().join(', ')}</p>}
      <button type="button" className="a-primary" onClick={prepare}
        disabled={busy || !loaded || !release || selected.size === 0 || selected.size > (fleet.max_selection || 50)}>Review exact assignments</button>
      {selected.size > (fleet.max_selection || 50) && <p role="alert">Authorize at most {fleet.max_selection || 50} devices per review.</p>}
      {review && <div className="a-ota-review">
        <p><strong>{review.release_id}</strong> - {review.devices.length} exact devices.
          Review expires {formatWindow(review.expires_at, 'UTC')}.</p>
        <ul>{review.devices.map((device) => <li key={device.device_id}>
          <strong>{device.device_id}</strong> - {device.state === 'deployed'
            ? `${device.customer_name} / ${device.course_name}` : device.state === 'maintenance' ? 'Maintenance' : 'Inventory'}
          <p>Last confirmed running: {device.confirmed_firmware_version || 'Unknown'}. New target: {review.release_id}.</p>
          {device.current_assignment_id && <p>Supersedes {device.last_result.release_id}
            {' '}({device.last_result.state}); earlier delivery and installation evidence will be retained.</p>}
          <p>{device.schedule === 'bootstrap_900_seconds'
            ? 'Commissioning exception: eligible immediately for the existing one-time 900-second check. Whether it remains pending is unknown.'
            : `Next local window: ${formatWindow(device.next_window, device.timezone)}`}</p>
          {device.bootstrap_check_observed && <p>A one-time check was previously reported.
            This assignment does not restart the device timer or create another check; delivery requires a subsequent autonomous check.</p>}
        </li>)}</ul>
        <label className="a-ota-confirm"><input type="checkbox" checked={confirmed} disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)} />I authorize this release for exactly the devices and windows listed above, superseding any listed prior targets.</label>
        <button type="button" className="a-primary" onClick={authorize} disabled={busy || !confirmed}>Confirm assignments</button>
      </div>}
    </section>
    <section className="a-panel" aria-labelledby="ota-status-title">
      <h3 id="ota-status-title">Device Update Status</h3>
      <p>Refresh for current evidence. Publication, assignment, and download are not proof of installation.
        Confirmed versions are authenticated device reports, not independent boot attestation.</p>
      <div className="a-ota-list">{fleet.devices.map((device) => <article key={device.device_id}>
        <div><strong>{device.device_id}</strong><span>{device.state === 'deployed'
          ? `${device.customer_name || device.customer_id} / ${device.course_name || device.course_id}`
          : device.state === 'maintenance' ? 'Maintenance' : device.state === 'in_inventory' ? 'Inventory' : 'Classification unresolved'}</span>
          <small>Confirmed firmware: {device.confirmed_firmware_version || 'Unknown'}</small>
          <small>Pending release: {device.pending?.release_id || 'None recorded'}</small>
          <small>Next window: {device.pending?.schedule === 'bootstrap_900_seconds' || device.schedule === 'bootstrap_900_seconds'
            ? 'One-time commissioning check; pending time unknown'
            : formatWindow(device.pending?.not_before || device.next_window, device.pending?.timezone || device.timezone)}</small>
          <small>Last check-in: {formatWindow(device.last_check_at, device.timezone)}</small>
          <small>Last reported result: {device.last_result?.state || 'Unknown'}{device.last_result?.error_code ? ` (error ${device.last_result.error_code})` : ''}</small>
          <small>Image offered: {formatWindow(device.last_result?.offered_at, device.timezone)}; download requested (not completion): {formatWindow(device.last_result?.artifact_requested_at, device.timezone)}</small>
          {Object.entries(device.last_result?.reported_at || {}).map(([state, at]) => <small key={state}>{state}: {formatWindow(at, device.timezone)}</small>)}
          {device.reason && <small>{device.reason}</small>}
          {device.assignment_notice && <small>{device.assignment_notice}</small>}
        </div>
      </article>)}</div>
    </section>
  </section>;
}

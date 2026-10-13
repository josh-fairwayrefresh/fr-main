import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, ShieldCheck, UserRound } from 'lucide-react';
import { adminRequest } from './adminApi';

function authorizationSummary(authorization) {
  if (!authorization) return '';
  if (authorization.admin) return 'Global Admin';
  const courses = authorization.course_ids.length
    ? authorization.course_ids.join(', ')
    : 'All courses';
  return `${authorization.customer_id} · ${courses}`;
}

function recordSummary(user) {
  if (user.status === 'CONFIGURATION ERROR') return 'Invalid schema-v2 access record';
  if (user.status === 'ORPHANED RECORD') {
    return user.access_record_valid
      ? authorizationSummary(user.authorization)
      : 'Orphaned record · invalid schema-v2 access';
  }
  if (user.status === 'NOT PROVISIONED') return 'No access record';
  return authorizationSummary(user.authorization);
}

export default function AdminUserManagement({ user, apiBaseUrl, customers }) {
  const [users, setUsers] = useState([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [admin, setAdmin] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [courseIds, setCourseIds] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedUser = users.find((item) => item.uid === selectedUid) || null;
  const customer = customers.find((item) => item.customer_id === customerId) || null;
  const customerCourses = useMemo(() => customer?.courses || [], [customer]);

  async function loadUsers() {
    const currentUid = selectedUid;
    setLoading(true);
    setLoadState('loading');
    setError('');
    setNotice('');
    setUsers([]);
    setSelectedUid('');
    try {
      const result = await adminRequest(user, apiBaseUrl, '/api/v1/admin/users');
      if (!result.complete || result.next_page_token || !Array.isArray(result.users)) {
        throw new Error('The server did not return a complete user directory.');
      }
      setUsers(result.users);
      setSelectedUid(
        result.users.some((item) => item.uid === currentUid)
          ? currentUid
          : result.users[0]?.uid || ''
      );
      setLoadState('ready');
      return true;
    } catch (loadError) {
      setUsers([]);
      setSelectedUid('');
      setLoadState('error');
      setError(
        loadError.details?.message ||
        'Unable to retrieve the complete user directory. Retry when connectivity is restored.'
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, [user, apiBaseUrl]);

  useEffect(() => {
    if (!selectedUser || selectedUser.status === 'ORPHANED RECORD') return;
    const access = selectedUser.authorization;
    setAdmin(access?.admin === true);
    setCustomerId(access?.admin === true ? '' : access?.customer_id || '');
    setCourseIds(access?.admin === true ? [] : access?.course_ids || []);
    setNotice('');
  }, [selectedUid, selectedUser?.authorization, selectedUser?.status]);

  function changeCustomer(value) {
    setCustomerId(value);
    setCourseIds([]);
  }

  function toggleCourse(courseId) {
    setCourseIds((current) => current.includes(courseId)
      ? current.filter((value) => value !== courseId)
      : [...current, courseId]);
  }

  async function save(event) {
    event.preventDefault();
    if (!selectedUser || selectedUser.status === 'ORPHANED RECORD') return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await adminRequest(
        user,
        apiBaseUrl,
        `/api/v1/admin/users/${encodeURIComponent(selectedUser.uid)}/access`,
        {
          method: 'PUT',
          body: {
            admin,
            customer_id: admin ? null : customerId,
            course_ids: admin ? [] : courseIds,
          },
        }
      );
      if (await loadUsers()) {
        setNotice('Authorization settings saved and directory refreshed.');
      } else {
        setError('Authorization was saved, but the directory could not be refreshed. Retry to confirm current state.');
      }
    } catch (saveError) {
      setError(saveError.details?.message || saveError.message);
    } finally {
      setSaving(false);
    }
  }

  const isOrphan = selectedUser?.status === 'ORPHANED RECORD';
  const statusClass = (status) => status === 'CONFIGURATION ERROR'
    ? 'a-user-status is-error'
    : status === 'ORPHANED RECORD' ? 'a-user-status is-warning' : 'a-user-status';

  return <section className="a-view" aria-labelledby="users-title">
    <div className="a-heading">
      <div><p>ACCESS CONTROL</p><h2 id="users-title">User Management</h2></div>
      <button
        className="a-icon"
        type="button"
        onClick={() => { void loadUsers(); }}
        disabled={loading || saving}
        aria-label="Refresh users"
      ><RefreshCw size={18} /></button>
    </div>
    {error && <div className="a-notice a-error" role="alert">{error}</div>}
    {notice && <div className="a-notice a-success" role="status">{notice}</div>}
    <div className="a-user-management">
      <section className="a-user-list" aria-label="Firebase Authentication users" aria-busy={loading}>
        <h3>Authentication users</h3>
        {loadState === 'loading' && <p className="a-empty" role="status">Loading complete user directory…</p>}
        {loadState === 'error' && <button
          type="button"
          className="a-user-retry"
          onClick={() => { void loadUsers(); }}
          disabled={loading}
        >Retry loading users</button>}
        {loadState === 'ready' && users.map((item) => <button
          type="button"
          key={item.uid}
          className={selectedUid === item.uid ? 'active' : ''}
          onClick={() => setSelectedUid(item.uid)}
        >
          <UserRound size={17} />
          <span>
            <strong>{item.email || item.uid}</strong>
            <small className={statusClass(item.status)}>{item.status}{item.disabled ? ' · Disabled' : ''}</small>
            <small>{recordSummary(item)}</small>
          </span>
        </button>)}
        {loadState === 'ready' && users.length === 0 && <p className="a-empty">No Authentication users found.</p>}
      </section>
      {loadState === 'ready' && isOrphan && <section className="a-form a-user-editor" aria-label="Orphaned access record">
        <div><ShieldCheck size={24} /><h3>{selectedUser.uid}</h3><p>ORPHANED RECORD</p></div>
        <p>This access record has no Firebase Authentication identity. It was not changed or deleted.</p>
        {selectedUser.access_record_valid
          ? <p>Stored access: {authorizationSummary(selectedUser.authorization)}</p>
          : <p className="a-user-status is-error">The stored access record also fails schema-v2 validation.</p>}
      </section>}
      {loadState === 'ready' && selectedUser && !isOrphan && <form className="a-form a-user-editor" onSubmit={save}>
        <div><ShieldCheck size={24} /><h3>{selectedUser.email || selectedUser.uid}</h3><p>
          {selectedUser.status === 'NOT PROVISIONED'
            ? 'This Authentication account has no application access.'
            : selectedUser.status === 'CONFIGURATION ERROR'
              ? 'The existing access record is invalid and grants no access.'
              : 'Review or update this account’s access.'}
        </p></div>
        <p>{recordSummary(selectedUser)}</p>
        <label className="a-user-admin-toggle"><input type="checkbox" checked={admin} onChange={(event) => {
          setAdmin(event.target.checked);
          if (event.target.checked) {
            setCustomerId('');
            setCourseIds([]);
          }
        }} /> Admin — global Admin, Cart, and Inventory access</label>
        {!admin && <>
          <label>Customer<select value={customerId} onChange={(event) => changeCustomer(event.target.value)} required>
            <option value="">Select a Customer</option>
            {customers.map((item) => <option key={item.customer_id} value={item.customer_id}>{item.customer_name} ({item.customer_id})</option>)}
          </select></label>
          <fieldset disabled={!customer}>
            <legend>Authorized Courses</legend>
            <p className="a-user-course-help">Leave all boxes unchecked for <strong>All Courses for this Customer</strong>.</p>
            {customerCourses.map((course) => <label key={course.course_id} className="a-user-course">
              <input type="checkbox" checked={courseIds.includes(course.course_id)} onChange={() => toggleCourse(course.course_id)} />
              {course.course_name} ({course.course_id})
            </label>)}
            {customer && customerCourses.length === 0 && <p className="a-user-course-help">No Courses are currently configured for this Customer.</p>}
          </fieldset>
        </>}
        <button className="a-primary" type="submit" disabled={saving || loading}>
          <Save size={16} />
          {saving ? 'Saving…' : selectedUser.status === 'NOT PROVISIONED'
            ? 'Provision access'
            : selectedUser.status === 'CONFIGURATION ERROR' ? 'Repair access' : 'Save access'}
        </button>
      </form>}
    </div>
  </section>;
}

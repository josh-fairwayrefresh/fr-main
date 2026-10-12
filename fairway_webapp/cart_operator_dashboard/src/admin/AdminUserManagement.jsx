import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, ShieldCheck, UserRound } from 'lucide-react';
import { adminRequest } from './adminApi';

export default function AdminUserManagement({ user, apiBaseUrl, customers }) {
  const [users, setUsers] = useState([]);
  const [pageToken, setPageToken] = useState(null);
  const [selectedUid, setSelectedUid] = useState('');
  const [admin, setAdmin] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [courseIds, setCourseIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedUser = users.find((item) => item.uid === selectedUid) || null;
  const customer = customers.find((item) => item.customer_id === customerId) || null;
  const customerCourses = useMemo(() => customer?.courses || [], [customer]);

  async function loadUsers(nextPageToken = null) {
    setLoading(true);
    setError('');
    try {
      const query = nextPageToken
        ? `?page_token=${encodeURIComponent(nextPageToken)}`
        : '';
      const result = await adminRequest(user, apiBaseUrl, `/api/v1/admin/users${query}`);
      setUsers((current) => nextPageToken ? [...current, ...result.users] : result.users);
      setPageToken(result.next_page_token);
      if (!selectedUid && result.users.length) setSelectedUid(result.users[0].uid);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, [user, apiBaseUrl]);

  useEffect(() => {
    if (!selectedUser) return;
    const access = selectedUser.authorization;
    setAdmin(access?.admin === true);
    setCustomerId(access?.admin === true ? '' : access?.customer_id || '');
    setCourseIds(access?.admin === true ? [] : access?.course_ids || []);
    setNotice('');
  }, [selectedUid, selectedUser?.authorization]);

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
    if (!selectedUser) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await adminRequest(
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
      setUsers((current) => current.map((item) => (
        item.uid === selectedUser.uid ? { ...item, authorization: result.authorization } : item
      )));
      setNotice('Authorization settings saved.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  const configured = Boolean(selectedUser?.authorization);
  return <section className="a-view" aria-labelledby="users-title">
    <div className="a-heading">
      <div><p>ACCESS CONTROL</p><h2 id="users-title">User Management</h2></div>
      <button className="a-icon" type="button" onClick={() => loadUsers()} disabled={loading} aria-label="Refresh users"><RefreshCw size={18} /></button>
    </div>
    {error && <div className="a-notice a-error" role="alert">{error}</div>}
    {notice && <div className="a-notice a-success" role="status">{notice}</div>}
    <div className="a-user-management">
      <section className="a-user-list" aria-label="Firebase Authentication users">
        <h3>Authentication accounts</h3>
        {users.map((item) => <button
          type="button"
          key={item.uid}
          className={selectedUid === item.uid ? 'active' : ''}
          onClick={() => setSelectedUid(item.uid)}
        >
          <UserRound size={17} />
          <span><strong>{item.email || item.uid}</strong><small>{item.authorization ? (item.authorization.admin ? 'Admin' : 'Customer access') : 'Unconfigured'}{item.disabled ? ' · Disabled' : ''}</small></span>
        </button>)}
        {!loading && users.length === 0 && <p className="a-empty">No Authentication users found.</p>}
        {pageToken && <button type="button" onClick={() => loadUsers(pageToken)} disabled={loading}>Load more users</button>}
      </section>
      {selectedUser && <form className="a-form a-user-editor" onSubmit={save}>
        <div><ShieldCheck size={24} /><h3>{selectedUser.email || selectedUser.uid}</h3><p>{configured ? 'Review or update this account’s access.' : 'Unconfigured — this account has no operational access.'}</p></div>
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
        <button className="a-primary" type="submit" disabled={saving || loading}><Save size={16} />{saving ? 'Saving…' : 'Save access'}</button>
      </form>}
    </div>
  </section>;
}

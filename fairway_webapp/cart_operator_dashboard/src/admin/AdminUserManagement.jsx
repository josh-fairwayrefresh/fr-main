import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, Save, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import { adminRequest } from './adminApi';

const MANAGED_USER_DOMAIN = 'fairwayrefresh.com';
const MIN_PASSWORD_LENGTH = 12;
const USERNAME_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const USER_ERROR_MESSAGES = {
  invalid_username: 'Usernames use lowercase letters and numbers, optionally separated by single dots, dashes, or underscores.',
  password_length: `Passwords must be ${MIN_PASSWORD_LENGTH}–128 characters.`,
  password_rejected: 'Firebase Authentication rejected this password. Choose a stronger password.',
  user_already_exists: 'An account with this username already exists.',
  customer_required: 'Select a Customer, or grant global Admin access.',
  customer_not_found: 'The selected Customer no longer exists. Refresh and try again.',
  course_not_in_customer: 'Every selected Course must belong to the selected Customer.',
  admin_scope_must_be_global: 'Admin access is global and cannot be limited to a Customer.',
  user_not_found: 'This account no longer exists. Refresh the directory.',
  cannot_modify_own_account: 'You cannot reset your own password or deactivate your own account here.',
  protected_system_admin: 'This protected system Admin cannot be changed here.',
  last_admin_required: 'At least one active Admin must remain.',
  user_creation_failed: 'The account could not be created. No account was left behind; try again.',
  user_creation_incomplete: 'The account was created but its access could not be saved. It remains deactivated; contact engineering before retrying.',
  user_activation_incomplete: 'The account and its access were saved, but activation failed. It remains deactivated; use Reactivate to finish.',
  session_revocation_incomplete: 'The change was saved, but existing sessions could not be signed out. Retry the action.',
  authentication_service_unavailable: 'Firebase Authentication is unavailable. Retry shortly.',
};

function userErrorMessage(error) {
  const code = error?.details?.error;
  return USER_ERROR_MESSAGES[code] || error?.details?.message || error?.message || 'The request failed.';
}

function validateNewPassword(password, confirmation) {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) return USER_ERROR_MESSAGES.password_length;
  if (password !== confirmation) return 'The password confirmation does not match.';
  return '';
}

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

function AccessFields({ customers, admin, setAdmin, customerId, setCustomerId, courseIds, setCourseIds }) {
  const customer = customers.find((item) => item.customer_id === customerId) || null;
  const customerCourses = useMemo(() => customer?.courses || [], [customer]);
  function toggleCourse(courseId) {
    setCourseIds((current) => current.includes(courseId)
      ? current.filter((value) => value !== courseId)
      : [...current, courseId]);
  }
  return <>
    <label className="a-user-admin-toggle"><input type="checkbox" checked={admin} onChange={(event) => {
      setAdmin(event.target.checked);
      if (event.target.checked) {
        setCustomerId('');
        setCourseIds([]);
      }
    }} /> Admin — global Admin, Cart, and Inventory access</label>
    {!admin && <>
      <label>Customer<select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setCourseIds([]); }} required>
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
  </>;
}

function PasswordFields({ password, setPassword, confirmation, setConfirmation, label }) {
  return <>
    <label>{label}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={128} required /><small>At least {MIN_PASSWORD_LENGTH} characters. Share it with the user through an approved channel; it is not stored or shown again.</small></label>
    <label>Confirm password<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={128} required /></label>
  </>;
}

export default function AdminUserManagement({ user, apiBaseUrl, customers }) {
  const [users, setUsers] = useState([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [mode, setMode] = useState('edit');
  const [admin, setAdmin] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [courseIds, setCourseIds] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const selectedUser = users.find((item) => item.uid === selectedUid) || null;
  const isSelf = Boolean(selectedUser && user?.uid && selectedUser.uid === user.uid);

  function clearPasswords() {
    setPassword('');
    setConfirmation('');
  }

  async function loadUsers(preferredUid = selectedUid) {
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
        result.users.some((item) => item.uid === preferredUid)
          ? preferredUid
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
    if (mode !== 'edit' || !selectedUser || selectedUser.status === 'ORPHANED RECORD') return;
    const access = selectedUser.authorization;
    setAdmin(access?.admin === true);
    setCustomerId(access?.admin === true ? '' : access?.customer_id || '');
    setCourseIds(access?.admin === true ? [] : access?.course_ids || []);
    clearPasswords();
  }, [mode, selectedUid, selectedUser?.authorization, selectedUser?.status]);

  function startCreate() {
    setMode('create');
    setUsername('');
    setAdmin(false);
    setCustomerId('');
    setCourseIds([]);
    clearPasswords();
    setError('');
    setNotice('');
  }

  function selectUser(uid) {
    setMode('edit');
    setSelectedUid(uid);
    setError('');
    setNotice('');
  }

  async function runAction(action, successMessage, preferredUid = selectedUid) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await action();
      clearPasswords();
      setMode('edit');
      if (await loadUsers(result?.uid || preferredUid)) {
        setNotice(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      } else {
        setError('The change was saved, but the directory could not be refreshed. Retry to confirm current state.');
      }
    } catch (actionError) {
      setError(userErrorMessage(actionError));
    } finally {
      setSaving(false);
    }
  }

  async function createUser(event) {
    event.preventDefault();
    const normalized = username.trim().toLowerCase();
    if (normalized.length > 64 || !USERNAME_PATTERN.test(normalized)) {
      setError(USER_ERROR_MESSAGES.invalid_username);
      return;
    }
    const passwordError = validateNewPassword(password, confirmation);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    await runAction(
      () => adminRequest(user, apiBaseUrl, '/api/v1/admin/users', {
        method: 'POST',
        body: {
          username: normalized,
          password,
          admin,
          customer_id: admin ? null : customerId,
          course_ids: admin ? [] : courseIds,
        },
      }),
      (result) => `Created ${result.email}. Share the initial password with the user through an approved channel.`
    );
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
      setError(userErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (!selectedUser) return;
    const passwordError = validateNewPassword(password, confirmation);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    await runAction(
      () => adminRequest(user, apiBaseUrl, `/api/v1/admin/users/${encodeURIComponent(selectedUser.uid)}/password`, {
        method: 'PUT',
        body: { password },
      }),
      `Password reset for ${selectedUser.email || selectedUser.uid}. Existing sessions were signed out.`
    );
  }

  async function setDisabled(disabled) {
    if (!selectedUser) return;
    const account = selectedUser.email || selectedUser.uid;
    if (disabled && !window.confirm(`Deactivate ${account}? The user is signed out and denied access; the account and its access settings are kept.`)) {
      return;
    }
    await runAction(
      () => adminRequest(user, apiBaseUrl, `/api/v1/admin/users/${encodeURIComponent(selectedUser.uid)}/status`, {
        method: 'PUT',
        body: { disabled },
      }),
      disabled ? `${account} was deactivated and signed out.` : `${account} was reactivated.`
    );
  }

  const isOrphan = selectedUser?.status === 'ORPHANED RECORD';
  const statusClass = (status) => status === 'CONFIGURATION ERROR'
    ? 'a-user-status is-error'
    : status === 'ORPHANED RECORD' ? 'a-user-status is-warning' : 'a-user-status';
  const accessFields = <AccessFields
    customers={customers}
    admin={admin}
    setAdmin={setAdmin}
    customerId={customerId}
    setCustomerId={setCustomerId}
    courseIds={courseIds}
    setCourseIds={setCourseIds}
  />;

  return <section className="a-view" aria-labelledby="users-title">
    <div className="a-heading">
      <div><p>ACCESS CONTROL</p><h2 id="users-title">User Management</h2></div>
      <div className="a-user-heading-actions">
        <button
          className="a-primary"
          type="button"
          onClick={startCreate}
          disabled={loading || saving}
        ><UserPlus size={16} />New user</button>
        <button
          className="a-icon"
          type="button"
          onClick={() => { void loadUsers(); }}
          disabled={loading || saving}
          aria-label="Refresh users"
        ><RefreshCw size={18} /></button>
      </div>
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
          className={mode === 'edit' && selectedUid === item.uid ? 'active' : ''}
          onClick={() => selectUser(item.uid)}
        >
          <UserRound size={17} />
          <span>
            <strong>{item.email || item.uid}</strong>
            <small className={statusClass(item.status)}>{item.status}{item.disabled ? ' · Deactivated' : ''}</small>
            <small>{recordSummary(item)}</small>
          </span>
        </button>)}
        {loadState === 'ready' && users.length === 0 && <p className="a-empty">No Authentication users found.</p>}
      </section>
      {mode === 'create' && <form className="a-form a-user-editor" onSubmit={createUser} aria-label="Create user">
        <div><UserPlus size={24} /><h3>New user</h3><p>Creates a sign-in account and its application access together.</p></div>
        <label>Username<span className="a-username-field"><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} required /><span>@{MANAGED_USER_DOMAIN}</span></span><small>Lowercase letters and numbers, optionally separated by single dots, dashes, or underscores.</small></label>
        <PasswordFields password={password} setPassword={setPassword} confirmation={confirmation} setConfirmation={setConfirmation} label="Initial password" />
        {accessFields}
        <div className="a-modal-actions">
          <button type="button" onClick={() => { clearPasswords(); setMode('edit'); setError(''); }} disabled={saving}>Cancel</button>
          <button className="a-primary" type="submit" disabled={saving || loading}><UserPlus size={16} />{saving ? 'Creating…' : 'Create user'}</button>
        </div>
      </form>}
      {mode === 'edit' && loadState === 'ready' && isOrphan && <section className="a-form a-user-editor" aria-label="Orphaned access record">
        <div><ShieldCheck size={24} /><h3>{selectedUser.uid}</h3><p>ORPHANED RECORD</p></div>
        <p>This access record has no Firebase Authentication identity. It was not changed or deleted.</p>
        {selectedUser.access_record_valid
          ? <p>Stored access: {authorizationSummary(selectedUser.authorization)}</p>
          : <p className="a-user-status is-error">The stored access record also fails schema-v2 validation.</p>}
      </section>}
      {mode === 'edit' && loadState === 'ready' && selectedUser && !isOrphan && <div className="a-user-detail">
        <form className="a-form a-user-editor" onSubmit={save}>
          <div><ShieldCheck size={24} /><h3>{selectedUser.email || selectedUser.uid}</h3><p>
            {selectedUser.status === 'NOT PROVISIONED'
              ? 'This Authentication account has no application access.'
              : selectedUser.status === 'CONFIGURATION ERROR'
                ? 'The existing access record is invalid and grants no access.'
                : 'Review or update this account’s access.'}
          </p></div>
          <p>{recordSummary(selectedUser)}</p>
          {accessFields}
          <button className="a-primary" type="submit" disabled={saving || loading}>
            <Save size={16} />
            {saving ? 'Saving…' : selectedUser.status === 'NOT PROVISIONED'
              ? 'Provision access'
              : selectedUser.status === 'CONFIGURATION ERROR' ? 'Repair access' : 'Save access'}
          </button>
        </form>
        <section className="a-form a-user-editor a-user-account" aria-label="Account status and password">
          <div><KeyRound size={24} /><h3>Account</h3><p>
            {selectedUser.disabled
              ? 'Deactivated — sign-in and application access are denied. Access settings are kept.'
              : 'Active'}
          </p></div>
          {isSelf
            ? <p className="a-user-course-help">This is your account. Another Admin must reset its password or change its status.</p>
            : <>
              <div className="a-actions">
                {selectedUser.disabled
                  ? <button type="button" onClick={() => { void setDisabled(false); }} disabled={saving || loading}>Reactivate account</button>
                  : <button type="button" className="a-danger" onClick={() => { void setDisabled(true); }} disabled={saving || loading}>Deactivate account</button>}
              </div>
              <form className="a-form" onSubmit={resetPassword} aria-label="Reset password">
                <PasswordFields password={password} setPassword={setPassword} confirmation={confirmation} setConfirmation={setConfirmation} label="New password" />
                <button className="a-primary" type="submit" disabled={saving || loading}><KeyRound size={16} />{saving ? 'Saving…' : 'Reset password'}</button>
              </form>
            </>}
        </section>
      </div>}
    </div>
  </section>;
}

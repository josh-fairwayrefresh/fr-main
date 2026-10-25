import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { CheckCircle, Grid2X2, History, Settings, Map as MapIcon, Circle, ShieldCheck } from 'lucide-react';
import { auth, db, googleProvider } from './lib/firebase';
import { adminApiBaseUrl, apiBaseUrl, fairwayEnvironment } from './lib/environment';
import AdminApp from './admin/AdminApp';
import NotificationSetup from './NotificationSetup';
import OperatorApp from './OperatorApp';
import OperatorDesignReview from './operator-design/OperatorDesignReview';
import { APP_MODE, modeForPath, resolveEntry, shouldRedirectFreshSignInToCartOperations } from './lib/appEntry.mjs';
import { createCourseRequestState } from './lib/courseRequestState.mjs';
import { inventoryRequest } from './lib/inventoryApi.mjs';
import { operatorRequest } from './lib/operator';
import './styles.css';

export const API_BASE_URL = apiBaseUrl;

// Fairway Refresh has exactly two application entry points: Cart UI and Admin
// UI. Inventory is a feature within Cart UI, not a third entry point, so a
// sign-in that completes while on /inventory must land on Cart Operations
// first. This sessionStorage marker survives the full-page navigation used by
// both email/password sign-in (same page load) and Google redirect sign-in
// (separate page load after returning from Google), letting the auth-state
// handler distinguish "a sign-in just completed here" from "an already
// authenticated session is continuing a direct or Cart-banner Inventory
// visit" without depending on SDK callback ordering.
const FRESH_SIGN_IN_STORAGE_KEY = 'fairway.freshSignIn';

const InventoryApp = lazy(() => import('./InventoryApp'));
const PublicMenuApp = lazy(() => import('./PublicMenuApp'));
const BayRequestApp = lazy(() => import('./BayRequestApp'));

function timestampToDate(timestamp) {
  if (!timestamp?.toDate) {
    return null;
  }

  return timestamp.toDate();
}

function isToday(timestamp) {
  const date = timestampToDate(timestamp);

  if (!date) {
    return false;
  }

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatRequestAge(receivedAt) {
  const date = timestampToDate(receivedAt);

  if (!date) {
    return 'just now';
  }

  const ageMs = Date.now() - date.getTime();
  const ageMin = Math.max(0, Math.floor(ageMs / 60000));

  if (ageMin < 1) {
    return 'just now';
  }

  if (ageMin === 1) {
    return '1 min ago';
  }

  return `${ageMin} min ago`;
}

function formatClockTime(timestamp) {
  const date = timestampToDate(timestamp);

  if (!date) {
    return 'Unknown time';
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(startTimestamp, endTimestamp) {
  const start = timestampToDate(startTimestamp);
  const end = timestampToDate(endTimestamp);

  if (!start || !end) {
    return '—';
  }

  const durationMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

  if (durationMin < 1) {
    return '<1 min';
  }

  if (durationMin === 1) {
    return '1 min';
  }

  return `${durationMin} min`;
}

async function updateRequestStatus(requestId, action) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Operator is not authenticated');
  }

  const idToken = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/requests/${requestId}/${action}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.text();
}

function LoginScreen({ authState, mode, onGoogleSignIn, onEmailSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isAdminEntry = mode === APP_MODE.ADMIN;

  async function handleEmailSubmit(event) {
    event.preventDefault();
    await onEmailSignIn(email, password);
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <a href="/" aria-label="Fairway Refresh home">
          <img src="/icons/logo-and-name-row-banner.jpg" alt="Fairway Refresh" />
        </a>
        <span>{isAdminEntry ? 'Administration' : 'Customer access'}</span>
      </header>
      <div className="auth-layout">
        <section className="auth-intro" aria-labelledby="auth-title">
          <p>{isAdminEntry ? 'INTERNAL ADMINISTRATION' : 'CUSTOMER COURSE ACCESS'}</p>
          <h1 id="auth-title">{isAdminEntry ? 'Administration access' : 'Course access'}</h1>
          <span>{isAdminEntry ? 'Authorized Fairway Refresh personnel only.' : 'Sign in to access your assigned course.'}</span>
        </section>
        <div className="auth-entry">
          <section className="auth-panel" aria-label={isAdminEntry ? 'Admin sign in' : 'Course sign in'}>
            <div className="auth-panel-heading">
              <span>AUTHORIZED ACCESS</span>
              <h2>{isAdminEntry ? 'Admin sign in' : 'Course sign in'}</h2>
            </div>
            <form className="login-form" onSubmit={handleEmailSubmit}>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              <button className="google-button" type="submit">
                Sign in
              </button>
            </form>

            <div className="login-divider">or</div>

            <button className="google-secondary-button" onClick={onGoogleSignIn}>
              Sign in with Google
            </button>

            {authState === 'checking' && (
              <p className="login-status">Checking session...</p>
            )}

            {authState === 'denied' && (
              <p className="login-error">
                Access denied. Use an approved Fairway Refresh account.
              </p>
            )}
          </section>
          <nav className="mode-entry-links" aria-label="Other Fairway Refresh sign-in options">
            {isAdminEntry
              ? <a className="mode-entry-link" href="/">Cart Login</a>
              : <a className="mode-entry-link" href="/admin">Admin Login</a>}
          </nav>
        </div>
      </div>
      <footer className="auth-footer"><span>Fairway Refresh</span><span>Course service operations</span></footer>
    </main>
  );
}

function EntryStatus({ title, message, showAdminLink = false }) {
  return (
    <main className="auth-page">
      <header className="auth-header">
        <a href="/" aria-label="Fairway Refresh home"><img src="/icons/logo-and-name-row-banner.jpg" alt="Fairway Refresh" /></a>
        <span>Account access</span>
      </header>
      <div className="auth-status-wrap">
        <section className="auth-panel auth-status-panel">
          <div className="auth-status-icon"><ShieldCheck size={22} /></div>
          <h1>{title}</h1>
          <p className="login-subtitle">{message}</p>
          <div className="entry-status-actions">
            {showAdminLink && <a className="google-button" href="/admin">Open Admin</a>}
            <button className="google-secondary-button" type="button" onClick={() => signOut(auth)}>
              Sign out
            </button>
          </div>
        </section>
      </div>
      <footer className="auth-footer"><span>Fairway Refresh</span><span>Course service operations</span></footer>
    </main>
  );
}

function CompletionScreen({ completedRequest, activeRequests, onReturn }) {
  const hotspotHoles = activeRequests
    .filter((request) => request.status !== 'completed')
    .slice(0, 3)
    .map((request) => request.hole)
    .filter((hole) => hole !== null && hole !== undefined);

  return (
    <main className="page">
      <div className="phone-shell">
        <section className="completion-screen">
          <div className="completion-icon">
            <CheckCircle size={92} strokeWidth={1.8} />
          </div>

          <h1>Hole {completedRequest?.hole ?? 'Unknown'} Complete</h1>
          <p>Service completed</p>

          <button className="return-button" onClick={onReturn}>
            Return to Dashboard
          </button>

          <section className="hotspots-panel">
            <h2>Current Hotspots</h2>

            {hotspotHoles.length === 0 ? (
              <p className="hotspot-empty">No active hotspots</p>
            ) : (
              <div className="hotspot-list">
                {hotspotHoles.map((hole) => (
                  <span className="hotspot-chip" key={hole}>
                    Hole {hole}
                  </span>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function RequestCard({ request, onCompleted, focused }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');

  const isNew = request.status === 'new';
  const isConfirmed = request.status === 'confirmed';

  async function handleAction(action) {
    setIsUpdating(true);
    setError('');

    try {
      await updateRequestStatus(request.id, action);

      if (action === 'complete') {
        onCompleted(request);
      }
    } catch (err) {
      console.error(`Failed to ${action} request:`, err);
      setError(`Unable to ${action} request`);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <section id={`request-${request.id}`} className={`request-card ${isNew ? 'request-card-new' : ''} ${focused ? 'request-card-focused' : ''}`}>
      <div className="request-header">
        <div>
          <h2>Hole {request.hole ?? 'Unknown'}</h2>
          <p>
            Request • <span className={isNew ? 'green-text' : ''}>{request.age}</span>
          </p>
          {isConfirmed && <p className="confirmed-text">Confirmed</p>}
        </div>

        {isNew && <span className="new-badge">NEW</span>}
      </div>

      <div className="request-actions">
        <button
          className="primary-button"
          disabled={isUpdating || isConfirmed}
          onClick={() => handleAction('confirm')}
        >
          {isConfirmed ? 'CONFIRMED' : 'CONFIRM'}
        </button>

        <button
          className="secondary-button"
          disabled={isUpdating}
          onClick={() => handleAction('complete')}
        >
          COMPLETE
        </button>
      </div>

      {error && <p className="card-error">{error}</p>}
    </section>
  );
}

function AppFrame({ children, activeTab, onTabChange, user, isAdmin, onOpenAdmin }) {
  return (
    <main className="page">
      <div className="phone-shell">
        <header className="app-header">
          <div>
            <div className="brand-row">
              <Circle size={18} />
              <h1>Fairway Refresh</h1>
            </div>
            <p>Monarch Bay GC</p>
          </div>

          <div className="service-status">
            <span className="status-dot" />
            Cart Service Active
          </div>
        </header>

        <section className="logo-strip">
          <div className="signed-in-line">
            {user?.email}
          </div>
          {isAdmin && (
            <button className="admin-entry-button" type="button" onClick={onOpenAdmin}>
              <ShieldCheck size={15} />
              Admin
            </button>
          )}
          <div className="course-logo">
            Monarch Bay
            <br />
            Golf Club
          </div>
        </section>

        {children}

        <nav className="bottom-nav">
          <button
            className={activeTab === 'dashboard' ? 'nav-button nav-active' : 'nav-button'}
            onClick={() => onTabChange('dashboard')}
          >
            <Grid2X2 size={16} />
            Dashboard
          </button>

          <button className="nav-button" onClick={() => onTabChange('courses')}>
            <MapIcon size={16} />
            Courses
          </button>

          <button
            className={activeTab === 'history' ? 'nav-button nav-active' : 'nav-button'}
            onClick={() => onTabChange('history')}
          >
            <History size={16} />
            History
          </button>

          <button className="nav-button" onClick={() => signOut(auth)}>
            <Settings size={16} />
            Sign out
          </button>
        </nav>
      </div>
    </main>
  );
}

function DashboardScreen({ activeRequests, loadState, loadError, onCompleted, focusedRequestId, notificationSetup }) {
  useEffect(() => {
    if (!focusedRequestId) return;
    document.getElementById(`request-${focusedRequestId}`)?.scrollIntoView({ block: 'center' });
  }, [activeRequests, focusedRequestId]);

  return (
    <section className="content">
      {notificationSetup}
      <h3>NEW REQUESTS</h3>

      {loadState === 'loading' && (
        <p className="empty-state">Loading requests...</p>
      )}

      {loadState === 'error' && (
        <p className="empty-state error-state">
          Unable to load requests ({loadError || 'unknown'}).
        </p>
      )}

      {loadState === 'ready' && activeRequests.length === 0 && (
        <p className="empty-state">No active requests.</p>
      )}

      {activeRequests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          onCompleted={onCompleted}
          focused={request.id === focusedRequestId}
        />
      ))}
    </section>
  );
}

function HistoryScreen({ requests }) {
  const todayRequests = useMemo(() => {
    return requests.filter((request) => isToday(request.received_at));
  }, [requests]);

  const openToday = todayRequests.filter((request) => request.status !== 'completed');
  const completedToday = todayRequests.filter((request) => request.status === 'completed');

  const averageCompletionMinutes = useMemo(() => {
    const completedWithTimes = completedToday.filter(
      (request) => timestampToDate(request.received_at) && timestampToDate(request.completed_at)
    );

    if (completedWithTimes.length === 0) {
      return null;
    }

    const totalMinutes = completedWithTimes.reduce((sum, request) => {
      const start = timestampToDate(request.received_at);
      const end = timestampToDate(request.completed_at);
      return sum + Math.max(0, (end.getTime() - start.getTime()) / 60000);
    }, 0);

    return Math.round(totalMinutes / completedWithTimes.length);
  }, [completedToday]);

  const recentCompleted = completedToday.slice(0, 8);

  return (
    <section className="content history-content">
      <h3>TODAY METRICS</h3>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Total</span>
          <strong>{todayRequests.length}</strong>
        </div>

        <div className="metric-card">
          <span>Open</span>
          <strong>{openToday.length}</strong>
        </div>

        <div className="metric-card">
          <span>Completed</span>
          <strong>{completedToday.length}</strong>
        </div>

        <div className="metric-card">
          <span>Avg Time</span>
          <strong>{averageCompletionMinutes === null ? '—' : `${averageCompletionMinutes}m`}</strong>
        </div>
      </div>

      <section className="history-list-section">
        <h3>RECENT COMPLETED</h3>

        {recentCompleted.length === 0 ? (
          <p className="empty-state">No completed requests today.</p>
        ) : (
          <div className="history-list">
            {recentCompleted.map((request) => (
              <article className="history-row" key={request.id}>
                <div>
                  <strong>Hole {request.hole ?? 'Unknown'}</strong>
                  <span>{formatClockTime(request.received_at)}</span>
                </div>

                <div className="history-row-right">
                  <span>{formatDuration(request.received_at, request.completed_at)}</span>
                  <em>Complete</em>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function PlaceholderScreen({ title }) {
  return (
    <section className="content">
      <h3>{title}</h3>
      <p className="empty-state">Coming soon.</p>
    </section>
  );
}

function App() {
  const [entryMode] = useState(() => modeForPath(window.location.pathname));
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [claimsReady, setClaimsReady] = useState(false);
  const [authState, setAuthState] = useState('checking');
  const [requests, setRequests] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [completedRequest, setCompletedRequest] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [operatorConfig, setOperatorConfig] = useState(null);
  const [operatorError, setOperatorError] = useState('');
  const [operatorState, setOperatorState] = useState('not_requested');
  const [inventoryCourses, setInventoryCourses] = useState([]);
  const [inventoryState, setInventoryState] = useState('not_requested');
  const [inventoryError, setInventoryError] = useState('');
  const [focusedRequestId] = useState(() => {
    const match = window.location.pathname.match(/^\/requests\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!isMounted) {
        return;
      }

      if (!nextUser) {
        setUser(null);
        setIsAdmin(false);
        setClaimsReady(false);
        setAuthState('signed_out');
        setOperatorConfig(null);
        setOperatorState('not_requested');
        window.sessionStorage.removeItem(FRESH_SIGN_IN_STORAGE_KEY);
        return;
      }

      // Customer login must always land on Cart Operations, never directly on
      // Inventory. This only applies to a sign-in that just completed on
      // this load; an already-authenticated session continuing a direct or
      // Cart-banner Inventory visit is unaffected and keeps working exactly
      // as before.
      const freshSignIn = window.sessionStorage.getItem(FRESH_SIGN_IN_STORAGE_KEY) === '1';
      window.sessionStorage.removeItem(FRESH_SIGN_IN_STORAGE_KEY);
      if (freshSignIn && shouldRedirectFreshSignInToCartOperations(entryMode)) {
        window.location.assign('/');
        return;
      }

      setUser(nextUser);
      setClaimsReady(false);
      try {
        const access = await inventoryRequest(nextUser, adminApiBaseUrl, '/api/v1/access/bootstrap');
        if (isMounted) {
          setIsAdmin(access.admin === true);
        }
      } catch (error) {
        console.error('Unable to load account access:', error);
        if (isMounted) {
          setIsAdmin(false);
        }
      } finally {
        if (isMounted) {
          setClaimsReady(true);
        }
      }
      setAuthState('signed_in');
    });

    getRedirectResult(auth)
      .then((result) => {
        if (!isMounted || !result?.user) {
          return;
        }

        setAuthState('signed_in');
      })
      .catch((error) => {
        console.error('Google redirect sign-in failed:', error);
        if (isMounted) {
          setAuthState('signed_out');
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (entryMode !== APP_MODE.OPERATOR || !user) {
      setOperatorConfig(null);
      setOperatorError('');
      setOperatorState('not_requested');
      return undefined;
    }
    let active = true;
    setOperatorError('');
    setOperatorState('checking');
    operatorRequest(user, API_BASE_URL, '/api/v1/operator/bootstrap')
      .then((config) => {
        if (active) {
          setOperatorConfig(config);
          setOperatorState('authorized');
        }
      })
      .catch((error) => {
        if (active) {
          setOperatorConfig(null);
          setOperatorError(error.message);
          setOperatorState('denied');
        }
      });
    return () => { active = false; };
  }, [entryMode, user]);

  useEffect(() => {
    if (!user || entryMode !== APP_MODE.INVENTORY) {
      setInventoryCourses([]);
      setInventoryState('not_requested');
      setInventoryError('');
      return undefined;
    }
    let active = true;
    setInventoryState('checking');
    setInventoryError('');
    inventoryRequest(user, adminApiBaseUrl, '/api/v1/inventory/bootstrap')
      .then((result) => {
        if (!active) return;
        const assignedCourses = result.courses || [];
        setInventoryCourses(assignedCourses);
        setInventoryState(assignedCourses.length ? 'authorized' : 'denied');
        setInventoryError(assignedCourses.length ? '' : 'Assigned course access is required for this account.');
      })
      .catch((error) => {
        if (!active) return;
        setInventoryError(error.message);
        setInventoryState('denied');
      });
    return () => { active = false; };
  }, [adminApiBaseUrl, entryMode, user]);

  useEffect(() => {
    if (!user || !operatorConfig) {
      setRequests([]);
      setLoadState('loading');
      return undefined;
    }

    const courses = operatorConfig.courses;
    if (courses.length === 0) {
      setRequests([]);
      setLoadState('ready');
      return undefined;
    }

    let active = true;
    const { requestsByCourse, loadedCourses } = createCourseRequestState();
    const failedCourses = new Set();
    setLoadState('loading');
    setLoadError('');

    function updateRequests() {
      const nextRequests = [...requestsByCourse.values()].flat()
        .sort((left, right) => {
          const leftTime = left.received_at?.toMillis?.() ?? new Date(left.received_at).getTime();
          const rightTime = right.received_at?.toMillis?.() ?? new Date(right.received_at).getTime();
          return rightTime - leftTime;
        });
      if (active) {
        setRequests(nextRequests);
        if (failedCourses.size > 0) setLoadState('error');
        else if (loadedCourses.size === courses.length) { setLoadState('ready'); setLoadError(''); }
      }
    }

    const unsubscribers = courses.map((course) => onSnapshot(
      query(
        collection(db, 'requests'),
        where('customer_id', '==', course.customer_id),
        where('course_id', '==', course.course_id),
        where('status', 'in', ['new', 'confirmed']),
        orderBy('received_at', 'asc')
      ),
      (snapshot) => {
        const nextCourseRequests = snapshot.docs.map((doc) => {
          const data = doc.data();

          return {
            id: doc.id,
            hole: data.hole,
            status: data.status || 'new',
            received_at: data.received_at,
            confirmed_at: data.confirmed_at,
            completed_at: data.completed_at,
            cancelled_at: data.cancelled_at,
            device_id: data.device_id,
            location_label: data.location_label || data.device_label,
            customer_id: data.customer_id,
            course_id: data.course_id,
            course_name: data.course_name,
            age: formatRequestAge(data.received_at),
          };
        });
        const key = `${course.customer_id}/${course.course_id}`;
        failedCourses.delete(key);
        requestsByCourse.set(key, nextCourseRequests);
        loadedCourses.add(key);
        updateRequests();
      },
      (error) => {
        console.error('Failed to load requests:', error);
        failedCourses.add(`${course.customer_id}/${course.course_id}`);
        if (active) {
          setLoadError(error.code || 'unknown');
          setLoadState('error');
        }
      }
    ));

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [operatorConfig, user]);

  async function handleGoogleSignIn() {
    setAuthState('checking');

    try {
      window.sessionStorage.setItem(FRESH_SIGN_IN_STORAGE_KEY, '1');
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in failed:', error);
      window.sessionStorage.removeItem(FRESH_SIGN_IN_STORAGE_KEY);
      setAuthState('signed_out');
    }
  }

  async function handleEmailSignIn(email, password) {
    setAuthState('checking');

    try {
      window.sessionStorage.setItem(FRESH_SIGN_IN_STORAGE_KEY, '1');
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Email sign-in failed:', error);
      window.sessionStorage.removeItem(FRESH_SIGN_IN_STORAGE_KEY);
      setAuthState('denied');
    }
  }

  const activeRequests = useMemo(() => {
    return requests
      .filter((request) => ['new', 'confirmed'].includes(request.status))
      .sort((left, right) => {
        const leftDate = timestampToDate(left.received_at);
        const rightDate = timestampToDate(right.received_at);
        return (leftDate?.getTime() || 0) - (rightDate?.getTime() || 0);
      });
  }, [requests]);

  const entry = resolveEntry({
    mode: entryMode,
    authenticated: Boolean(user),
    claimsReady,
    isAdmin,
    operatorState,
    inventoryState,
  });

  if (entry === 'public_bay') {
    const match = window.location.pathname.match(/^\/range\/([A-Za-z0-9_-]+)\/?$/);
    return <Suspense fallback={<EntryStatus title="Server request" message="Loading bay…" />}>
      <BayRequestApp apiBaseUrl={API_BASE_URL} bayId={match?.[1] || ''} sandbox={fairwayEnvironment === 'sandbox'} />
    </Suspense>;
  }

  if (entry === 'public_menu') {
    const match = window.location.pathname.match(/^\/cartmenus\/([^/]+)\/?$/);
    let slug = '';
    try { slug = match ? decodeURIComponent(match[1]) : ''; } catch { slug = ''; }
    return <Suspense fallback={<EntryStatus title="Today’s Cart Menu" message="Loading menu…" />}><PublicMenuApp apiBaseUrl={adminApiBaseUrl} slug={slug} /></Suspense>;
  }

  if (!user) {
    return (
      <LoginScreen
        authState={authState}
        mode={entryMode}
        onGoogleSignIn={handleGoogleSignIn}
        onEmailSignIn={handleEmailSignIn}
      />
    );
  }

  if (entry === 'checking') {
    return <EntryStatus title="Fairway Refresh" message="Checking account access..." />;
  }

  if (entry === 'denied') {
    const adminEntry = entryMode === APP_MODE.ADMIN;
    return (
      <EntryStatus
        title="Access denied"
        message={adminEntry ? 'Fairway Refresh staff access is required.' : entryMode === APP_MODE.INVENTORY ? inventoryError : (operatorError || 'Assigned course access is required.')}
        showAdminLink={!adminEntry && claimsReady && isAdmin}
      />
    );
  }

  if (entry === 'admin') {
    return <AdminApp user={user} apiBaseUrl={adminApiBaseUrl} onSignOut={() => signOut(auth)} />;
  }

  if (entry === 'inventory') {
    return <Suspense fallback={<EntryStatus title="Inventory Management" message="Loading course inventory…" />}><InventoryApp user={user} apiBaseUrl={adminApiBaseUrl} courses={inventoryCourses} isAdmin={isAdmin} onOpenAdmin={() => window.location.assign('/admin')} onSignOut={() => signOut(auth)} /></Suspense>;
  }

  return (
    <OperatorApp
      user={user}
      apiBaseUrl={API_BASE_URL}
      operatorConfig={operatorConfig}
      requests={activeRequests}
      loadState={loadState}
      loadError={loadError}
      focusedRequestId={focusedRequestId}
      isAdmin={isAdmin}
      canManageInventory={operatorState === 'authorized'}
      onOpenAdmin={() => window.location.assign('/admin')}
      onOpenInventory={() => window.location.assign('/inventory')}
      onSignOut={() => signOut(auth)}
      onRequestAction={(request, action) => updateRequestStatus(request.id, action)}
    />
  );

  if (completedRequest) {
    return (
      <CompletionScreen
        completedRequest={completedRequest}
        activeRequests={activeRequests}
        onReturn={() => setCompletedRequest(null)}
      />
    );
  }

  let screen = null;

  if (activeTab === 'dashboard') {
    screen = (
      <DashboardScreen
        activeRequests={activeRequests}
        loadState={loadState}
        loadError={loadError}
        onCompleted={setCompletedRequest}
        focusedRequestId={focusedRequestId}
        notificationSetup={operatorConfig && <NotificationSetup user={user} apiBaseUrl={API_BASE_URL} operatorConfig={operatorConfig} />}
      />
    );
  } else if (activeTab === 'history') {
    screen = <HistoryScreen requests={requests} />;
  } else {
    screen = <PlaceholderScreen title={activeTab.toUpperCase()} />;
  }

  return (
    <AppFrame
      activeTab={activeTab}
      onTabChange={setActiveTab}
      user={user}
      isAdmin={isAdmin}
      onOpenAdmin={() => window.location.assign('/admin')}
    >
      {screen}
    </AppFrame>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(window.location.pathname === '/operator-design' ? <OperatorDesignReview /> : <App />);
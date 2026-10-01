import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, onSnapshot, orderBy, query, limit, where } from 'firebase/firestore';
import {
  getRedirectResult,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { CheckCircle, Grid2X2, History, Settings, Map, Circle, ShieldCheck } from 'lucide-react';
import { auth, db, googleProvider } from './lib/firebase';
import { adminApiBaseUrl, apiBaseUrl } from './lib/environment';
import AdminApp from './admin/AdminApp';
import NotificationSetup from './NotificationSetup';
import { operatorRequest } from './lib/operator';
import './styles.css';

export const API_BASE_URL = apiBaseUrl;

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

function LoginScreen({ authState, onGoogleSignIn, onEmailSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleEmailSubmit(event) {
    event.preventDefault();
    await onEmailSignIn(email, password);
  }

  return (
    <main className="page">
      <div className="phone-shell login-shell">
        <section className="login-screen">
          <div className="login-logo">
            <Circle size={22} />
          </div>

          <h1>Fairway Refresh</h1>
          <p className="login-subtitle">Cart Operator Dashboard</p>

          <div className="login-card">
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
          </div>
        </section>
      </div>
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
            <Map size={16} />
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
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [authState, setAuthState] = useState('checking');
  const [requests, setRequests] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [completedRequest, setCompletedRequest] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [operatorConfig, setOperatorConfig] = useState(null);
  const [operatorError, setOperatorError] = useState('');
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
        setAdminMode(false);
        setAuthState('signed_out');
        setOperatorConfig(null);
        return;
      }

      setUser(nextUser);
      try {
        const tokenResult = await getIdTokenResult(nextUser);
        if (isMounted) {
          setIsAdmin(tokenResult.claims.admin === true);
        }
      } catch (error) {
        console.error('Unable to inspect account permissions:', error);
        if (isMounted) {
          setIsAdmin(false);
        }
      }
      setAuthState('signed_in');
    });

    getRedirectResult(auth)
      .then((result) => {
        if (!isMounted || !result?.user) {
          return;
        }

        setUser(result.user);
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
    if (!user) return undefined;
    let active = true;
    setOperatorError('');
    operatorRequest(user, API_BASE_URL, '/api/v1/operator/bootstrap')
      .then((config) => { if (active) setOperatorConfig(config); })
      .catch((error) => {
        if (active) {
          setOperatorConfig(null);
          setOperatorError(error.message);
        }
      });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user || !operatorConfig) {
      setRequests([]);
      setLoadState('loading');
      return undefined;
    }

    const courseIds = operatorConfig.courses.map((course) => course.course_id);

    const requestsQuery = query(
      collection(db, 'requests'),
      where('course_id', 'in', courseIds),
      orderBy('received_at', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const nextRequests = snapshot.docs.map((doc) => {
          const data = doc.data();

          return {
            id: doc.id,
            hole: data.hole,
            status: data.status || 'new',
            received_at: data.received_at,
            confirmed_at: data.confirmed_at,
            completed_at: data.completed_at,
            device_id: data.device_id,
            course_id: data.course_id,
            course_name: data.course_name,
            age: formatRequestAge(data.received_at),
          };
        });

        setRequests(nextRequests);
        setLoadState('ready');
      },
      (error) => {
        console.error('Failed to load requests:', error);
        setLoadError(error.code || 'unknown');
        setLoadState('error');
      }
    );

    return () => unsubscribe();
  }, [operatorConfig, user]);

  async function handleGoogleSignIn() {
    setAuthState('checking');

    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in failed:', error);
      setAuthState('signed_out');
    }
  }

  async function handleEmailSignIn(email, password) {
    setAuthState('checking');

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Email sign-in failed:', error);
      setAuthState('denied');
    }
  }

  const activeRequests = useMemo(() => {
    return requests.filter((request) => request.status !== 'completed');
  }, [requests]);

  if (!user) {
    return (
      <LoginScreen
        authState={authState}
        onGoogleSignIn={handleGoogleSignIn}
        onEmailSignIn={handleEmailSignIn}
      />
    );
  }

  if (operatorError) {
    return <main className="page"><div className="phone-shell"><section className="content"><p className="empty-state error-state">{operatorError}</p></section></div></main>;
  }

  if (completedRequest) {
    return (
      <CompletionScreen
        completedRequest={completedRequest}
        activeRequests={activeRequests}
        onReturn={() => setCompletedRequest(null)}
      />
    );
  }

  if (adminMode && isAdmin) {
    return <AdminApp user={user} apiBaseUrl={adminApiBaseUrl} onExit={() => setAdminMode(false)} />;
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
      onOpenAdmin={() => setAdminMode(true)}
    >
      {screen}
    </AppFrame>
  );
}

createRoot(document.getElementById('root')).render(<App />);
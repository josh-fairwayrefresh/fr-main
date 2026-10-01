import React, { useEffect, useState } from 'react';
import {
  BarChart3, Check, CheckCircle2, ChevronRight, Clock3, Coffee,
  History, LogOut, MapPin, Pause, Play, ShieldCheck,
} from 'lucide-react';
import NotificationSetup from './NotificationSetup';
import { operatorRequest } from './lib/operator';
import './operator.css';

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string') return new Date(value);
  const seconds = value.seconds ?? value._seconds;
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

function requestAge(receivedAt) {
  const date = asDate(receivedAt);
  if (!date) return 'just now';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  return `${minutes} min`;
}

function clockTime(value) {
  const date = asDate(value);
  return date ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Unknown time';
}

function duration(request) {
  const start = asDate(request.received_at);
  const end = asDate(request.completed_at || request.cancelled_at);
  if (!start || !end) return null;
  return `${Math.max(1, Math.round((end - start) / 60000))} min`;
}

function Brand() {
  return <div className="op-brand"><img src="/icons/logo-and-name-row-banner.jpg" alt="Fairway Refresh" /></div>;
}

function ServiceStatus({ course }) {
  const state = course?.service_state;
  const label = state?.suspended ? 'Service Suspended' : state?.active ? 'Service Active' : 'Outside Service Hours';
  return <div className={`op-status ${state?.active ? 'active' : ''}`}><i />{label}</div>;
}

function EmptyQueue({ serviceActive }) {
  return <section className="op-empty"><span><Coffee size={30} /></span><h2>No active requests</h2><p>{serviceActive ? 'You are all caught up. New golfer requests will appear here.' : 'Existing requests remain available when service resumes.'}</p></section>;
}

function RequestFocus({ request, queueLength, onAction, pending }) {
  const [error, setError] = useState('');
  async function act(action) {
    if (action === 'cancel' && !window.confirm(`Cancel the request for Hole ${request.hole ?? 'Unknown'}?`)) return;
    setError('');
    try {
      await onAction(request, action);
    } catch (reason) {
      setError(reason.message);
    }
  }
  return <article id={`request-${request.id}`} className="op-priority">
    <div className="op-time"><Clock3 size={20} /><span>Waiting</span><strong>{requestAge(request.received_at)}</strong></div>
    <div className="op-place"><span>OLDEST ACTIVE REQUEST</span><h2>Hole {request.hole ?? 'Unknown'}</h2><p><MapPin size={17} />{request.course_name || 'Course unavailable'}</p></div>
    <div className="op-actions"><button className="op-complete" type="button" disabled={pending} onClick={() => act('complete')}><Check size={22} />{pending ? 'Updating...' : 'Complete service'}</button><button className="op-cancel" type="button" disabled={pending} onClick={() => act('cancel')}>Cancel request</button></div>
    <footer><CheckCircle2 size={18} /><span>{queueLength > 1 ? 'On completion, the next oldest request moves into focus.' : 'Completing this request clears the active queue.'}</span>{error && <strong role="alert">{error}</strong>}</footer>
  </article>;
}

function Performance({ summary }) {
  return <section className="op-performance"><span>CURRENT PERFORMANCE</span><div><strong>{summary?.completed_transactions ?? 0}</strong><small>Transactions</small></div><div><strong>{summary?.transactions_per_cart_hour ?? 0}</strong><small>Transactions per hour</small></div><div><strong>{summary?.requests_per_hour ?? 0}</strong><small>Requests / cart hour</small></div></section>;
}

function RecentHistory({ history, onOpen }) {
  const completed = history.filter((item) => item.status === 'completed').slice(0, 2);
  return <section className="op-recent"><div><span>RECENTLY COMPLETED</span><strong>{completed.length}</strong></div>{completed.map((item) => <p key={item.request_id}><Check size={15} /><b>Hole {item.hole ?? 'Unknown'}</b><span>{clockTime(item.completed_at)}</span></p>)}{completed.length === 0 && <p className="op-muted">No completed requests yet.</p>}<button type="button" onClick={onOpen}>View full history <ChevronRight size={16} /></button></section>;
}

function RequestsView({ requests, loadState, loadError, focusedRequestId, onAction, pending, summary, history, onOpenHistory, serviceActive }) {
  useEffect(() => {
    if (focusedRequestId) document.getElementById(`request-${focusedRequestId}`)?.scrollIntoView({ block: 'center' });
  }, [focusedRequestId, requests]);
  const next = requests[0];
  return <div className="op-layout"><section className="op-focus"><div className="op-intro"><span>{next ? 'NEXT REQUEST' : 'ACTIVE REQUESTS'}</span><div><h1>{next ? `Hole ${next.hole ?? 'Unknown'}` : 'No active requests'}</h1><strong className="op-queue-total"><b>{requests.length}</b><small>{requests.length === 1 ? 'request' : 'requests'} in queue</small></strong></div></div>
    {loadState === 'loading' && <div className="op-message">Loading requests...</div>}
    {loadState === 'error' && <div className="op-message error" role="alert">Unable to load requests ({loadError || 'unknown'}).</div>}
    {loadState === 'ready' && !next && <EmptyQueue serviceActive={serviceActive} />}
    {next && <RequestFocus request={next} queueLength={requests.length} onAction={onAction} pending={pending === next.id} />}
    {requests.length > 1 && <section className="op-up-next"><div><span>UP NEXT</span><strong>{requests.length - 1} more {requests.length === 2 ? 'request' : 'requests'}</strong></div>{requests.slice(1).map((request, index) => <article key={request.id}><span>{index + 2}</span><div><strong>Hole {request.hole ?? 'Unknown'}</strong><small>{request.course_name || 'Course unavailable'}</small></div><b>{requestAge(request.received_at)}</b><ChevronRight size={18} /></article>)}</section>}
  </section><aside className="op-summary"><Performance summary={summary} /><RecentHistory history={history} onOpen={onOpenHistory} /></aside></div>;
}

function HistoryView({ dashboard }) {
  const [period, setPeriod] = useState('daily');
  const summary = dashboard?.summaries?.[period] || {};
  const history = dashboard?.history || [];
  return <section className="op-history-view"><header><div><span>SERVICE HISTORY</span><h1>Performance & outcomes</h1></div><div className="op-periods">{[['daily', 'Day'], ['weekly', 'Week'], ['monthly', 'Month']].map(([id, label]) => <button type="button" className={period === id ? 'active' : ''} onClick={() => setPeriod(id)} key={id}>{label}</button>)}</div></header><div className="op-metrics"><div><BarChart3 size={18} /><span>Transactions</span><strong>{summary.completed_transactions ?? 0}</strong></div><div><Clock3 size={18} /><span>Active cart hours</span><strong>{summary.active_cart_hours ?? 0}</strong></div><div><CheckCircle2 size={18} /><span>Transactions per hour</span><strong>{summary.transactions_per_cart_hour ?? 0}</strong></div><div><History size={18} /><span>Average completion</span><strong>{summary.average_completion_minutes == null ? '-' : `${summary.average_completion_minutes} min`}</strong></div></div><section className="op-history-list"><div className="op-history-row heading"><span>Outcome</span><span>Request</span><span>Received</span><span>Duration</span></div>{history.map((item) => <div className="op-history-row" key={item.request_id}><span className={`op-outcome ${item.status}`}>{item.status === 'completed' ? 'Completed' : 'Cancelled'}</span><strong>Hole {item.hole ?? 'Unknown'}</strong><span>{clockTime(item.received_at)}</span><span>{duration(item) || '-'}</span></div>)}{history.length === 0 && <div className="op-message">No completed or cancelled requests yet.</div>}</section></section>;
}

export default function OperatorApp({
  user, apiBaseUrl, operatorConfig, requests, loadState, loadError,
  focusedRequestId, isAdmin, onOpenAdmin, onSignOut, onRequestAction,
}) {
  const [tab, setTab] = useState('requests');
  const [dashboard, setDashboard] = useState(null);
  const [dashboardError, setDashboardError] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState(operatorConfig.courses[0]?.course_id || '');
  const [pending, setPending] = useState('');
  const [celebration, setCelebration] = useState('');

  async function refreshDashboard() {
    try {
      setDashboard(await operatorRequest(user, apiBaseUrl, '/api/v1/operator/dashboard'));
      setDashboardError('');
    } catch (reason) {
      setDashboardError(reason.message);
    }
  }

  useEffect(() => { refreshDashboard(); }, [user, apiBaseUrl]);
  const course = dashboard?.courses?.find((item) => item.course_id === selectedCourseId)
    || dashboard?.courses?.[0];
  const selectedRequests = requests.filter((request) => !selectedCourseId || request.course_id === selectedCourseId);

  async function actOnRequest(request, action) {
    setPending(request.id);
    try {
      await onRequestAction(request, action);
      if (action === 'complete') {
        setCelebration(`Hole ${request.hole ?? 'Unknown'} complete`);
        window.setTimeout(() => setCelebration(''), 1800);
      }
      await refreshDashboard();
    } finally {
      setPending('');
    }
  }

  async function toggleService() {
    if (!course) return;
    const action = course.service_state?.suspended ? 'resume' : 'suspend';
    const prompt = action === 'suspend'
      ? `Suspend new beverage requests for ${course.course_name} until the next scheduled service start? Existing requests remain actionable.`
      : `Resume beverage requests for ${course.course_name}?`;
    if (!window.confirm(prompt)) return;
    setPending('service');
    try {
      await operatorRequest(user, apiBaseUrl, `/api/v1/operator/service/${action}`, {
        method: 'POST', body: { course_id: course.course_id },
      });
      await refreshDashboard();
    } finally {
      setPending('');
    }
  }

  return <main className="operator-app"><header className="op-header"><Brand /><nav><button className={tab === 'requests' ? 'active' : ''} type="button" onClick={() => setTab('requests')}>Requests</button><button className={tab === 'history' ? 'active' : ''} type="button" onClick={() => setTab('history')}>History</button></nav>{operatorConfig.courses.length > 1 && <label className="op-course-select"><span>Course</span><select value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>{operatorConfig.courses.map((item) => <option key={item.course_id} value={item.course_id}>{item.course_name}</option>)}</select></label>}<ServiceStatus course={course} /><button className="op-suspend" type="button" onClick={toggleService} disabled={pending === 'service' || !course}>{course?.service_state?.suspended ? <Play size={17} /> : <Pause size={17} />}<span>{course?.service_state?.suspended ? 'Resume Service' : 'Suspend Service'}</span></button>{isAdmin && <button className="op-icon" type="button" onClick={onOpenAdmin} title="Open Admin" aria-label="Open Admin"><ShieldCheck size={18} /></button>}<button className="op-icon" type="button" onClick={onSignOut} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button></header><div className="op-notifications"><NotificationSetup user={user} apiBaseUrl={apiBaseUrl} operatorConfig={operatorConfig} />{dashboardError && <p role="alert">Metrics unavailable: {dashboardError}</p>}</div>{tab === 'requests' ? <RequestsView requests={selectedRequests} loadState={loadState} loadError={loadError} focusedRequestId={focusedRequestId} onAction={actOnRequest} pending={pending} summary={dashboard?.summaries?.daily} history={dashboard?.history || []} onOpenHistory={() => setTab('history')} serviceActive={course?.service_state?.active} /> : <HistoryView dashboard={dashboard} />}{celebration && <div className="op-celebration" role="status"><CheckCircle2 size={22} />{celebration}</div>}</main>;
}

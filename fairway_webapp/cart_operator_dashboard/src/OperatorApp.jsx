import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3, Check, CheckCircle2, ChevronRight, Clock3, Coffee,
  History, LogOut, MapPin, Package, Pause, Play, ShieldCheck,
} from 'lucide-react';
import NotificationSetup from './NotificationSetup';
import { InventorySessionControls, useInventorySession } from './InventorySession';
import { operatorRequest } from './lib/operator';
import {
  authorizedCustomers,
  courseContextUrl,
  courseDisplayLabel,
  courseKey,
  mergeDashboardCourse,
  replaceCourseContext,
  selectedCourseFromLocation,
} from './lib/courseContext.mjs';
import { requestLocationLabel } from './lib/requestLocation.mjs';
import { serviceCategories, serviceCategory } from './lib/serviceCategories.mjs';
import { courseOperation } from './lib/courseOperation.mjs';
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
  const label = state?.active ? 'Service ON' : 'Service OFF';
  return <div className={`op-status ${state?.active ? 'active' : ''}`}><i />{label}</div>;
}

function GroupServiceControls({ group, state, pending, onToggle }) {
  const label = serviceCategory(group).display_name;
  const action = state?.active ? 'Suspend' : 'Resume';
  return <div className="op-service-group" role="group" aria-label={`${label} service`}>
    <h2>{label}</h2>
    <ServiceStatus course={{ service_state: state }} />
    <button className="op-suspend" type="button" disabled={pending} onClick={() => onToggle(group)}
      aria-label={`${action} ${label} service`}>
      {state?.active ? <Pause size={17} /> : <Play size={17} />}
      <span>{action}</span>
    </button>
  </div>;
}

function EmptyQueue({ serviceActive }) {
  return <section className="op-empty"><span><Coffee size={30} /></span><h2>No active requests</h2><p>{serviceActive ? 'You are all caught up. New requests will appear here.' : 'Existing requests remain available when service resumes.'}</p></section>;
}

function RequestFocus({ request, queueLength, onAction, pending, actionBlocked, actioned }) {
  const [error, setError] = useState(null);
  async function act(action) {
    if (action === 'cancel' && !window.confirm(`Cancel the request for ${requestLocationLabel(request)}?`)) return;
    setError(null);
    try {
      await onAction(request, action);
    } catch (reason) {
      setError({ requestId: request.id, message: reason?.message || `Unable to ${action} request.` });
    }
  }
  return <article id={`request-${request.id}`} className="op-priority">
    <div className="op-time"><Clock3 size={20} /><span>Waiting</span><strong>{requestAge(request.received_at)}</strong></div>
    <div className="op-place" aria-live="polite"><span>Selected request</span><h2>{requestLocationLabel(request)}</h2><p><MapPin size={17} />{request.course_name || 'Course unavailable'}</p></div>
    <div className="op-actions"><button className="op-complete" type="button" disabled={actionBlocked || actioned} onClick={() => act('complete')}><Check size={22} />{pending ? 'Updating...' : actioned ? 'Submitted' : 'Complete service'}</button><button className="op-cancel" type="button" disabled={actionBlocked || actioned} onClick={() => act('cancel')}>Cancel request</button></div>
    <footer><CheckCircle2 size={18} /><span>{queueLength > 1 ? 'On completion, the oldest remaining request becomes selected.' : 'Completing this request clears the active queue.'}</span>{error?.requestId === request.id && <strong role="alert">{error.message}</strong>}</footer>
  </article>;
}

function formatHours(value) {
  return Number(value || 0).toFixed(2).replace(/\.?0+$/, '');
}

function formatAverageCompletion(value) {
  return value == null ? '-' : `${value} min`;
}

function Performance({ summary }) {
  return <section className="op-performance"><span>CURRENT PERFORMANCE - DAY</span>
    <div><strong>{summary?.completed_requests ?? 0}</strong><small>Completed Requests</small></div>
    <div><strong>{formatHours(summary?.active_cart_hours)}</strong><small>Active Cart Hours</small></div>
    <div><strong>{formatAverageCompletion(summary?.average_completion_minutes === undefined ? 0 : summary.average_completion_minutes)}</strong><small>Average Completion Time</small></div>
    <div><strong>{summary?.requests_per_hour ?? 0}</strong><small>Requests per Hour</small></div>
  </section>;
}

function RecentHistory({ history, onOpen }) {
  const completed = history.filter((item) => item.status === 'completed').slice(0, 2);
  return <section className="op-recent"><div><span>RECENTLY COMPLETED</span><strong>{completed.length}</strong></div>{completed.map((item) => <p key={item.request_id}><Check size={15} /><b>{requestLocationLabel(item)}</b><span>{clockTime(item.completed_at)}</span></p>)}{completed.length === 0 && <p className="op-muted">No completed requests yet.</p>}<button type="button" onClick={onOpen}>View full history <ChevronRight size={16} /></button></section>;
}

function RequestsView({ requests, loadState, loadError, focusedRequestId, onAction, pending, actionPending, requestActionInFlight, actionedRequestIds, summary, history, onOpenHistory, serviceActive, hidden, cartMetrics = true }) {
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const selectedRequestIdRef = useRef('');
  const manualSelectionVersion = useRef(0);
  const lastFocusedRequestId = useRef('');
  const pendingNotificationSelection = useRef(null);
  const selectedRequest = requests.find((request) => request.id === selectedRequestId) || requests[0] || null;
  const otherRequests = requests.filter((request) => request.id !== selectedRequest?.id);

  useEffect(() => {
    if (focusedRequestId && focusedRequestId !== lastFocusedRequestId.current) {
      lastFocusedRequestId.current = focusedRequestId;
      pendingNotificationSelection.current = {
        requestId: focusedRequestId,
        selectionVersion: manualSelectionVersion.current,
      };
    }

    const notificationSelection = pendingNotificationSelection.current;
    if (notificationSelection) {
      if (notificationSelection.selectionVersion !== manualSelectionVersion.current) {
        pendingNotificationSelection.current = null;
      } else if (!actionPending && requests.some((request) => request.id === notificationSelection.requestId)) {
        selectedRequestIdRef.current = notificationSelection.requestId;
        setSelectedRequestId(notificationSelection.requestId);
        pendingNotificationSelection.current = null;
        return;
      } else if (!actionPending && loadState === 'ready') {
        pendingNotificationSelection.current = null;
      }
    }

    if (!requests.some((request) => request.id === selectedRequestIdRef.current)) {
      const oldestRequestId = requests[0]?.id || '';
      selectedRequestIdRef.current = oldestRequestId;
      setSelectedRequestId(oldestRequestId);
    }
  }, [actionPending, focusedRequestId, loadState, requests]);

  function selectRequest(requestId) {
    if (actionPending || requestActionInFlight.current) return;
    manualSelectionVersion.current += 1;
    pendingNotificationSelection.current = null;
    selectedRequestIdRef.current = requestId;
    setSelectedRequestId(requestId);
  }

  useEffect(() => {
    if (focusedRequestId && selectedRequest?.id === focusedRequestId) {
      document.getElementById(`request-${focusedRequestId}`)?.scrollIntoView({ block: 'center' });
    }
  }, [focusedRequestId, requests, selectedRequest?.id]);
  return <div className="op-layout" hidden={hidden}><section className="op-focus"><div className="op-queue-summary"><strong className="op-queue-total"><b>{requests.length}</b><small>{requests.length === 1 ? 'request' : 'requests'} in queue</small></strong></div>
    {loadState === 'loading' && <div className="op-message">Loading requests...</div>}
    {loadState === 'error' && <div className="op-message error" role="alert">Unable to load requests ({loadError || 'unknown'}).</div>}
    {loadState === 'ready' && !selectedRequest && <EmptyQueue serviceActive={serviceActive} />}
    {selectedRequest && <RequestFocus request={selectedRequest} queueLength={requests.length} onAction={onAction} pending={pending === selectedRequest.id} actionBlocked={Boolean(pending)} actioned={actionedRequestIds.has(selectedRequest.id)} />}
    {otherRequests.length > 0 && <section className="op-up-next" aria-labelledby="other-active-requests-heading"><div><span id="other-active-requests-heading">Other active requests</span><strong>{otherRequests.length} more {otherRequests.length === 1 ? 'request' : 'requests'}</strong></div>{otherRequests.map((request, index) => <button className="op-queue-row" type="button" key={request.id} disabled={actionPending} aria-label={`Select request ${requestLocationLabel(request)}`} onClick={() => selectRequest(request.id)}><span>{index + 1}</span><div><strong>{requestLocationLabel(request)}</strong><small>{request.course_name || 'Course unavailable'}</small></div><b>{requestAge(request.received_at)}</b><ChevronRight size={18} aria-hidden="true" /></button>)}</section>}
  </section><aside className="op-summary">{cartMetrics && <Performance summary={summary} />}<RecentHistory history={history} onOpen={onOpenHistory} /></aside></div>;
}

function HistoryView({ dashboard, cartMetrics = true }) {
  const [period, setPeriod] = useState('daily');
  const report = dashboard?.reports?.[period] || {};
  const summary = report.summary || {};
  const history = report.history || [];
  return <section className="op-history-view"><header><div><span>SERVICE HISTORY</span><h1>{cartMetrics ? 'Performance & outcomes' : 'Request outcomes'}</h1></div><div className="op-periods">{[['daily', 'Day'], ['weekly', 'Week'], ['monthly', 'Month']].map(([id, label]) => <button type="button" className={period === id ? 'active' : ''} aria-pressed={period === id} onClick={() => setPeriod(id)} key={id}>{label}</button>)}</div></header>{cartMetrics && <div className="op-metrics">
    <div><BarChart3 size={18} aria-hidden="true" /><span>Completed Requests</span><strong>{summary.completed_requests ?? 0}</strong></div>
    <div><Clock3 size={18} aria-hidden="true" /><span>Active Cart Hours</span><strong>{formatHours(summary.active_cart_hours)}</strong></div>
    <div><History size={18} aria-hidden="true" /><span>Average Completion Time</span><strong>{formatAverageCompletion(summary.average_completion_minutes === undefined ? 0 : summary.average_completion_minutes)}</strong></div>
    <div><CheckCircle2 size={18} aria-hidden="true" /><span>Requests per Hour</span><strong>{summary.requests_per_hour ?? 0}</strong></div>
  </div>}<section className="op-history-list"><div className="op-history-row heading"><span>Outcome</span><span>Request</span><span>Received</span><span>Duration</span></div>{history.map((item) => <div className="op-history-row" key={item.request_id}><span className={`op-outcome ${item.status}`}>{item.status === 'completed' ? 'Completed' : 'Cancelled'}</span><strong>{requestLocationLabel(item)}</strong><span>{clockTime(item.received_at)}</span><span>{duration(item) || '-'}</span></div>)}{history.length === 0 && <div className="op-message">No completed or cancelled requests yet.</div>}</section></section>;
}

export default function OperatorApp({
  user, apiBaseUrl, inventoryApiBaseUrl, operatorConfig, requests, loadState, loadError,
  focusedRequestId, isAdmin, onOpenAdmin, onOpenInventory, onSignOut, onRequestAction,
}) {
  const [tab, setTab] = useState('requests');
  const [dashboard, setDashboard] = useState(null);
  const [dashboardError, setDashboardError] = useState('');
  const [serviceError, setServiceError] = useState('');
  const [notificationPending, setNotificationPending] = useState(false);
  const notificationActionsInFlight = useRef(0);
  const serviceActionInFlight = useRef(false);
  const [selectedCourseKey, setSelectedCourseKey] = useState(() => {
    const selected = selectedCourseFromLocation(operatorConfig.courses, window.location.search);
    return selected ? courseKey(selected) : '';
  });
  const [pending, setPending] = useState('');
  const [actionedRequestIds, setActionedRequestIds] = useState(() => new Set());
  const [celebration, setCelebration] = useState('');
  const requestActionInFlight = useRef(false);
  const actionedRequestIdsRef = useRef(new Set());
  const refreshSequence = useRef(0);
  const refreshTimer = useRef(null);
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef(false);
  const mounted = useRef(true);
  const selectedCourseRef = useRef(null);
  const selectedCourseKeyRef = useRef('');

  const selectedCourse = operatorConfig.courses.find((item) => courseKey(item) === selectedCourseKey)
    || selectedCourseFromLocation(operatorConfig.courses, window.location.search);
  const selectedCourseKeyValue = selectedCourse ? courseKey(selectedCourse) : '';
  selectedCourseRef.current = selectedCourse;
  selectedCourseKeyRef.current = selectedCourseKeyValue;
  const currentDashboard = dashboard?.key === selectedCourseKeyValue ? dashboard.data : null;
  const course = mergeDashboardCourse(selectedCourse, currentDashboard?.courses);
  const customers = authorizedCustomers(operatorConfig.courses);
  const customerCourses = operatorConfig.courses.filter((item) => item.customer_id === selectedCourse?.customer_id);
  const operation = courseOperation(course);
  const inventorySession = useInventorySession(operation.inventory && inventoryApiBaseUrl ? user : null, inventoryApiBaseUrl, course);
  const selectedRequests = useMemo(() => requests.filter((request) => (
    course && request.customer_id === course.customer_id && request.course_id === course.course_id
  )), [requests, course?.customer_id, course?.course_id]);
  useEffect(() => {
    const activeRequestIds = new Set(selectedRequests.map((request) => request.id));
    for (const requestId of actionedRequestIdsRef.current) {
      if (!activeRequestIds.has(requestId)) actionedRequestIdsRef.current.delete(requestId);
    }
    setActionedRequestIds(new Set(actionedRequestIdsRef.current));
  }, [selectedRequests]);
  const outcomeSignature = useMemo(() => selectedRequests
    .filter((request) => ['completed', 'cancelled'].includes(request.status))
    .map((request) => [
      request.id,
      request.status,
      request.completed_at?.toMillis?.() ?? request.completed_at ?? '',
      request.cancelled_at?.toMillis?.() ?? request.cancelled_at ?? '',
    ].join(':'))
    .sort()
    .join('|'), [selectedRequests]);

  const scheduleDashboardRefresh = useCallback(() => {
    if (!mounted.current) return;
    const sequence = ++refreshSequence.current;
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(async () => {
      refreshTimer.current = null;
      if (!user || sequence !== refreshSequence.current) return;
      if (refreshInFlight.current) {
        refreshQueued.current = true;
        return;
      }
      const targetCourse = selectedCourseRef.current;
      const targetKey = selectedCourseKeyRef.current;
      const query = targetCourse
        ? `?customer_id=${encodeURIComponent(targetCourse.customer_id)}&course_id=${encodeURIComponent(targetCourse.course_id)}`
        : '';
      refreshInFlight.current = true;
      try {
        const result = await operatorRequest(user, apiBaseUrl, `/api/v1/operator/dashboard${query}`);
        if (sequence === refreshSequence.current && targetKey === selectedCourseKeyRef.current) {
          setDashboard({ key: targetKey, data: result });
          setDashboardError('');
        }
      } catch (reason) {
        if (sequence === refreshSequence.current && targetKey === selectedCourseKeyRef.current) {
          setDashboardError(reason.message);
        }
      } finally {
        refreshInFlight.current = false;
        if (refreshQueued.current && mounted.current) {
          refreshQueued.current = false;
          scheduleDashboardRefresh();
        }
      }
    }, 120);
  }, [user, apiBaseUrl]);

  useEffect(() => {
    refreshSequence.current += 1;
    setDashboard(null);
    scheduleDashboardRefresh();
    return () => {
      refreshSequence.current += 1;
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    };
  }, [user, apiBaseUrl, selectedCourseKeyValue, scheduleDashboardRefresh]);

  useEffect(() => {
    scheduleDashboardRefresh();
  }, [outcomeSignature, scheduleDashboardRefresh]);

  useEffect(() => {
    let timer;
    function refreshOnMinute() {
      scheduleDashboardRefresh();
      timer = window.setTimeout(refreshOnMinute, 60000 - (Date.now() % 60000));
    }
    timer = window.setTimeout(refreshOnMinute, 60000 - (Date.now() % 60000));
    return () => window.clearTimeout(timer);
  }, [user, apiBaseUrl, selectedCourseKeyValue, scheduleDashboardRefresh]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      refreshSequence.current += 1;
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  const contextPending = Boolean(pending || inventorySession.submitting || notificationPending);

  function changeCourse(selected, pathname = '/') {
    if (requestActionInFlight.current || serviceActionInFlight.current ||
        inventorySession.isSubmitting() || notificationActionsInFlight.current > 0) return false;
    if (!selected || !operatorConfig.courses.some((item) => courseKey(item) === courseKey(selected))) return false;
    refreshSequence.current += 1;
    setDashboard(null);
    setDashboardError('');
    setServiceError('');
    setCelebration('');
    setSelectedCourseKey(courseKey(selected));
    replaceCourseContext(pathname, selected);
    return true;
  }

  useEffect(() => {
    function navigateHistory() {
      const selected = selectedCourseFromLocation(operatorConfig.courses, window.location.search);
      if (!changeCourse(selected, window.location.pathname)) replaceCourseContext('/', selectedCourseRef.current);
    }
    window.addEventListener('popstate', navigateHistory);
    return () => window.removeEventListener('popstate', navigateHistory);
  });

  async function actOnRequest(request, action) {
    if (pending || requestActionInFlight.current || actionedRequestIdsRef.current.has(request.id)) return;
    requestActionInFlight.current = true;
    setPending(request.id);
    try {
      await onRequestAction(request, action);
      actionedRequestIdsRef.current.add(request.id);
      setActionedRequestIds(new Set(actionedRequestIdsRef.current));
      if (action === 'complete') {
        setCelebration(`${requestLocationLabel(request)} complete`);
        window.setTimeout(() => setCelebration(''), 1800);
      }
      scheduleDashboardRefresh();
    } finally {
      requestActionInFlight.current = false;
      setPending('');
    }
  }

  async function toggleService(group = 'on_course') {
    if (!course || requestActionInFlight.current || serviceActionInFlight.current || pending) return;
    const state = group === 'on_premise' ? course.on_premise_service_state : course.service_state;
    const action = state?.suspended ? 'resume' : 'suspend';
    const groupLabel = operation.physical_devices && course.has_on_premise_devices ? `${serviceCategory(group).display_name} service` : 'service';
    const prompt = action === 'suspend'
      ? `Turn ${groupLabel} OFF for ${course.course_name} until an operator resumes it? Existing requests remain actionable.`
      : `Turn ${groupLabel} ON for ${course.course_name} until an operator suspends it?`;
    if (!window.confirm(prompt)) return;
    setPending('service');
    serviceActionInFlight.current = true;
    setServiceError('');
    try {
      await operatorRequest(user, apiBaseUrl, `/api/v1/operator/service/${action}`, {
        method: 'POST', body: { customer_id: course.customer_id, course_id: course.course_id, service_group: group },
      });
      scheduleDashboardRefresh();
    } catch (error) {
      setServiceError(error.message);
    } finally {
      serviceActionInFlight.current = false;
      setPending('');
    }
  }

  const serviceAction = course?.service_state?.suspended ? 'resume' : 'suspend';
  const serviceActionLabel = serviceAction === 'resume' ? 'Resume Service' : 'Suspend Service';
  const requestServiceActive = course?.service_state?.active ||
    (course?.has_on_premise_devices && course?.on_premise_service_state?.active);

  return <main className="operator-app"><header className="op-header">
    <div className="op-header-main">
      <Brand />
      <nav aria-label="Course Operator navigation">
        <button className={tab === 'requests' ? 'active' : ''} type="button" aria-pressed={tab === 'requests'} onClick={() => setTab('requests')}>Requests</button>
        <button className={tab === 'history' ? 'active' : ''} type="button" aria-pressed={tab === 'history'} onClick={() => setTab('history')}>History</button>
      </nav>
      <div className="op-header-account">
        {isAdmin && <button className="op-icon" type="button" disabled={contextPending} onClick={onOpenAdmin} title="Open Admin" aria-label="Open Admin"><ShieldCheck size={18} /></button>}
        <button className="op-icon" type="button" disabled={contextPending} onClick={onSignOut} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
      </div>
    </div>
    <div className="op-header-context">
      <div className="op-course-context">
        <span className="op-current-course">{courseDisplayLabel(course)}</span>
        {operation.inventory && inventoryApiBaseUrl && <InventorySessionControls key={selectedCourseKeyValue} session={inventorySession} />}
        <div className="op-context-selectors">
          {isAdmin && customers.length > 0 && <label className="op-course-select"><span>Customer</span><select
            value={selectedCourse?.customer_id || ''} disabled={contextPending}
            onChange={(event) => changeCourse(operatorConfig.courses.find((item) => item.customer_id === event.target.value))}
            aria-label="Select customer">{customers.map((item) => <option key={item.customer_id} value={item.customer_id}>{item.customer_name}</option>)}</select></label>}
          {customerCourses.length > 0 && <label className="op-course-select"><span>Service</span><select
            value={selectedCourseKeyValue} disabled={contextPending}
            onChange={(event) => changeCourse(customerCourses.find((item) => courseKey(item) === event.target.value))}
            aria-label="Select course">{customerCourses.map((item) => <option key={courseKey(item)} value={courseKey(item)}>{courseOperation(item).kind === 'driving_range' ? 'Driving range service' : 'Cart service'}</option>)}</select></label>}
        </div>
      </div>
      <div className="op-service-controls">
        {operation.physical_devices && course?.has_on_premise_devices ? <div className="op-service-groups">{serviceCategories.map(({ id }) => <GroupServiceControls key={id} group={id} state={id === 'on_course' ? course.service_state : course.on_premise_service_state} pending={Boolean(pending)} onToggle={toggleService} />)}</div> : <><ServiceStatus course={course} />
        <button className="op-suspend" type="button" onClick={() => toggleService()} disabled={Boolean(pending) || !course} aria-label={`${serviceActionLabel} for ${course?.course_name || 'selected course'}`} title={serviceActionLabel}>
          {serviceAction === 'resume' ? <Play size={17} /> : <Pause size={17} />}
          <span>{serviceActionLabel}</span>
        </button></>}
        {serviceError && <p role="alert">{serviceError}</p>}
        {operation.inventory && <a className="op-inventory" href={contextPending ? undefined : courseContextUrl('/inventory', course)} aria-disabled={contextPending || undefined} title="Inventory management"><Package size={17} />Inventory</a>}
      </div>
    </div>
  </header><div className="op-notifications"><NotificationSetup user={user} apiBaseUrl={apiBaseUrl} operatorConfig={operatorConfig}
    onMutationPending={(value) => {
      notificationActionsInFlight.current += value ? 1 : -1;
      setNotificationPending(notificationActionsInFlight.current > 0);
    }}
  />{dashboardError && <p role="alert">Course history unavailable: {dashboardError}</p>}</div><RequestsView key={`requests:${selectedCourseKeyValue}`} requests={selectedRequests} loadState={loadState} loadError={loadError} focusedRequestId={focusedRequestId} onAction={actOnRequest} pending={pending} actionPending={Boolean(pending && pending !== 'service')} requestActionInFlight={requestActionInFlight} actionedRequestIds={actionedRequestIds} summary={currentDashboard?.reports?.daily?.summary} history={currentDashboard?.reports?.daily?.history || []} onOpenHistory={() => setTab('history')} serviceActive={requestServiceActive} hidden={tab !== 'requests'} cartMetrics={operation.cart_metrics} />{tab === 'history' && <HistoryView key={`history:${selectedCourseKeyValue}`} dashboard={currentDashboard} cartMetrics={operation.cart_metrics} />}{celebration && <div className="op-celebration" role="status"><CheckCircle2 size={22} />{celebration}</div>}</main>;
}

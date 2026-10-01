import React from 'react';
import {
  BarChart3, Check, CheckCircle2, ChevronRight, Clock3, Coffee,
  History, MapPin, Pause, Sparkles, TrendingUp, Users,
} from 'lucide-react';
import './operatorDesignReview.css';

const REQUESTS = [
  { id: 'request-1', hole: 7, wait: '18 min', detail: 'Monarch Bay Golf Club', tone: 'urgent' },
  { id: 'request-2', hole: 12, wait: '9 min', detail: 'Monarch Bay Golf Club', tone: 'watch' },
  { id: 'request-3', hole: 3, wait: '3 min', detail: 'Monarch Bay Golf Club', tone: 'fresh' },
];

const COMPLETED = [
  { hole: 16, time: '11:42 AM', duration: '7 min' },
  { hole: 5, time: '11:28 AM', duration: '9 min' },
  { hole: 10, time: '11:06 AM', duration: '6 min' },
];

function Brand({ compact = false }) {
  return <div className={`od-brand ${compact ? 'compact' : ''}`}><img src="/icons/logo-and-name-row-banner.jpg" alt="Fairway Refresh" /></div>;
}

function Status({ energetic = false }) {
  return <div className={`od-status ${energetic ? 'energetic' : ''}`}><i />Service Active</div>;
}

function Periods({ active = 'Day' }) {
  return <div className="od-periods" aria-label="History period">{['Day', 'Week', 'Month'].map((period) => <button className={period === active ? 'active' : ''} type="button" key={period}>{period}</button>)}</div>;
}

function CompleteButton({ label = 'Complete' }) {
  return <button className="od-complete" type="button"><Check size={22} />{label}</button>;
}

function EmptyState() {
  return <section className="od-empty"><span><Coffee size={30} /></span><h2>No active requests</h2><p>You are all caught up. New golfer requests will appear here.</p><div><i />Service Active</div></section>;
}

function OptionA({ empty }) {
  return <main className="od-prototype od-a">
    <header className="od-topbar"><Brand /><Status /><button className="od-suspend" type="button" aria-label="Suspend service"><Pause size={17} /><span>Suspend Service</span></button></header>
    <div className="oda-layout">
      <section className="oda-queue">
        <div className="od-heading"><div><span>ACTIVE REQUESTS</span><h1>{empty ? 'Queue clear' : '3 golfers waiting'}</h1></div><strong>{empty ? '0' : '3'}</strong></div>
        {empty ? <EmptyState /> : <div className="oda-requests">{REQUESTS.map((request, index) => <article className={`oda-request ${index === 0 ? 'priority' : ''}`} key={request.id}>
          <div className="oda-order">{index + 1}</div><div className="oda-location"><span>{index === 0 ? 'NEXT TO SERVE' : 'IN QUEUE'}</span><h2>Hole {request.hole}</h2><p><MapPin size={15} />{request.detail}</p></div><div className="oda-wait"><span>WAITING</span><strong>{request.wait}</strong></div><div className="oda-actions"><CompleteButton /><button className="od-cancel" type="button">Cancel Request</button></div>
        </article>)}</div>}
      </section>
      <aside className="oda-rail">
        <section className="oda-kpis"><span>AT A GLANCE</span><div><strong>14</strong><small>Transactions today</small></div><div><strong>4.7</strong><small>Transactions per hour</small></div><div><strong>6</strong><small>Requests this hour</small></div></section>
        <section className="oda-history"><div><span>COMPLETED TODAY</span><strong>11</strong></div>{COMPLETED.map((item) => <p key={item.time}><CheckCircle2 size={16} /><b>Hole {item.hole}</b><span>{item.time}</span><em>{item.duration}</em></p>)}<button type="button">View history <ChevronRight size={16} /></button><Periods /></section>
      </aside>
    </div>
  </main>;
}

function OptionB({ empty }) {
  return <main className="od-prototype od-b">
    <header className="od-topbar"><Brand /><div className="odb-shift"><span>Today's cart run</span><strong>Great pace, Maya</strong></div><Status energetic /><button className="od-suspend" type="button" aria-label="Suspend service"><Pause size={17} /><span>Suspend</span></button></header>
    <section className="odb-scoreboard">
      <div><span>TRANSACTIONS</span><strong>14</strong><small><TrendingUp size={16} />3 ahead of yesterday</small></div><div><span>TRANSACTIONS PER HOUR</span><strong>4.7</strong><small>Strong service pace</small></div><div><span>REQUESTS THIS HOUR</span><strong>6</strong><small>Steady opportunity</small></div>
      <div className="odb-progress"><span>SHIFT MOMENTUM</span><strong>14 served</strong><div><i /></div><small>Next milestone at 15</small></div>
    </section>
    <div className="odb-main">
      <section className="odb-queue"><div className="od-heading"><div><span>ACTIVE REQUESTS</span><h1>{empty ? 'Ready for the next hello' : 'Next opportunities'}</h1></div><strong>{empty ? '0' : '3'}</strong></div>
        {empty ? <EmptyState /> : <div className="odb-cards">{REQUESTS.map((request, index) => <article className={index === 0 ? 'priority' : ''} key={request.id}><header><span>{index === 0 ? 'SERVE NEXT' : `UP NEXT · ${index + 1}`}</span><div><Clock3 size={16} />{request.wait}</div></header><h2>Hole {request.hole}</h2><p>{request.detail}</p><div className="odb-card-actions"><CompleteButton label={index === 0 ? 'Complete & celebrate' : 'Complete'} /><button className="od-cancel" type="button">Cancel Request</button></div>{index === 0 && <div className="odb-reward"><Sparkles size={17} /><span>Completion adds a quick burst of sunshine and advances today’s progress.</span></div>}</article>)}</div>}
      </section>
      <aside className="odb-history"><div className="odb-history-head"><div><span>TODAY</span><h2>11 completed</h2></div><Periods /></div><div className="odb-people"><Users size={21} /><div><strong>Good work travels</strong><span>Quick service keeps the course moving.</span></div></div>{COMPLETED.map((item) => <p key={item.time}><span className="odb-check"><Check size={14} /></span><b>Hole {item.hole}</b><span>{item.time}</span><em>{item.duration}</em></p>)}<button type="button"><History size={17} />Open full history</button></aside>
    </div>
  </main>;
}

function OptionC({ empty }) {
  const next = REQUESTS[0];
  return <main className="od-prototype od-c">
    <header className="odc-header"><Brand compact /><nav><button className="active" type="button">Requests</button><button type="button">History</button></nav><Status /><button className="od-suspend" type="button" aria-label="Suspend service"><Pause size={17} /><span>Suspend Service</span></button></header>
    <div className="odc-layout">
      <section className="odc-focus">
        <div className="odc-queue-summary"><strong className="odc-queue-total"><b>{empty ? '0' : '3'}</b><small>requests in queue</small></strong></div>
        {empty ? <EmptyState /> : <article className="odc-priority"><div className="odc-time"><Clock3 size={20} /><span>Waiting</span><strong>{next.wait}</strong></div><div className="odc-place"><span>OLDEST ACTIVE REQUEST</span><h2>Hole {next.hole}</h2><p><MapPin size={17} />{next.detail}</p></div><div className="odc-actions"><CompleteButton label="Complete service" /><button className="od-cancel" type="button">Cancel Request</button></div><footer><CheckCircle2 size={18} /><span>On completion: a brief green confirmation, then Hole 12 moves into focus.</span></footer></article>}
        {!empty && <section className="odc-up-next"><div><span>UP NEXT</span><strong>2 more requests</strong></div>{REQUESTS.slice(1).map((request, index) => <article key={request.id}><span>{index + 2}</span><div><strong>Hole {request.hole}</strong><small>{request.detail}</small></div><b>{request.wait}</b><ChevronRight size={18} /></article>)}</section>}
      </section>
      <aside className="odc-summary"><section><span>CURRENT PERFORMANCE</span><div><strong>14</strong><small>Transactions</small></div><div><strong>4.7</strong><small>Transactions per hour</small></div><div><strong>6</strong><small>Requests this hour</small></div></section><section><div className="odc-history-head"><span>COMPLETED TODAY</span><strong>11</strong></div>{COMPLETED.slice(0, 2).map((item) => <p key={item.time}><Check size={15} /><b>Hole {item.hole}</b><span>{item.time}</span></p>)}<Periods /><button type="button">View full history <ChevronRight size={16} /></button></section></aside>
    </div>
  </main>;
}

export default function OperatorDesignReview() {
  return <div className="od-review"><OptionC empty={false} /></div>;
}
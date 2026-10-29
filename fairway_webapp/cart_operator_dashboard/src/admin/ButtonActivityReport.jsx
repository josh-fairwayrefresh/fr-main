import React, { useEffect, useRef, useState } from 'react';
import { adminRequest, downloadBlob } from './adminApi';

export default function ButtonActivityReport({ user, apiBaseUrl, customers, directoryError }) {
  const [customerId, setCustomerId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const version = useRef(0);
  const customer = customers.find(item => item.customer_id === customerId);
  const course = customer?.courses?.find(item => item.course_id === courseId);
  useEffect(() => () => { version.current++; }, []);
  function change(setter, value) {
    version.current++;
    setter(value); setResult(null); setError(''); setPending(false);
  }
  async function generate(event) {
    event.preventDefault();
    const sequence = ++version.current;
    setPending(true); setError(''); setResult(null);
    try {
      const blob = await adminRequest(user, apiBaseUrl, '/api/v1/admin/reports/button-activity', {
        method: 'POST', responseType: 'blob',
        body: { customer_id: customerId, course_id: courseId, start_date: start, end_date: end },
      });
      if (sequence === version.current) {
        setResult({ blob, filename: `button-activity-${customerId}-${courseId}-${start}-${end}.pdf` });
      }
    } catch (reason) {
      if (sequence === version.current) setError(reason.message);
    } finally {
      if (sequence === version.current) setPending(false);
    }
  }
  return <section className="a-view" aria-labelledby="button-report-title">
    <div className="a-heading"><div><p>REPORTS</p><h2 id="button-report-title">Button Activity</h2></div></div>
    <p>Filled dots show received service-unavailable attempts, including retries. Open circles show completed physical-button requests at their receipt times. QR activity is excluded.</p>
    <form className="a-form a-panel" onSubmit={generate}>
      <div className="a-form-grid">
        <label>Customer<select aria-label="Customer" required value={customerId} onChange={event => {
          change(setCustomerId, event.target.value); setCourseId('');
        }}><option value="">Select Customer</option>{customers.map(item =>
          <option key={item.customer_id} value={item.customer_id}>{item.customer_name}</option>)}</select></label>
        <label>Course<select aria-label="Course" required disabled={!customer} value={courseId} onChange={event => change(setCourseId, event.target.value)}>
          <option value="">Select Course</option>{customer?.courses?.map(item =>
            <option key={item.course_id} value={item.course_id}>{item.course_name}</option>)}</select></label>
        <label>Start date<input type="date" required value={start} onChange={event => change(setStart, event.target.value)} /></label>
        <label>End date<input type="date" required min={start || undefined} value={end} onChange={event => change(setEnd, event.target.value)} /></label>
      </div>
      <p>Dates use the Course timezone{course?.timezone ? `: ${course.timezone}` : ' (select a Course)'}. Maximum 31 calendar days; charts continue after 12 days per landscape Letter page.</p>
      <p>Retained logs are queried at generation time. Unavailable/partial history is marked, not treated as zero. Legend labels show device IDs only; historical locations are not inferred.</p>
      {(error || directoryError) && <div className="a-notice a-error" role="alert">{error || directoryError}</div>}
      <button className="a-primary" type="submit" disabled={pending || !course || Boolean(directoryError)}>
        {pending ? 'Generating...' : 'Generate'}
      </button>
    </form>
    {result && <div className="a-panel" role="status"><p>Report generated. Download the landscape Letter PDF to review its counts, scatterplot, coverage and as-of boundary.</p>
      <button className="a-primary" type="button" onClick={() => downloadBlob(result.blob, result.filename)}>Download PDF</button>
    </div>}
  </section>;
}

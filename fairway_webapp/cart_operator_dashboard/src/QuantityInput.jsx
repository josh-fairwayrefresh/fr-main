import React, { useId } from 'react';

export default function QuantityInput({ label, value, onChange, min, disabled }) {
  const id = useId();
  const number = Number(value);
  const valid = value !== '' && Number.isSafeInteger(number) && number >= min;
  function step(delta) {
    if (!valid) return;
    const next = number + delta;
    if (Number.isSafeInteger(next) && next >= min) onChange(String(next));
  }
  return <div className="inv-quantity-field">
    <label htmlFor={id}>{label}</label>
    <div className="inv-quantity-input">
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={disabled || !valid || number <= min} onClick={() => step(-1)}>-</button>
      <input id={id} autoFocus type="number" inputMode="numeric" min={min} step="1" required value={value} onChange={event => onChange(event.target.value)} disabled={disabled} />
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={disabled || !valid || number === Number.MAX_SAFE_INTEGER} onClick={() => step(1)}>+</button>
    </div>
  </div>;
}

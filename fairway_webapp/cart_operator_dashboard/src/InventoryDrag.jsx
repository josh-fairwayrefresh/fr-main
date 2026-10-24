import React, { useEffect, useRef, useState } from 'react';
import { INVENTORY_STATE_LABELS } from './lib/inventoryModel.mjs';

export function useInventoryDrag({ scope, disabled, onMove }) {
  const [drag, setDrag] = useState(null);
  const pointer = useRef(null);
  const frame = useRef(null);
  const picked = useRef(null);
  const suppressClickUntil = useRef(0);

  function cancel() {
    cancelAnimationFrame(frame.current);
    frame.current = null;
    const current = pointer.current;
    if (current?.active) suppressClickUntil.current = Date.now() + 500;
    pointer.current = null;
    picked.current = null;
    if (current?.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
    setDrag(null);
  }

  useEffect(() => {
    cancel();
    const keydown = event => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', keydown);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('blur', cancel);
    };
  }, [scope]);
  useEffect(() => { if (disabled) cancel(); }, [disabled]);

  function targetAt(x, y) {
    return document.elementFromPoint(x, y)?.closest('[data-inventory-drop]')?.dataset.inventoryDrop || null;
  }

  function update() {
    const current = pointer.current;
    if (!current?.active) return;
    const target = targetAt(current.x, current.y);
    setDrag({ product: current.product, x: current.x, y: current.y, target, keyboard: false });
  }

  function scroll() {
    const current = pointer.current;
    if (!current?.active) return;
    const edge = 72;
    const speed = current.y < edge ? -Math.ceil((edge - current.y) / 5)
      : current.y > window.innerHeight - edge ? Math.ceil((current.y - window.innerHeight + edge) / 5) : 0;
    if (speed) window.scrollBy(0, speed);
    update();
    frame.current = requestAnimationFrame(scroll);
  }

  function start(event, product) {
    if (disabled || !event.isPrimary || event.button !== 0 || pointer.current) return;
    const handle = event.target.closest('[data-inventory-drag-handle]');
    if (!handle && (event.pointerType !== 'mouse' || event.target.closest('button, select, input, a, label'))) return;
    cancel();
    pointer.current = {
      id: event.pointerId, element: handle || event.currentTarget, product,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false,
    };
    pointer.current.element.setPointerCapture(event.pointerId);
  }

  function move(event) {
    const current = pointer.current;
    if (!current || event.pointerId !== current.id) return;
    current.x = event.clientX;
    current.y = event.clientY;
    if (!current.active && Math.hypot(current.x - current.startX, current.y - current.startY) >= 8) {
      current.active = true;
      frame.current = requestAnimationFrame(scroll);
    }
    if (current.active) {
      event.preventDefault();
      update();
    }
  }

  function finish(event) {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    const target = current.active ? targetAt(event.clientX, event.clientY) : null;
    if (current.active) {
      event.preventDefault();
    }
    cancel();
    if (target && target !== current.product.state) onMove(current.product, target);
  }

  function pick(product) {
    if (disabled || Date.now() < suppressClickUntil.current) return;
    const same = picked.current?.product_id === product.product_id;
    cancel();
    if (!same) {
      picked.current = product;
      setDrag({ product, keyboard: true, target: null });
    }
  }

  function drop(target) {
    const product = picked.current;
    cancel();
    if (product && target !== product.state) onMove(product, target);
  }

  return {
    drag, pick, drop, cancel,
    bindings: product => ({
      onPointerDown: event => start(event, product), onPointerMove: move, onPointerUp: finish,
      onPointerCancel: cancel, onLostPointerCapture: () => { if (pointer.current) cancel(); },
    }),
  };
}

export function InventoryDragFeedback({ drag }) {
  if (!drag) return null;
  const text = `Moving ${drag.product.name}. ${drag.target ? `Release in ${INVENTORY_STATE_LABELS[drag.target]}.` : 'Drag to an availability column.'} Escape cancels.`;
  return <>
    <span className="inv-drag-announcement" role="status">{text}</span>
    {!drag.keyboard && <div className="inv-drag-preview" aria-hidden="true" style={{
      left: Math.max(8, Math.min(drag.x + 16, window.innerWidth - 240)),
      top: Math.max(8, Math.min(drag.y + 16, window.innerHeight - 80)),
    }}>{text}</div>}
  </>;
}

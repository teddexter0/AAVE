import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ScreenGuide.css';

export default function ScreenGuide({ title, steps }) {
  const titleId = useId();
  const dialog = useRef(null);
  const trigger = useRef(null);

  return createPortal(
    <>
      <button
        ref={trigger}
        type="button"
        className="screen-guide-trigger"
        aria-label="Help for this screen"
        aria-haspopup="dialog"
        onClick={() => dialog.current.showModal()}
      >
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M8 11c2-5 8-8 13-5 5 3 3 7-1 9-4 2-6 4-6 7m-1 5h.1" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        className="screen-guide-panel"
        aria-labelledby={titleId}
        onClose={() => trigger.current?.focus()}
      >
        <p className="screen-guide-kicker">QUICK GUIDE</p>
        <h2 id={titleId}>{title}</h2>
        <ol>{steps.map(step => <li key={step}>{step}</li>)}</ol>
        <form method="dialog"><button type="submit">Got it</button></form>
      </dialog>
    </>,
    document.body
  );
}

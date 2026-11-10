import React, { createContext, useContext, useRef, useState } from 'react';
import { inventorySignOutBlocker } from './InventorySession';
import { courseContextUrl } from './lib/courseContext.mjs';

const SignOutContext = createContext(null);

export function useAccountSignOut() {
  const signOut = useContext(SignOutContext);
  if (!signOut) throw new Error('Account sign-out requires the application authentication boundary.');
  return signOut;
}

export function AccountSignOutProvider({ getUser, apiBaseUrl, onSignOut, children }) {
  const [notice, setNotice] = useState(null);
  const checking = useRef(null);

  async function requestSignOut() {
    if (checking.current) return;
    const attempt = new AbortController();
    checking.current = attempt;
    setNotice({ checking: true });
    try {
      const user = getUser();
      const blocker = user ? await inventorySignOutBlocker(user, apiBaseUrl, { signal: attempt.signal }) : null;
      if (attempt.signal.aborted) return;
      if (getUser()?.uid !== user?.uid) throw new Error('Account changed while checking sign-out. Please retry.');
      if (blocker) {
        setNotice({ course: blocker.course, message: blocker.pending
          ? 'Resolve the unconfirmed inventory submission and close any open shift in Inventory before signing out.'
          : 'Close your open shift in Inventory before signing out. Your operator and reconciliation information have not been changed.' });
        return;
      }
      setNotice({ signingOut: true });
      await onSignOut();
      setNotice(null);
    } catch (error) {
      if (!attempt.signal.aborted) setNotice({ message: `Unable to sign out safely: ${error.message}` });
    } finally { if (checking.current === attempt) checking.current = null; }
  }

  return <SignOutContext.Provider value={requestSignOut}>
    <div inert={notice ? true : undefined}>{children}</div>
    {notice && <div className="inventory-session-overlay"><section className="account-sign-out" role="dialog" aria-modal="true" aria-labelledby="account-sign-out-title">
      <h2 id="account-sign-out-title">{notice.checking ? 'Checking inventory shifts…' : notice.signingOut ? 'Signing out…' : 'Before signing out'}</h2>
      {notice.message && <p role="alert">{notice.message}</p>}
      {!notice.signingOut && <footer>
        <button autoFocus type="button" onClick={() => {
          checking.current?.abort();
          checking.current = null;
          setNotice(null);
        }}>Stay signed in</button>
        {notice.course
          ? <a href={courseContextUrl('/inventory', notice.course)}>Go to Inventory</a>
          : !notice.checking && <button type="button" onClick={requestSignOut}>Retry sign out</button>}
      </footer>}
    </section></div>}
  </SignOutContext.Provider>;
}

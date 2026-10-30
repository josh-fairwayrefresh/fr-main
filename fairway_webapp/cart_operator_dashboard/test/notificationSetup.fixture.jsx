import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import AppRefresh from '../src/AppRefresh';
import NotificationSetup from '../src/NotificationSetup';

const user = { uid: 'notification-test-operator', getIdToken: async () => 'notification-test-token' };
const config = window.__notificationConfig;

function NotificationFixture() {
  const refreshRecoveryRef = useRef(null);
  return <main>
    <AppRefresh user={user} getBlockReason={() => ''} onRefresh={() => {
      const state = window.__notificationMock;
      state.refreshHandlerStack = true;
      try {
        return refreshRecoveryRef.current?.();
      } finally {
        state.refreshHandlerStack = false;
      }
    }} />
    <NotificationSetup user={user} apiBaseUrl={config.apiBaseUrl || ''} operatorConfig={config}
      refreshRecoveryRef={refreshRecoveryRef} />
  </main>;
}

createRoot(document.getElementById('root')).render(<NotificationFixture />);

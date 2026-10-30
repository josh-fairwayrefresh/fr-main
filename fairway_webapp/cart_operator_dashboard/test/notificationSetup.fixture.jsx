import React from 'react';
import { createRoot } from 'react-dom/client';
import AppRefresh from '../src/AppRefresh';
import NotificationSetup from '../src/NotificationSetup';

const user = { uid: 'notification-test-operator', getIdToken: async () => 'notification-test-token' };
const config = window.__notificationConfig;

createRoot(document.getElementById('root')).render(<main>
  <AppRefresh user={user} getBlockReason={() => ''} />
  <NotificationSetup user={user} apiBaseUrl={config.apiBaseUrl || ''} operatorConfig={config} />
</main>);

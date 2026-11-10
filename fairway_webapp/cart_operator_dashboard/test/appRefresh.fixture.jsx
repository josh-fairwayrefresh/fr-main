import React from 'react';
import { createRoot } from 'react-dom/client';
import AppRefresh from '../src/AppRefresh';

window.refreshGuard = '';
createRoot(document.getElementById('root')).render(<main>
  <h1>Release {document.querySelector('meta[name="release"]').content}</h1>
  <AppRefresh user={{ uid: 'refresh-test' }} getBlockReason={() => window.refreshGuard} />
</main>);

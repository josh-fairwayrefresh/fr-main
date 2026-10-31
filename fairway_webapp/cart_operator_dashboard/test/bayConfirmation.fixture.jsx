import React from 'react';
import { createRoot } from 'react-dom/client';
import BayRequestApp from '../src/BayRequestApp';

createRoot(document.getElementById('root')).render(
  <BayRequestApp apiBaseUrl="/mock-api" bayId="test-bay-id" />,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThreadTabApp } from './ThreadTabApp';
import '../app.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThreadTabApp />
  </StrictMode>,
);

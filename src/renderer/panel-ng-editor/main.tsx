import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PanelNgEditorApp } from './PanelNgEditorApp';
import '../app.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <PanelNgEditorApp />
  </StrictMode>,
);

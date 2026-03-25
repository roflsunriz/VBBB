import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PanelPostEditorApp } from './PanelPostEditorApp';
import '../app.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <PanelPostEditorApp />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BoardTabApp } from './BoardTabApp';
import '../app.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <BoardTabApp />
  </StrictMode>,
);

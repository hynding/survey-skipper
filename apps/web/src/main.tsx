import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Api } from './api';
import { App, type DemoOptions } from './App';
import './styles.css';

function render(api?: Api, demo?: DemoOptions) {
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App api={api} demo={demo} />
      </StrictMode>,
    );
  }
}

// `VITE_DEMO=true` (the GitHub Pages build) runs the server in the browser. It is loaded only then, so the regular app
// doesn't ship it.
if ((import.meta.env.VITE_DEMO as string | undefined) === 'true') {
  void import('./demo').then(({ startDemo }) => {
    const { api, demo } = startDemo();
    render(api, demo);
  });
} else {
  render();
}

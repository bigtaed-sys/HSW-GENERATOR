import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startGeometrySync } from './model/geo';
import { useStore } from './model/store';
import { projectFromHash } from './ui/share';
import './styles.css';

const shared = projectFromHash();
if (shared) {
  useStore.getState().setProject(shared);
  history.replaceState(null, '', location.pathname + location.search);
}
startGeometrySync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

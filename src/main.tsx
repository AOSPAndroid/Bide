import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import './styles.css';
import './theme.css';
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
import './workspace-ui.css';

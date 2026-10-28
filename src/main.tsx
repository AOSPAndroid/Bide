import { createRoot } from 'react-dom/client';
import App from './App';
import {installLayerStyles} from './layer-style-render';
import ErrorBoundary from './ErrorBoundary';
import Paywall from './Paywall';
import './styles.css';
import './theme.css';
installLayerStyles();
// Phones: the interface itself never zooms. The canvas has its own pinch-zoom,
// and a page zoomed from a toolbar or dialog could not be zoomed back once the
// fingers land on the canvas. Safari ignores maximum-scale, so its pinch events
// are cancelled here; other browsers follow touch-action (mobile-shell.css).
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,e=>e.preventDefault(),{passive:false});
createRoot(document.getElementById('root')!).render(<ErrorBoundary><Paywall><App /></Paywall></ErrorBoundary>);
import './workspace-ui.css';
import './compact.css';
// Phone and touch layout, one file per area (see FEATURES.md, Phones).
import './mobile-canvas.css';
import './mobile-chrome.css';
import './mobile-dialogs.css';
import './mobile-documents.css';
import './mobile-shell.css';

import { Component, type ErrorInfo, type ReactNode } from 'react';
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('bide editor error', error, info.componentStack); }
  render() { return this.state.error ? <div className="busy-overlay"><div className="modal"><h2>The editor needs to reload</h2><p className="muted" style={{marginTop:16}}>Your last autosaved workspace will be restored.</p><div className="dialog-actions"><button className="primary" onClick={()=>location.reload()}>Reload workspace</button></div></div></div> : this.props.children; }
}

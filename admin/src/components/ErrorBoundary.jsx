import { Component } from 'react';

/** If a page ever crashes, show a message and a way back instead of a blank screen. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Page crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Something went wrong</h1>
          <p className="sub">This page hit an unexpected problem. Nothing was lost. Reloading usually fixes it.</p>
          <div className="stack">
            <button type="button" className="btn btn-primary btn-md" onClick={() => window.location.assign('/')}>Reload the admin site</button>
            <details className="muted small"><summary>Technical details</summary><pre className="details-json">{String(this.state.error?.stack || this.state.error)}</pre></details>
          </div>
        </div>
      </div>
    );
  }
}

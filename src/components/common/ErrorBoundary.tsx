import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null, info: '' };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: '' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ info: errorInfo.componentStack || '' });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const isDev = import.meta.env.DEV;
      return (
        <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', background: '#fff1f2', minHeight: '100vh' }}>
          <h2 style={{ color: '#e11d48', marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: '#64748b', marginBottom: 16 }}>
            The app hit an unexpected error. Try recovering, or refresh the page.
          </p>
          {isDev && (
            <>
              <pre style={{ background: '#fee2e2', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, color: '#991b1b' }}>
                {this.state.error?.message}
                {'\n\n'}
                {this.state.error?.stack}
              </pre>
              {this.state.info && (
                <details style={{ marginTop: 16 }}>
                  <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: 12 }}>Component Stack</summary>
                  <pre style={{ fontSize: 11, color: '#64748b', padding: 8, marginTop: 4 }}>{this.state.info}</pre>
                </details>
              )}
            </>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null, info: '' })}
            style={{ marginTop: 16, padding: '8px 20px', background: '#e11d48', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
          >
            Try to recover
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';

type Props = {
  children: ReactNode;
  /** When this changes, the boundary clears the error (e.g. route pathname). */
  resetKey?: string;
  /** `page` keeps sidebar usable; `app` is full-screen. */
  variant?: 'app' | 'page';
};

type State = {
  error: Error | null;
  componentStack: string;
};

function buildErrorDetails(error: Error, componentStack: string, route: string) {
  return [
    `Message: ${error.message}`,
    error.stack ? `Stack:\n${error.stack}` : '',
    componentStack ? `Component stack:\n${componentStack}` : '',
    `Route: ${route || '(unknown)'}`,
    `Time: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const componentStack = info.componentStack ?? '';
    this.setState({ componentStack });
    console.error('UI error boundary caught:', error, componentStack);

    const route =
      typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '';
    void api
      .logClientError({
        message: error.message,
        stack: error.stack,
        componentStack,
        route,
      })
      .catch(() => undefined);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, componentStack: '' });
    }
  }

  private async copyDetails() {
    const error = this.state.error;
    if (!error) return;
    const route =
      typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '';
    const text = buildErrorDetails(error, this.state.componentStack, route);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore clipboard failures */
    }
  }

  render() {
    if (this.state.error) {
      const pageVariant = this.props.variant === 'page';
      return (
        <div
          className={
            pageVariant
              ? 'flex min-h-[50vh] flex-col items-center justify-center bg-surface3 p-6 text-center'
              : 'flex min-h-screen flex-col items-center justify-center bg-bgPrimary p-6 text-center'
          }
        >
          <h1 className="text-lg font-semibold text-textPrimary">Something went wrong</h1>
          <p className="mt-2 max-w-md text-sm text-textSecondary">
            The app encountered an error on this screen. Your saved data is safe. Try again, open another
            page from the sidebar, or use System Health from Settings.
          </p>
          <pre className="mt-3 max-h-40 w-full max-w-xl overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface2 p-3 text-left text-xs text-danger">
            {this.state.error.message || 'Unknown error'}
          </pre>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
              onClick={() => this.setState({ error: null, componentStack: '' })}
            >
              Try again
            </button>
            <button
              type="button"
              className="rounded-md border border-border bg-surface2 px-4 py-2 text-sm text-textPrimary"
              onClick={() => void this.copyDetails()}
            >
              Copy error details
            </button>
            {!pageVariant ? (
              <button
                type="button"
                className="text-sm text-brand underline"
                onClick={() => window.location.reload()}
              >
                Reload app
              </button>
            ) : null}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Resets automatically when the route changes so one broken page never needs a full reload. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={`${location.pathname}${location.search}`} variant="page">
      {children}
    </ErrorBoundary>
  );
}

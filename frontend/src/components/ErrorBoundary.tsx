import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children:  ReactNode;
  /** Optional custom fallback UI. Receives the error and a reset function. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

// If a lazy chunk fails to load (stale browser cache after a deploy), reload once.
// The flag prevents infinite loops if the reload itself fails.
const CHUNK_RELOAD_KEY = 'cc_chunk_reloaded';

function isChunkLoadError(error: Error): boolean {
  return (
    error.message.includes('Failed to fetch dynamically imported module') ||
    error.message.includes('Importing a module script failed') ||
    error.message.includes('Loading chunk') ||
    error.name === 'ChunkLoadError'
  );
}

/**
 * ErrorBoundary — catches render-time errors in child components and displays
 * a fallback UI instead of white-screening the entire app.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomePageThatMightCrash />
 *   </ErrorBoundary>
 *
 * React requires class components for error boundaries — there is no hook
 * equivalent.  This component is intentionally minimal (no external deps,
 * no logging SDK) — add a `componentDidCatch` call to your observability
 * tool (Sentry, Datadog, etc.) when integrating one.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);

    // Chunk load failures mean the browser has a cached JS bundle that references
    // assets which no longer exist after a new deploy (emptyOutDir wipes old hashes).
    // Reload once to pick up the new index.html and fresh asset hashes.
    if (isChunkLoadError(error)) {
      const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      if (!alreadyReloaded) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        window.location.reload();
      }
    }
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      if (fallback) return fallback(error, this.reset);

      return (
        <div
          className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center"
          style={{ color: '#94a3b8' }}
        >
          <div
            className="h-12 w-12 rounded-2xl flex items-center justify-center mb-4 text-2xl"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            ⚠
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: '#e2e8f0' }}>
            Something went wrong
          </p>
          <p className="text-xs mb-4" style={{ color: '#64748b', maxWidth: '320px' }}>
            {error.message || 'An unexpected error occurred rendering this section.'}
          </p>
          <button
            onClick={this.reset}
            className="text-xs px-4 py-2 rounded-lg transition-colors"
            style={{
              background:  'rgba(99,102,241,0.15)',
              border:      '1px solid rgba(99,102,241,0.3)',
              color:       '#a5b4fc',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return children;
  }
}

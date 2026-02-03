import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{ error: Error }> },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // 如果提供了fallback组件，则使用它；否则显示默认错误UI
      if (this.props.fallback) {
        const Fallback = this.props.fallback;
        return <Fallback error={this.state.error} />;
      }

      return (
        <div className="flex items-start justify-center min-h-screen bg-background p-4 overflow-auto">
          <div className="text-left max-w-4xl w-full space-y-4">
            <h2 className="text-2xl font-bold text-destructive">应用出现错误</h2>
            
            <div className="p-4 bg-destructive/10 rounded-md border border-destructive/20">
              <p className="font-semibold text-destructive">{this.state.error.message}</p>
            </div>

            {this.state.errorInfo && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground">错误堆栈:</h3>
                <pre className="p-4 bg-muted/50 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[400px]">
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}

            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              onClick={() => window.location.reload()}
            >
              重新加载应用
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
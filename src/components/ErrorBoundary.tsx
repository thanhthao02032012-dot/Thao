// @ts-nocheck
import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 text-center h-full w-full bg-[#0B0F14] text-[#E8EAF0] rounded-xl border border-red-500/20">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
          <p className="text-sm text-[#94A3B8] max-w-md mb-6">
            {this.state.error?.message || "An unexpected error occurred in this component."}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-[#171C23] hover:bg-[#2A313C] border border-[#2A313C] rounded-lg transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

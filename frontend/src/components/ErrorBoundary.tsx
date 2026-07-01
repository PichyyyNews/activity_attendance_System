import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, ChevronDown, ChevronUp, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-6 py-12 select-none animate-in fade-in duration-300">
          <div className="text-center space-y-6 max-w-lg w-full">
            {/* Warning Icon */}
            <div className="mx-auto w-24 h-24 bg-error/10 rounded-full flex items-center justify-center text-error animate-pulse">
              <ShieldAlert size={48} className="stroke-[1.5]" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-black text-ink tracking-tight">เกิดข้อผิดพลาดในการทำงานของระบบ</h1>
              <p className="text-sm text-muted max-w-md mx-auto">
                ระบบพบปัญหาที่ไม่สามารถดำเนินการต่อได้โดยอัตโนมัติ กรุณาลองโหลดหน้าใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบหากยังคงพบปัญหานี้
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/"
                className="flex items-center justify-center space-x-2 px-5 h-11 border border-hairline rounded-md text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
              >
                <Home size={16} />
                <span>กลับหน้าหลัก</span>
              </a>
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center space-x-2 px-5 h-11 bg-primary hover:bg-primary-active text-white rounded-md text-sm font-semibold transition-colors cursor-pointer"
              >
                <RefreshCw size={16} />
                <span>โหลดหน้าใหม่</span>
              </button>
            </div>

            {/* Error details dropdown */}
            {this.state.error && (
              <div className="pt-4 text-left">
                <button
                  onClick={this.toggleDetails}
                  className="flex items-center justify-between w-full px-4 py-2.5 bg-surface-soft border border-hairline rounded-md text-xs font-semibold text-muted hover:text-ink transition-colors cursor-pointer"
                >
                  <span>รายละเอียดทางเทคนิค (Technical Details)</span>
                  {this.state.showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {this.state.showDetails && (
                  <div className="mt-2 p-4 bg-[#1e1e1e] text-[#d4d4d4] rounded-md font-mono text-[11px] overflow-auto max-h-60 border border-hairline/10 leading-relaxed">
                    <div className="text-error font-bold mb-2">
                      Error: {this.state.error.toString()}
                    </div>
                    {this.state.errorInfo?.componentStack && (
                      <div className="whitespace-pre text-muted/80">
                        {this.state.errorInfo.componentStack}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

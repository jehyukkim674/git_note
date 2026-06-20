import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/// 렌더 중 예외가 나면 흰 화면 대신 폴백 UI를 보여준다.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("UI 크래시:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash">
          <h2>문제가 발생했습니다</h2>
          <pre>{String(this.state.error)}</pre>
          <button onClick={() => location.reload()}>새로고침</button>
        </div>
      );
    }
    return this.props.children;
  }
}

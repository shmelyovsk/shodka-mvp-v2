import React, { Component, useEffect, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

declare global {
  interface Window {
    ShodkaStartup?: { fail: (code: string) => void; mounted: () => void };
    ShodkaPlatformReady?: Promise<void>;
  }
}
class AppBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  componentDidCatch() {
    try { localStorage.setItem("shodka-startup-error", JSON.stringify({code:"APP_RENDER",at:new Date().toISOString()})); } catch {}
  }
  render() {
    if (this.state.failed) return <section className="startup-screen" role="alert"><h1>Не удалось открыть СХОДКУ</h1><p>Попробуйте загрузить приложение ещё раз. Если ошибка повторяется, сообщите код в поддержку.</p><button onClick={()=>window.location.reload()}>Повторить загрузку</button><small>Код: APP_RENDER</small></section>;
    return this.props.children;
  }
}
function Mounted({children}: {children: ReactNode}) {
  useEffect(() => {
    window.ShodkaStartup?.mounted();
    try { window.Telegram?.WebApp?.ready?.(); } catch {}
    try { window.WebApp?.ready?.(); } catch {}
  }, []);
  return <>{children}</>;
}
async function start() {
  try {
    const [{default: App}] = await Promise.all([import("./App"), window.ShodkaPlatformReady]);
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode><Mounted><AppBoundary><App /></AppBoundary></Mounted></React.StrictMode>,
    );
  } catch { window.ShodkaStartup?.fail("APP_START"); }
}
void start();

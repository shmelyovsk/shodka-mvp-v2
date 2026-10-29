import { useEffect, useState } from "react";

export function StartupScreen() {
  const [slow, setSlow] = useState(false);
  const [retry, setRetry] = useState(false);
  useEffect(() => {
    const hint = setTimeout(() => setSlow(true), 8000);
    const action = setTimeout(() => setRetry(true), 70000);
    return () => { clearTimeout(hint); clearTimeout(action); };
  }, []);
  return <section className="startup-screen" role="status" aria-live="polite">
    <h1>СХОДКА</h1><span className="startup-spinner" aria-hidden="true"/>
    <p>Загружаем встречи…</p>
    {slow && <p className="startup-hint">Первое открытие может занять около минуты.</p>}
    {retry && <button type="button" onClick={() => window.location.reload()}>Повторить загрузку</button>}
  </section>;
}

import { useEffect, useState } from "react";

const phrases=["Можно прийти одному. В этом и идея.","Проверяем, кто взял мяч.","Для хорошей компании иногда не хватает одного тебя.","Кто-то тоже ищет, с кем поиграть.","Разминаем пальцы перед знакомством.","Контакты откроются после одобрения заявки."];

export function StartupScreen() {
  const [phrase,setPhrase]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>setPhrase(n=>(n+1)%phrases.length),9000);return()=>clearInterval(timer);},[]);
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
    <p className="startup-phrase" aria-live="off">{phrases[phrase]}</p>
    {retry && <button type="button" onClick={() => window.location.reload()}>Повторить загрузку</button>}
  </section>;
}

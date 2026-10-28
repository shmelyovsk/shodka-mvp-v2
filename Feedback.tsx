export function EmptyState({title, text, action, onAction}: {title:string;text:string;action?:string;onAction?:()=>void}) {
 return <section className="empty-state"><h3>{title}</h3><p>{text}</p>{action&&<button className="secondary" onClick={onAction}>{action}</button>}</section>;
}
export function LoadingCards(){return <div className="loading-cards" role="status" aria-label="Загружаем встречи"><span>Загружаем…</span>{[0,1].map(i=><div className="skeleton-card" aria-hidden="true" key={i}><i/><i/><i/></div>)}</div>;}
export function LoadError({onRetry}: {onRetry:()=>void}){return <section className="empty-state" role="alert"><h3>Не удалось загрузить данные</h3><p>Проверь подключение к интернету и попробуй ещё раз.</p><button className="secondary" onClick={onRetry}>Повторить</button></section>;}

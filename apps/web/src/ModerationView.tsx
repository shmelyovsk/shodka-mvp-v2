import { useEffect, useState } from "react";
import { api } from "./api";
interface Report {id:string;kind:"activity"|"user"|"review";targetId:string;reason:string;createdAt:string;status:"open"|"resolved";resolution?:string;ownerName?:string;ownerNickname?:string;ownerSuspended:boolean;ownerWarning:boolean;protectedOwner:boolean;content?:string;hidden?:boolean}
export function ModerationView({currentUserId,onChanged}:{currentUserId:string;onChanged:()=>void}) {
  const [reports,setReports]=useState<Report[]>([]);const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);const [history,setHistory]=useState(false);
  async function load(){setReports(await api<Report[]>("/api/moderation",{},currentUserId));}
  useEffect(()=>{void load().catch(error=>setMessage(error.message));},[currentUserId]);
  async function resolve(report:Report,action:string){
    if(!window.confirm("Применить действие модерации? Оно будет записано в журнал."))return;
    setBusy(true);setMessage("");
    try{await api(`/api/moderation/${report.id}`,{method:"PATCH",body:JSON.stringify({action})},currentUserId);await load();onChanged();setMessage("Решение сохранено");}
    catch(error){setMessage(error instanceof Error?error.message:"Не удалось применить решение");}finally{setBusy(false);}
  }
  const shown=reports.filter(item=>history?item.status==="resolved":item.status==="open");
  return <section className="moderation-page"><div className="section-heading"><h2>Модерация</h2><span>{shown.length}</span></div><p className="history-note">Разбирайте контекст перед решением. Скрытие публикации и блокировка аккаунта — разные действия. Ошибочное решение можно отменить в истории.</p><div className="history-tabs"><button className={!history?"active":""} onClick={()=>setHistory(false)}>Новые жалобы</button><button className={history?"active":""} onClick={()=>setHistory(true)}>История решений</button></div>{message&&<p className="account-feedback" role="status">{message}</p>}
    {!shown.length&&<p className="empty">В этой очереди пока нет жалоб.</p>}
    {shown.map(report=><article key={report.id} className="moderation-report"><span className="sport-pill">{{activity:"Сходка",user:"Профиль",review:"Отзыв"}[report.kind]}</span><h3>{report.ownerName??"Автор недоступен"}{report.ownerNickname?` · @${report.ownerNickname}`:""}</h3><p className="history-note">{new Date(report.createdAt).toLocaleString("ru-RU")}</p><strong>Причина жалобы</strong><p>{report.reason}</p><strong>Текст публикации</strong><p className="reported-content">{report.content||"Без текста"}</p>{history&&<p className="history-note">Решение: {{hide:"Скрыто",restore:"Восстановлено",warn:"Предупреждение",suspend:"Блокировка",unsuspend:"Доступ восстановлен",clearwarning:"Предупреждение снято",dismiss:"Отклонено"}[report.resolution??""]??report.resolution}</p>}
      <div className="moderation-actions">
        {report.kind!=="user"&&<button disabled={busy} className="secondary" onClick={()=>void resolve(report,report.hidden?"restore":"hide")}>{report.hidden?"Вернуть публикацию":"Скрыть публикацию"}</button>}
        {!report.protectedOwner&&<><button disabled={busy} className="secondary" onClick={()=>void resolve(report,report.ownerWarning?"clearwarning":"warn")}>{report.ownerWarning?"Снять предупреждение":"Предупредить"}</button><button disabled={busy} className="secondary danger" onClick={()=>void resolve(report,report.ownerSuspended?"unsuspend":"suspend")}>{report.ownerSuspended?"Снять блокировку":"Заблокировать аккаунт"}</button></>}
        {!history&&<button disabled={busy} className="text-button" onClick={()=>void resolve(report,"dismiss")}>Отклонить жалобу</button>}
      </div>
    </article>)}
  </section>;
}

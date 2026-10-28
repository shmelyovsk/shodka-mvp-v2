import {useState} from "react";
import {api} from "./api";
import {LoadError} from "./Feedback";
type Block={userId:string;name:string;nickname?:string};
export function BlockedUsers({currentUserId}:{currentUserId:string}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<Block[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 async function load(){setLoading(true);setError(false);try{setItems(await api<Block[]>("/api/blocks",{},currentUserId));}catch{setError(true);}finally{setLoading(false);}}
 return <section className="profile-section"><button className="secondary full" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void load();}}>Заблокированные пользователи</button>{open&&<><p className="history-note">После разблокировки дружба и отменённые заявки не восстанавливаются автоматически.</p>{loading?<p role="status">Загружаем…</p>:error?<LoadError onRetry={()=>void load()}/>:items.length?items.map(item=><div className="blocked-row" key={item.userId}><span><strong>{item.name}</strong>{item.nickname&&<small>@{item.nickname}</small>}</span><button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await api('/api/blocks/'+encodeURIComponent(item.userId),{method:"DELETE"},currentUserId);await load();}catch{setError(true);}finally{setBusy(false);}}}>Разблокировать</button></div>):<p className="history-note">Ты пока никого не заблокировал.</p>}</>}</section>;
}

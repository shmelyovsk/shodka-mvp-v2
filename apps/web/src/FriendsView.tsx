import { useEffect, useState } from "react";
import { EmptyState, LoadingCards, LoadError } from "./Feedback";
import { Icon } from "./Icon";
import { api } from "./api";
import type { Friend, PublicUser } from "./socialTypes";

export function FriendsView({ currentUserId, onProfile }: {currentUserId: string; onProfile: (id: string) => void}) {
  const [friends, setFriends] = useState<Friend[]>([]); const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
  async function load() {setLoading(true);setLoadError(false);try{setFriends(await api<Friend[]>("/api/friends", {}, currentUserId));}catch{setLoadError(true);}finally{setLoading(false);}}
  useEffect(() => { void load().catch(error => setMessage(error.message)); }, [currentUserId]);
  async function act(id: string, method: "PATCH" | "DELETE") {
    setBusy(true); setMessage("");
    try { await api(`/api/friends/${id}`, {method, ...(method === "PATCH" ? {body: JSON.stringify({status:"accepted"})} : {})}, currentUserId); await load(); }
    catch(error) { setMessage(error instanceof Error ? error.message : "Не удалось изменить запрос"); }
    finally { setBusy(false); }
  }
  return <section className="friends-page">
    <p className="history-note">После принятия запроса вы увидите подтверждённые Telegram-контакты друг друга. Для остальных пользователей они скрыты.</p>
    <form className="friend-search" onSubmit={async event => {event.preventDefault();setBusy(true);setMessage("");try {const data=await api<PublicUser[]>(`/api/people?q=${encodeURIComponent(query)}`,{},currentUserId);setResults(data);if(!data.length)setMessage("По такому нику никого не нашли");}catch(error){setMessage(error instanceof Error?error.message:"Ошибка поиска");}finally{setBusy(false);}}}>
      <label htmlFor="nickname-search">Найти по нику СХОДКИ</label><div><input id="nickname-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="@username" maxLength={25}/><button className="primary search-button" disabled={busy} aria-label="Найти друга"><Icon name="search" size={20}/></button></div>
    </form>
    {message && <p className="account-feedback" role="status">{message}</p>}
    {results.map(user=><button key={user.id} className="person-row" onClick={()=>onProfile(user.id)}>{user.avatarUrl&&<img src={user.avatarUrl} alt=""/>}<span><strong>{user.name}</strong><small>@{user.nickname}</small></span><Icon name="arrow-up-right" size={19}/></button>)}
    {loading?<LoadingCards/>:loadError?<LoadError onRetry={()=>void load()}/>:(["incoming","accepted","outgoing"] as const).map(group=>{
      const list=friends.filter(item=>group==="accepted"?item.status==="accepted":item.status==="pending"&&item.incoming===(group==="incoming"));
      return <section key={group} className="friend-group"><h3>{{incoming:"Входящие запросы",accepted:"Мои друзья",outgoing:"Отправленные запросы"}[group]} {list.length>0&&<span className="count-badge">{list.length}</span>}</h3>
        {!list.length&&(group==="accepted"?<EmptyState title="Здесь будут свои люди" text="Добавь знакомых — собраться снова будет проще." action="Найти друга" onAction={()=>document.getElementById("nickname-search")?.focus()}/>:<p className="history-note">{group==="incoming"?"Новые запросы в друзья появятся здесь.":"Отправь запрос по нику — после принятия друг появится в твоём списке."}</p>)}
        {list.map(friend=><article className={`friend-item${group==="accepted"?" friend-item-accepted":""}`} key={friend.id}><button className="person-row" onClick={()=>onProfile(friend.user.id)}>{friend.user.avatarUrl?<img src={friend.user.avatarUrl} alt=""/>:<div className="friend-avatar" aria-hidden="true">{friend.user.name.trim().charAt(0).toUpperCase()}</div>}<span><strong>{friend.user.name}</strong><small>@{friend.user.nickname}</small></span></button><div className="friend-actions">
          {group==="incoming"&&<button disabled={busy} className="primary" onClick={()=>void act(friend.id,"PATCH")}>Принять</button>}
          <button disabled={busy} className={group==="accepted"?"friend-remove":"text-button"} aria-label={group==="accepted"?`Удалить ${friend.user.name} из друзей`:undefined} onClick={()=>{if(group!=="accepted"||window.confirm("Удалить из друзей? Доступ к контактам по дружбе будет закрыт."))void act(friend.id,"DELETE");}}>{group==="accepted"?"Удалить":group==="incoming"?"Отклонить":"Отменить запрос"}</button>
        </div></article>)}
      </section>;
    })}
  </section>;
}

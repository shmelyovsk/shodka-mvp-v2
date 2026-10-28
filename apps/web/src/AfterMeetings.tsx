import {useEffect,useState} from "react";
import {api} from "./api";
import {LoadError} from "./Feedback";
type Meeting={id:string;title:string;date:string};
type Person={id:string;name:string;friendship:"pending"|"accepted"|null;reviewed:boolean};
function MeetingFeedback({meeting,currentUserId,onProfile,onDone}:{meeting:Meeting;currentUserId:string;onProfile:(id:string,activityId:string)=>void;onDone:()=>void}){
 const [people,setPeople]=useState<Person[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function answer(met:boolean){if(busy)return;setBusy(true);setError("");try{const result=await api<{people:Person[]}>(`/api/activities/${meeting.id}/feedback`,{method:"POST",body:JSON.stringify({met})},currentUserId);if(met)setPeople(result.people);else onDone();}catch{setError("Не удалось сохранить ответ. Попробуй ещё раз.");}finally{setBusy(false);}}
 return <article className="meeting-feedback"><span className="eyebrow">После встречи</span><h3>{meeting.title}</h3>{people===null?<><p>Удалось встретиться?</p><p className="history-note">Ответ виден только тебе и не меняет общий итог встречи.</p><div className="request-actions"><button className="secondary" disabled={busy} onClick={()=>void answer(false)}>Не встретились</button><button className="primary" disabled={busy} onClick={()=>void answer(true)}>Да, встретились</button></div></>:<><p>Как всё прошло? Оставь отзыв о личном опыте и сохрани новые знакомства.</p>{people.map(person=><div className="feedback-person" key={person.id}><strong>{person.name}</strong><button className="secondary" onClick={()=>onProfile(person.id,meeting.id)}>{person.reviewed?(person.friendship==="accepted"?"Открыть профиль":"Добавить в друзья"):"Оставить отзыв"}</button></div>)}{!people.length&&<p className="history-note">Нет доступных участников для отзыва.</p>}<button className="text-button" onClick={onDone}>Готово</button></>}{error&&<p role="alert">{error}</p>}</article>;
}
export function AfterMeetings({currentUserId,onProfile,revision=0}:{revision?:number;currentUserId:string;onProfile:(id:string,activityId:string)=>void}){
 const [items,setItems]=useState<Meeting[]>([]),[error,setError]=useState(false);
 async function load(){setError(false);try{setItems(await api<Meeting[]>("/api/after-meetings",{},currentUserId));}catch{setError(true);}}
 useEffect(()=>{void load();},[currentUserId,revision]);
 if(error)return <LoadError onRetry={()=>void load()}/>;
 return <>{items.map(meeting=><MeetingFeedback key={meeting.id} meeting={meeting} currentUserId={currentUserId} onProfile={onProfile} onDone={()=>setItems(old=>old.filter(item=>item.id!==meeting.id))}/>)}</>;
}

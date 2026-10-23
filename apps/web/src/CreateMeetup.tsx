import { useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { SPORT_OPTIONS, GAME_OPTIONS } from "./options";
import { Icon } from "./Icon";

type Draft = Record<string, string>;
const initial: Draft = {category:"sport",format:"offline",title:"",sport:"",customSport:"",date:"",district:"",publicPlace:"",exactAddress:"",connectionLink:"",capacity:"4",level:"any",price:"0",minAge:"",maxAge:"",equipment:"",description:"",gamePlatform:""};
const headings=[<>Собери<br/>свою компанию.</>,<>Когда<br/>и где?</>,<>Осталось<br/>пару деталей.</>];
const descriptions=["Начнём с того, чем хочется заняться.","Договоримся о времени и месте встречи.","Помоги участникам понять, чего ожидать."];
export function CreateMeetup({onPublish}:{onPublish:(draft:Draft)=>Promise<boolean>}) {
 const [draft,setDraft]=useState<Draft>(initial),[step,setStep]=useState(0),[review,setReview]=useState(false),[busy,setBusy]=useState(false);
 const form=useRef<HTMLFormElement>(null);
 const field=(name:string)=>({name,value:draft[name],onChange:(e:ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>setDraft(d=>({...d,[name]:e.target.value}))});
 const minimum=()=>{const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
 function next(){const inputs=form.current?.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea');for(const input of inputs??[])if(!input.reportValidity())return;setStep(n=>Math.min(2,n+1));if(step===2)setReview(true);window.scrollTo({top:0,behavior:"smooth"});}
 function back(){if(review)setReview(false);else setStep(n=>Math.max(0,n-1));}
 async function submit(event:FormEvent){event.preventDefault();if(!review){next();return;}if(busy)return;setBusy(true);try{const payload:Draft={...draft,sport:draft.sport==="Другое"?draft.customSport.trim():draft.sport};delete payload.customSport;if(draft.format==="online"){delete payload.district;delete payload.publicPlace;delete payload.exactAddress;}else delete payload.connectionLink;if(draft.category==="games")delete payload.equipment;await onPublish(payload);}finally{setBusy(false);}}
 return <section className="create-page"><div className="wizard-toolbar"><button type="button" className="text-button" disabled={busy||(!review&&step===0)} onClick={back}><Icon name="arrow-left"/>Назад</button><span>{review?"Проверка перед публикацией":`Шаг ${step+1} из 3`}</span></div>
 <ol className="wizard-steps" aria-label="Этапы создания">{["Занятие","Встреча","Детали"].map((label,index)=><li key={label} className={index===step?"current":index<step?"done":""} aria-current={index===step?"step":undefined}><span>{index<step?<Icon name="check" size={14}/>:index+1}</span>{label}</li>)}</ol>
 <form ref={form} className="form wizard-form" noValidate onSubmit={submit}><fieldset disabled={busy} className="account-fields">
 {!review&&<div className="intro-panel"><h1>{headings[step]}</h1><p>{descriptions[step]}</p></div>}
 {!review&&step===0&&<>
 <div><span className="field-label">Что планируешь?</span><div className="choice-row">{[["sport","Спорт"],["games","Игры"]].map(([value,label])=><button key={value} type="button" className="choice" aria-pressed={draft.category===value} onClick={()=>setDraft(d=>({...d,category:value,sport:"",customSport:""}))}>{label}</button>)}</div></div>
 <label>Занятие<select required {...field("sport")}><option value="" disabled>Выбери занятие</option>{(draft.category==="games"?GAME_OPTIONS:SPORT_OPTIONS).map(sport=><option key={sport}>{sport}</option>)}<option>Другое</option></select></label>
 {draft.sport==="Другое"&&<label>Какое занятие?<input required maxLength={80} {...field("customSport")} placeholder="Название спорта или игры"/></label>}
 <label>Название<input required maxLength={120} {...field("title")} placeholder="Например, волейбол после пар"/></label><p className="form-hint">Коротко и по делу — чтобы сразу захотелось пойти.</p>
 </>}
 {!review&&step===1&&<>
 <div><span className="field-label">Формат</span><div className="choice-row">{[["offline",draft.category==="games"?"Компьютерный клуб":"Личная встреча"],["online","Онлайн"]].map(([value,label])=><button type="button" key={value} className="choice" aria-pressed={draft.format===value} onClick={()=>setDraft(d=>({...d,format:value}))}>{label}</button>)}</div></div>
 <label>Дата и время<input required type="datetime-local" min={minimum()} {...field("date")}/></label>
 {draft.format==="offline"?<><label>Район или метро<input required maxLength={100} {...field("district")} placeholder="Например, м. Сокол"/></label><label>{draft.category==="games"?"Компьютерный клуб":"Публичное место встречи"}<input required maxLength={200} {...field("publicPlace")} placeholder={draft.category==="games"?"Название клуба":"Площадка или спортивный центр"}/></label><label>Точный адрес<input maxLength={300} {...field("exactAddress")} placeholder="Необязательно"/></label><p className="form-hint">Точный адрес увидят только одобренные участники.</p></>:<><label>Ссылка подключения<input type="url" maxLength={2048} {...field("connectionLink")} placeholder="https://… (необязательно)"/></label><p className="form-hint">Ссылка откроется после одобрения заявки. Можно договориться и через организатора.</p></>}
 {draft.category==="games"&&<label>Платформа / сервер / ранг<input maxLength={100} {...field("gamePlatform")} placeholder="Например, ПК · Steam · любой ранг"/></label>}
 </>}
 {!review&&step===2&&<>
 <div className="form-row"><label>Всего участников<input required type="number" min={2} max={100} {...field("capacity")}/></label><label>Кого ждём<select {...field("level")}><option value="any">Любой уровень</option><option value="beginner">Новичков</option><option value="intermediate">С опытом</option></select></label></div><p className="form-hint">Число участников включает тебя как организатора.</p>
 <label>С человека, ₽<input type="number" min={0} max={100000} {...field("price")}/></label>
 <div className="form-row"><label>Возраст от<input type="number" min={16} max={100} {...field("minAge")} placeholder="Необязательно"/></label><label>Возраст до<input type="number" max={100} min={Math.max(16,Number(draft.minAge)||16)} {...field("maxAge")} placeholder="Необязательно"/></label></div><p className="form-hint">Оставь пустыми, если ждёшь всех от 16 лет.</p>
 {draft.category==="sport"&&<label>Инвентарь<input maxLength={300} {...field("equipment")} placeholder="Например, мяч уже есть"/></label>}
 <label>О встрече<textarea rows={4} maxLength={2000} {...field("description")} placeholder="Как собираемся играть? Что взять с собой?"/></label>
 </>}
 {review&&<><div className="intro-panel"><h1>Всё готово<br/>к встрече?</h1><p>Проверь детали перед публикацией.</p></div><section className="creation-review"><span className="eyebrow">{draft.sport==="Другое"?draft.customSport:draft.sport}</span><h2>{draft.title}</h2><p className="review-date">{new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(draft.date))}</p><p>{draft.format==="online"?"Онлайн, из дома":`${draft.publicPlace}, ${draft.district}`}</p><p>{draft.capacity} участников · {draft.price&&Number(draft.price)>0?`${draft.price} ₽ с человека`:"Бесплатно"}</p><p>{{any:"Любой уровень",beginner:"Новичков",intermediate:"С опытом"}[draft.level]??"Любой уровень"}</p>{(draft.minAge||draft.maxAge)&&<p>Возраст: {draft.minAge||16}–{draft.maxAge||100} лет</p>}{draft.category==="games"&&draft.gamePlatform&&<p>{draft.gamePlatform}</p>}{draft.category==="sport"&&draft.equipment&&<p>Инвентарь: {draft.equipment}</p>}{draft.description&&<p className="review-description">{draft.description}</p>}</section></>}
 <button className="primary full" type="submit" disabled={busy}>{busy?"Публикуем…":review?"Опубликовать сходку":step===2?"Проверить сходку":"Дальше"}<Icon name="arrow-right" size={20}/></button>
 </fieldset></form></section>;
}

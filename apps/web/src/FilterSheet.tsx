import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface SearchFilters {sport:string;place:string;format:string;friends:boolean;free:boolean;favorites:boolean}
const empty:SearchFilters={sport:"Все",place:"",format:"all",friends:false,free:false,favorites:false};

export function FilterSheet({value,sports,category,onApply,onClose}:{value:SearchFilters;sports:string[];category:string;onApply:(value:SearchFilters)=>void;onClose:()=>void}) {
  const [draft,setDraft]=useState(value),[query,setQuery]=useState("");
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=dialog.current;const previous=document.body.style.overflow;document.body.style.overflow="hidden";element?.showModal();return()=>{element?.close();document.body.style.overflow=previous;};},[]);
  const choices=sports.filter(item=>item!=="Все"&&item.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")));
  const set=(patch:Partial<SearchFilters>)=>setDraft(old=>({...old,...patch}));
  return <dialog ref={dialog} className="search-filter-sheet" aria-labelledby="filter-title" onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===dialog.current)onClose();}}>
    <form onSubmit={event=>{event.preventDefault();onApply(draft);}}>
      <header className="filter-sheet-heading"><h2 id="filter-title">Фильтры</h2><button type="button" className="filter-close" aria-label="Закрыть фильтры" onClick={onClose}><Icon name="x"/></button></header>
      <div className="filter-sheet-content">
        <div className="filter-field"><span id="activity-filter-label">{category==="games"||category==="boardgames"?"Во что играем":"Чем займёмся"}</span>
          <details className="activity-picker"><summary aria-labelledby="activity-filter-label activity-filter-value"><span id="activity-filter-value">{draft.sport==="Все"?"Любое занятие":draft.sport}</span><Icon name="chevron-down" size={18}/></summary>
            <label className="activity-search"><span className="filter-visually-hidden">Поиск занятия</span><input type="search" value={query} placeholder="Найти занятие" onChange={event=>setQuery(event.target.value)}/></label>
            <fieldset className="activity-options"><legend className="filter-visually-hidden">Занятия</legend>
              <label><input type="radio" name="activity" checked={draft.sport==="Все"} onChange={()=>set({sport:"Все"})}/><span>Любое занятие</span></label>
              {choices.map(item=><label key={item}><input type="radio" name="activity" checked={draft.sport===item} onChange={()=>set({sport:item})}/><span>{item}</span></label>)}
              {!choices.length&&<p>Ничего не найдено. Попробуй другое название.</p>}
            </fieldset>
          </details>
        </div>
        <label className="filter-field">Место<input value={draft.place} placeholder="Метро, район или площадка" onChange={event=>set({place:event.target.value})}/></label>
        {category!=="sport"&&<fieldset className="filter-format"><legend>Формат</legend><div>{[["all","Любой"],["offline","Очно"],["online","Онлайн"]].map(([key,label])=><label key={key}><input type="radio" name="format" checked={draft.format===key} onChange={()=>set({format:key})}/><span>{label}</span></label>)}</div></fieldset>}
        <div className="filter-toggles">{([["friends","Только встречи друзей"],["free","Есть места"],["favorites","Избранные встречи"]] as const).map(([key,label])=><label key={key}><span>{label}</span><input type="checkbox" checked={draft[key]} onChange={event=>set({[key]:event.target.checked})}/></label>)}</div>
      </div>
      <footer className="filter-sheet-footer"><button type="button" className="secondary" onClick={()=>{setDraft({...empty});setQuery("");}}>Сбросить</button><button type="submit" className="primary">Показать встречи</button></footer>
    </form>
  </dialog>;
}

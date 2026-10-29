import { useEffect, useState } from "react";
import { api } from "./api";
import { LoadError } from "./Feedback";
import type { ProfileDetails } from "./socialTypes";

export function MyReviews({userId}:{userId:string}) {
  const [data,setData]=useState<ProfileDetails|null>(null);
  const [error,setError]=useState(false),[message,setMessage]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  async function load(){setError(false);try{setData(await api<ProfileDetails>(`/api/profiles/${encodeURIComponent(userId)}`,{},userId));}catch{setError(true);}}
  useEffect(()=>{setData(null);void load();},[userId]);
  return <section className="profile-section my-reviews"><h2>Отзывы обо мне</h2>
    {error?<LoadError onRetry={()=>void load()}/>:!data?<p role="status">Загружаем отзывы…</p>:<>
      <p className="review-summary">{data.user.rating===undefined?"Пока без оценки":`★ ${data.user.rating.toFixed(1)} · Отзывов: ${data.user.reviewsCount??0}`}</p>
      {!data.reviews.length&&<p className="history-note">Здесь появятся отзывы людей, с которыми ты встретился на сходках.</p>}
      {data.reviews.map(review=><article className="public-review" key={review.id}>
        <strong>★ {review.score} · {review.author?.name??"Участник"}</strong>
        <small>{new Date(review.createdAt).toLocaleDateString("ru-RU")}{review.activityTitle?` · ${review.activityTitle}`:""}</small>
        {review.text&&<p>{review.text}</p>}
        <button className="text-button" disabled={busy!==null} onClick={async()=>{
          const reason=window.prompt("Почему нужно проверить этот отзыв? (до 500 символов)");if(!reason?.trim())return;
          setBusy(review.id);setMessage("");try{await api(`/api/reviews/${encodeURIComponent(review.id)}/report`,{method:"POST",body:JSON.stringify({reason})},userId);setMessage("Жалоба отправлена модераторам");}catch(e){setMessage(e instanceof Error?e.message:"Не удалось отправить жалобу");}finally{setBusy(null);}
        }}>{busy===review.id?"Отправляем…":"Пожаловаться"}</button>
      </article>)}
    </>}{message&&<p role="status" className="account-feedback">{message}</p>}
  </section>;
}

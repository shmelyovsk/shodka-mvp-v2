import { useEffect, useState } from "react";
import { api } from "./api";
import { LoadError } from "./Feedback";
import type { ProfileDetails } from "./socialTypes";

const reviewCount=(n:number)=>`${n} ${n%100>=11&&n%100<=14?"отзывов":n%10===1?"отзыв":n%10>=2&&n%10<=4?"отзыва":"отзывов"}`;

export function MyReviews({userId}:{userId:string}) {
  const [data,setData]=useState<ProfileDetails|null>(null);
  const [error,setError]=useState(false),[message,setMessage]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  async function load(){setError(false);try{setData(await api<ProfileDetails>(`/api/profiles/${encodeURIComponent(userId)}`,{},userId));}catch{setError(true);}}
  useEffect(()=>{setData(null);void load();},[userId]);
  return <section className="profile-section my-reviews"><h2>Отзывы обо мне</h2>
    {error?<LoadError onRetry={()=>void load()}/>:!data?<p role="status">Загружаем отзывы…</p>:<>
      <p className="review-summary">{data.user.rating===undefined?"Пока без оценки":`★ ${data.user.rating.toLocaleString("ru-RU",{minimumFractionDigits:1,maximumFractionDigits:1})} · ${reviewCount(data.user.reviewsCount??0)}`}</p>
      {!data.reviews.length&&<p className="history-note">Здесь появятся отзывы людей, с которыми ты встретился на сходках.</p>}
      {data.reviews.map(review=><article className="public-review" key={review.id}>
        <div className="review-heading"><strong>{review.author?.name??"Участник"}</strong><span aria-label={`Оценка ${review.score} из 5`}>★ {review.score}</span></div>
        <div className="review-meta"><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("ru-RU")}</time>{review.activityTitle&&<span>{review.activityTitle}</span>}</div>
        {review.text&&<p>{review.text}</p>}
        <button className="text-button" disabled={busy!==null} onClick={async()=>{
          const reason=window.prompt("Почему нужно проверить этот отзыв? (до 500 символов)");if(!reason?.trim())return;
          setBusy(review.id);setMessage("");try{await api(`/api/reviews/${encodeURIComponent(review.id)}/report`,{method:"POST",body:JSON.stringify({reason})},userId);setMessage("Жалоба отправлена модераторам");}catch(e){setMessage(e instanceof Error?e.message:"Не удалось отправить жалобу");}finally{setBusy(null);}
        }}>{busy===review.id?"Отправляем…":"Пожаловаться"}</button>
      </article>)}
    </>}{message&&<p role="status" className="account-feedback">{message}</p>}
  </section>;
}

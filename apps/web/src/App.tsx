import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, DEFAULT_USER_ID, type Profile } from "./api";
import { SupportView } from "./SupportView";
import { ModerationView } from "./ModerationView";
import { FriendsView } from "./FriendsView";
import { PublicProfileModal } from "./PublicProfileModal";
import { AUDIENCE_LABELS } from "./options";
import { StartupScreen } from "./StartupScreen";
import { CreateMeetup } from "./CreateMeetup";
import { AfterMeetings } from "./AfterMeetings";
import { Icon } from "./Icon";
import { EmptyState, LoadingCards, LoadError } from "./Feedback";
import { missingProfileFields } from "./profileCompletion";
import { ProfileView } from "./ProfileView";
import { NavIcon } from "./NavIcon";
import { activityPhase, inHistoryTab } from "./history";
import type { Activity, OrganizerApplication } from "./types";

type Tab = "catalog" | "create" | "mine" | "profile" | "friends" | "moderation" | "support" | "favorites";
type DateFilter = "all" | "today" | "tomorrow" | "week";

const FavoriteActions = createContext<{ids:Set<string>;toggle:(id:string)=>void}>({ids:new Set(),toggle:()=>{}});
const terminal=(a:Activity)=>["cancelled","completed","not_held"].includes(a.status);
const moscowDay=(date:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
const outcomeLabel=(a:Activity)=>a.status==="completed"?"Состоялась":a.status==="not_held"?"Не состоялась":a.status==="cancelled"?"Отменена":activityPhase(a)==="past"?"Итог не указан":activityPhase(a)==="started"?"Уже началась":"";
const ProfileOpener = createContext<(id: string) => void>(() => {});
const levelNames = { beginner: "Новичков", any: "Участников любого уровня", intermediate: "Участников с опытом" };
const applicationStatusNames = {
  pending: "Ожидает подтверждения",
  approved: "Вы участвуете",
  rejected: "Заявка отклонена",
  withdrawn: "Вы отменили участие",
};
const dateFilterNames: Record<DateFilter, string> = {
  all: "Все даты",
  today: "Сегодня",
  tomorrow: "Завтра",
  week: "7 дней",
};

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function matchesDateFilter(value: string, filter: DateFilter) {
  if (filter === "all") return true;
  const day=moscowDay(new Date(value)),today=moscowDay(new Date()),tomorrow=moscowDay(new Date(Date.now()+86400000)),end=moscowDay(new Date(Date.now()+7*86400000));
  return filter==="today"?day===today:filter==="tomorrow"?day===tomorrow:day>=today&&day<end;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function reminderLabel(value: string) {
  const activityDate = new Date(value);
  const today = startOfDay(new Date());
  const activityDay = startOfDay(activityDate);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const days = Math.round((activityDay.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return `Сегодня в ${formatTime(value)}`;
  if (days === 1) return `Завтра в ${formatTime(value)}`;
  return `Через ${days} дн. · ${formatDate(value)}`;
}


function PersonAvatar({ name, avatarUrl, size = "small" }: { name: string; avatarUrl?: string; size?: "small" | "large" }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  if (avatarUrl && failedUrl !== avatarUrl) return <img onError={() => setFailedUrl(avatarUrl)} className={`person-avatar ${size}`} src={avatarUrl} alt={`Аватар: ${name}`} />;
  return <span className={`person-avatar fallback ${size}`}>{name.slice(0, 1)}</span>;
}

function RatingBadge({ rating, reviewsCount }: { rating?: number; reviewsCount?: number }) {
  if (rating === undefined) return <span className="rating-badge new-user">Новый участник</span>;
  return <span className="rating-badge">★ {rating.toFixed(1)} · {reviewsCount ?? 0} отзывов</span>;
}

function ParticipantList({ participants }: { participants?: Activity["participants"] }) {
  const openProfile = useContext(ProfileOpener);
  if (!participants?.length) return null;
  const visibleParticipants = participants.slice(0, 4);
  return (
    <div className="participants-block">
      <span className="participants-label">Участники</span>
      <div className="participant-list">
        {visibleParticipants.map((participant) => (
          <button type="button" className="participant-chip" onClick={event=>{event.stopPropagation();openProfile(participant.id);}} key={participant.id} title={`${participant.name}, ${participant.age} лет`}>
            <PersonAvatar name={participant.name} avatarUrl={participant.avatarUrl} />
            <span><strong>{participant.name}</strong><small>{participant.age} лет</small></span>
          </button>
        ))}
        {participants.length > visibleParticipants.length && (
          <span className="participant-more">+{participants.length - visibleParticipants.length}</span>
        )}
      </div>
    </div>
  );
}

function placesLabel(count:number){const n=count%100,last=count%10;return count+" "+(n>=11&&n<=14?"мест":last===1?"место":last>=2&&last<=4?"места":"мест");}
function scheduleDay(value:string){const day=moscowDay(new Date(value)),today=moscowDay(new Date()),tomorrow=moscowDay(new Date(Date.now()+86400000));return day===today?"Сегодня":day===tomorrow?"Завтра":new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short",timeZone:"Europe/Moscow"}).format(new Date(value));}
function ActivityCard({activity,onOpen}:{activity:Activity;onOpen:()=>void}){
 const openProfile=useContext(ProfileOpener),favorites=useContext(FavoriteActions),free=activity.capacity-activity.approvedCount;
 return <article className={"schedule-event "+(activity.category==="games"?"gaming ":"")+(terminal(activity)?"quiet":"")}>
 <div className="time-column"><time dateTime={activity.date}>{formatTime(activity.date)}</time><span>{scheduleDay(activity.date)}</span></div>
 <div className="event-body"><div className="event-top"><span className="event-sport">{activity.sport}</span><button type="button" className="bookmark-button" aria-label={favorites.ids.has(activity.id)?"Убрать из избранного":"В избранное"} aria-pressed={favorites.ids.has(activity.id)} onClick={()=>favorites.toggle(activity.id)}><Icon name="bookmark" size={19}/></button></div>
 {activity.audienceGender&&activity.audienceGender!=="any"&&<span className="audience-label">{AUDIENCE_LABELS[activity.audienceGender]}</span>}
 <h3><button className="card-title-button" onClick={onOpen}>{activity.title}</button></h3>
 <p className="event-place">{activity.format==="online"?"Онлайн, из дома":activity.publicPlace+" · "+activity.district}</p>
 <p className="event-level">{levelNames[activity.level]} · {activity.ageGroup}{activity.minAge!==undefined&&activity.maxAge!==undefined?" лет":""}</p>
 {activity.organizer&&<button className="event-host profile-inline" onClick={()=>openProfile(activity.organizer!.id)}>Собирает {activity.organizer.name}</button>}
 <div className="event-bottom"><div className="event-attendance"><div className="avatar-stack">{(activity.participants?.length?activity.participants.slice(0,3):activity.organizer?[activity.organizer]:[]).map(person=><button type="button" key={person.id} onClick={()=>openProfile(person.id)} title={person.name}><PersonAvatar name={person.name} avatarUrl={person.avatarUrl}/></button>)}</div><span>{outcomeLabel(activity)||(free>0?"Ещё "+placesLabel(free):"Набор закрыт")}<small>{activity.price?activity.price+" ₽ с человека":"Бесплатно"}</small></span></div><button className="event-open" onClick={onOpen} aria-label={"Открыть: "+activity.title}><Icon name="arrow-up-right" size={20}/></button></div>
 {activity.relation&&<span className="relation-status">{activity.relation==="organizer"?"Ты организатор":applicationStatusNames[activity.applicationStatus??"pending"]}</span>}
 </div></article>;
}

function App() {
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [requestsOpen,setRequestsOpen]=useState(false);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [pendingIntent,setPendingIntent]=useState<{kind:"create"}|{kind:"join";id:string}|null>(()=>{try{const raw=JSON.parse(sessionStorage.getItem("shodka-profile-intent")||"null");return raw?.kind==="create"?{kind:"create"}:raw?.kind==="join"&&typeof raw.id==="string"?{kind:"join",id:raw.id}:null;}catch{return null;}});
  const [catalogError,setCatalogError]=useState(false);
  const [mineLoading,setMineLoading]=useState(true),[mineError,setMineError]=useState(false);
  const [favoritesLoading,setFavoritesLoading]=useState(true),[favoritesError,setFavoritesError]=useState(false);
  const [requestsLoading,setRequestsLoading]=useState(true),[requestsError,setRequestsError]=useState(false);
  const [favorites,setFavorites]=useState<Activity[]>([]);
  const [favoriteBusy,setFavoriteBusy]=useState(false);
  const [formatFilter,setFormatFilter]=useState("all");
  const [freeOnly,setFreeOnly]=useState(false);
  const [favoritesOnly,setFavoritesOnly]=useState(false);
  const [shareUrl,setShareUrl]=useState("");
  const [actionBusy,setActionBusy]=useState(false);
  const [joinGuidance,setJoinGuidance]=useState(false),[hintSeenUser,setHintSeenUser]=useState("");
  const [reviewActivityId,setReviewActivityId]=useState<string>();
  const [feedbackRevision,setFeedbackRevision]=useState(0);
  const [requestBusy,setRequestBusy]=useState(false);
  const [moderator,setModerator]=useState(false);
  const [viewedUser, setViewedUser] = useState<string | null>(null);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [demo, setDemo] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(DEFAULT_USER_ID);
  const [clock, setClock] = useState(Date.now());
  const [tab, setTab] = useState<Tab>("catalog");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [mine, setMine] = useState<Activity[]>([]);
  const [applications, setApplications] = useState<OrganizerApplication[]>([]);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [sport, setSport] = useState("Все");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [place, setPlace] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [tab]);

  useEffect(() => {
    api<{ user: Profile; demo: boolean; moderator:boolean }>("/api/me").then(result => {
      setModerator(result.moderator); setProfile(result.user); setCurrentUserId(result.user.id); setDemo(result.demo);
    }).catch(error => setAuthError(error.message)).finally(() => setAuthReady(true));
  }, []);
  async function saveProfile(patch: Record<string, unknown>) {
    const result = await api<{ user: Profile }>("/api/me", { method: "PATCH", body: JSON.stringify(patch) }, currentUserId);
    for(const key of ["nickname","gender"] as const) {
      if(typeof patch[key]==="string") {
        const expected=(patch[key] as string).trim().replace(/^@/,"").toLowerCase();
        if((result.user[key]??"").toLowerCase()!==expected)throw new Error("Сервер не сохранил новые поля. Проверьте обновление сервера и попробуйте снова");
      }
    }
    setProfile(result.user); setAuthError("");
    await loadActivities(false);
    if(pendingIntent&&!missingProfileFields(result.user).length){
      const intent=pendingIntent;setPendingIntent(null);try{sessionStorage.removeItem("shodka-profile-intent");}catch{}setMessage("Профиль заполнен. Можно продолжить.");
      if(intent.kind==="create")setTab("create");else {setTab("catalog");await openActivity(intent.id);}
    }
  }
  useEffect(()=>{
    if(!authReady||!profile||!pendingIntent)return;
    if(missingProfileFields(profile).length){setTab("profile");setMessage("Осталось заполнить: "+missingProfileFields(profile).join(", "));}
    else {const intent=pendingIntent;setPendingIntent(null);try{sessionStorage.removeItem("shodka-profile-intent");}catch{}if(intent.kind==="create")setTab("create");else {setTab("catalog");void openActivity(intent.id);}}
  },[authReady,currentUserId]);
  function requireProfile(intent:{kind:"create"}|{kind:"join";id:string}) {
    const missing=missingProfileFields(profile);if(!missing.length)return true;
    setPendingIntent(intent);try{sessionStorage.setItem("shodka-profile-intent",JSON.stringify(intent));}catch{}
    setSelected(null);setTab("profile");setMessage("Осталось заполнить: "+missing.join(", "));return false;
  }
  function navigate(next: Tab) {
    if (next === "create" && !requireProfile({kind:"create"})) return;
    setTab(next); setSelected(null); setViewedUser(null); setMessage("");
  }

  async function loadActivities(showLoading = true) {
    if (showLoading) setLoading(true);setCatalogError(false);
    try {
      const data = await api<Activity[]>(`/api/activities${friendsOnly?"?friends=true":""}`,{},currentUserId);
      setActivities(data);
    } catch (error) {
      setCatalogError(true);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function loadFavorites(){setFavoritesLoading(true);setFavoritesError(false);try{setFavorites(await api<Activity[]>("/api/favorites",{},currentUserId));}catch{setFavoritesError(true);}finally{setFavoritesLoading(false);}}
  useEffect(()=>{if(authReady&&profile)void loadFavorites().catch(e=>setMessage(e.message));},[authReady,currentUserId]);
  useEffect(()=>{if(authReady&&profile){const id=new URLSearchParams(window.location.search).get("activity");if(id&&/^[A-Za-z0-9_-]{1,64}$/.test(id))void openActivity(id);}},[authReady,currentUserId]);
  async function toggleFavorite(id:string){if(favoriteBusy)return;setFavoriteBusy(true);try{await api('/api/favorites/'+id,{method:favorites.some(a=>a.id===id)?"DELETE":"PUT"},currentUserId);await loadFavorites();}catch(e){setMessage(e instanceof Error?e.message:"Не удалось сохранить");}finally{setFavoriteBusy(false);}}
  async function finishActivity(outcome:"completed"|"not_held"){if(!selected||actionBusy||!window.confirm(outcome==="completed"?"Встреча состоялась? После завершения участники смогут оставить отзывы.":"Отметить, что встреча не состоялась? Отзывы будут недоступны."))return;setActionBusy(true);try{await api('/api/activities/'+selected.id+'/finish',{method:"POST",body:JSON.stringify({outcome})},currentUserId);setFeedbackRevision(v=>v+1);setSelected(null);setMessage(outcome==="completed"?"Сходка завершена. Отзывы доступны в профилях участников.":"Отмечено: сходка не состоялась");await Promise.all([loadMine(),loadActivities(false),loadFavorites()]);}catch(e){setMessage(e instanceof Error?e.message:"Не удалось завершить встречу");}finally{setActionBusy(false);}}
  async function leaveActivity(){if(!selected||actionBusy)return;const soon=Date.parse(selected.date)-Date.now()<3600000;if(!window.confirm(selected.applicationStatus==="pending"?"Отозвать заявку? Организатор получит уведомление.":soon?"Встреча начнётся менее чем через час. Точно отменить участие? Организатор получит уведомление.":"Отменить участие? Организатор получит уведомление, а ваше место освободится."))return;setActionBusy(true);try{await api('/api/activities/'+selected.id+'/leave',{method:"POST"},currentUserId);setSelected(null);setMessage("Участие отменено");await Promise.all([loadMine(),loadActivities(false)]);}catch(e){setMessage(e instanceof Error?e.message:"Не удалось отменить участие");}finally{setActionBusy(false);}}
  async function shareActivity(){if(!selected||actionBusy)return;setActionBusy(true);try{const {url}=await api<{url:string}>('/api/activities/'+selected.id+'/share',{},currentUserId);setShareUrl(url);if(navigator.share){try{await navigator.share({title:selected.title,url});}catch{/* The link remains available for manual copying. */}}else if(navigator.clipboard){await navigator.clipboard.writeText(url).catch(()=>{});}}catch(e){setMessage(e instanceof Error?e.message:"Не удалось получить ссылку");}finally{setActionBusy(false);}}
  async function loadMine(){setMineLoading(true);setMineError(false);try{setMine(await api<Activity[]>(`/api/users/${currentUserId}/activities`,{},currentUserId));}catch{setMineError(true);}finally{setMineLoading(false);}}
  async function loadApplications(){setRequestsLoading(true);setRequestsError(false);try{setApplications(await api<OrganizerApplication[]>(`/api/organizers/${currentUserId}/applications`,{},currentUserId));}catch{setRequestsError(true);}finally{setRequestsLoading(false);}}

  useEffect(() => {
    void loadActivities();
    const refreshTimer = window.setInterval(() => { setClock(Date.now()); void loadActivities(false); }, 60_000);
    return () => window.clearInterval(refreshTimer);
  }, [friendsOnly, currentUserId]);
  useEffect(() => { if (authReady && profile && (tab === "mine" || tab === "profile")) void loadMine().catch(error => setMessage(error.message)); }, [tab, currentUserId, authReady]);
  useEffect(() => { if (!authReady || !profile || tab !== "mine") return; const refresh=()=>void loadApplications().catch(error=>setMessage(error.message));refresh();const timer=window.setInterval(refresh,60000);return()=>window.clearInterval(timer); }, [tab, currentUserId, authReady]);

  const activeApplications=applications.filter(p=>p.status==="pending"&&p.activity&&!terminal(p.activity)&&!p.activity.moderationHidden&&Date.parse(p.activity.date)>clock);
  const hasCatalogFilters=sport!=="Все"||dateFilter!=="all"||Boolean(place.trim())||categoryFilter!=="all"||friendsOnly||formatFilter!=="all"||freeOnly||favoritesOnly;
  const sports = useMemo(() => ["Все", ...Array.from(new Set(activities.map((item) => item.sport)))], [activities]);
  const visible = activities.filter((item) => {
    const matchesSport = sport === "Все" || item.sport === sport;
    const placeQuery = place.trim().toLocaleLowerCase("ru");
    const matchesPlace = !placeQuery || `${item.district} ${item.publicPlace}`.toLocaleLowerCase("ru").includes(placeQuery);
    return (categoryFilter === "all" || (item.category??"sport") === categoryFilter) && !terminal(item) && moscowDay(new Date(item.date)) >= moscowDay(new Date(clock)) && (formatFilter==="all"||(item.format??"offline")===formatFilter) && (!freeOnly||(item.status==="open"&&item.capacity>item.approvedCount&&Date.parse(item.date)>clock)) && (!favoritesOnly||favorites.some(f=>f.id===item.id)) && matchesSport && matchesDateFilter(item.date, dateFilter) && matchesPlace;
  });
  const displayedMine = mine.filter(item => inHistoryTab(item, "upcoming", new Date(clock))).sort((a, b) => a.date.localeCompare(b.date));
  const historyMine=mine.filter(item=>!inHistoryTab(item,"upcoming",new Date(clock))).sort((a,b)=>b.date.localeCompare(a.date));
  function resetFilters(){setSport("Все");setDateFilter("all");setPlace("");setCategoryFilter("all");setFriendsOnly(false);setFormatFilter("all");setFreeOnly(false);setFavoritesOnly(false);}

  async function openActivity(id: string) {
    try {
      setShareUrl("");setJoinGuidance(false);
      setSelected(await api<Activity>(`/api/activities/${id}`, {}, currentUserId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка загрузки");
    }
  }

  async function joinActivity(understood=false) {
    if (!selected || actionBusy || !requireProfile({kind:"join",id:selected.id})) return;
    if(selected.audienceGender&&selected.audienceGender!=="any"){
      if(!profile?.gender||profile.gender==="unspecified"){const intent={kind:"join" as const,id:selected.id};setPendingIntent(intent);try{sessionStorage.setItem("shodka-profile-intent",JSON.stringify(intent));}catch{}setSelected(null);setTab("profile");setMessage("Укажи пол в профиле, чтобы подать заявку на эту встречу");return;}
      if(profile.gender!==selected.audienceGender){setMessage(AUDIENCE_LABELS[selected.audienceGender]);return;}
    }
    let seen=hintSeenUser===currentUserId;try{seen=seen||localStorage.getItem("shodka-first-application:"+currentUserId)==="1";}catch{}
    if(!seen&&!understood){setJoinGuidance(true);return;}
    if(understood){try{localStorage.setItem("shodka-first-application:"+currentUserId,"1");}catch{}setHintSeenUser(currentUserId);setJoinGuidance(false);}
    setActionBusy(true);
    try {
      await api(`/api/activities/${selected.id}/applications`, { method: "POST" }, currentUserId);
      setMessage("Заявка отправлена организатору");
      setSelected(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить заявку");
    } finally {setActionBusy(false);}
  }

  async function createActivity(payload:Record<string,string>){
    if(!requireProfile({kind:"create"}))return false;
    const localDate=new Date(payload.date);if(Number.isNaN(localDate.getTime())){setMessage("Укажи корректные дату и время");return false;}
    try{await api<Activity>("/api/activities",{method:"POST",body:JSON.stringify({...payload,date:localDate.toISOString()})},currentUserId);setMessage("Сходка опубликована");await loadActivities();setHistoryOpen(false);setTab("mine");return true;}
    catch(error){setMessage(error instanceof Error?error.message:"Не удалось создать сходку");return false;}
  }

  async function cancelActivity() {
    if (!selected || !window.confirm("Отменить эту сходку? Она исчезнет из активных списков.")) return;
    try {
      await api(`/api/activities/${selected.id}/cancel`, { method: "POST" }, currentUserId);
      setMessage("Сходка отменена");
      setSelected(null);
      await loadActivities();
      await loadMine();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отменить сходку");
    }
  }

  async function updateApplication(id: string, status: "approved" | "rejected") {
    if(requestBusy)return;setRequestBusy(true);
    try {
      await api(`/api/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }, currentUserId);
      setMessage(status === "approved" ? "Участник принят" : "Заявка отклонена");
      await loadApplications();
      await loadMine();
      await loadActivities(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить заявку");
    } finally {setRequestBusy(false);}
  }

  function switchDemoUser(userId: string) {
    setCurrentUserId(userId);
    setSelected(null);
    setMine([]);
    setApplications([]);
    setTab("catalog");
    setMessage(userId === "user-1" ? "Демо-профиль: Ира" : "Демо-профиль: Саша");
  }

  if (!authReady) return <StartupScreen/>;
  if (!profile) return <div className="app-shell welcome-shell"><section className="welcome-card"><span className="eyebrow">Москва · 16+</span><h1>Сходка</h1><p>{authError}</p><button className="primary" onClick={()=>window.location.reload()}>Повторить подключение</button><p>Откройте приложение из бота MAX или Telegram.</p><a href="https://t.me/skhodkaa_bot">Telegram</a> · <a href="https://max.ru/t221_hakaton_max_bot">MAX</a></section></div>;

  return (
    <ProfileOpener.Provider value={setViewedUser}><FavoriteActions.Provider value={{ids:new Set(favorites.map(a=>a.id)),toggle:id=>void toggleFavorite(id)}}>
    <div className="app-shell">
      <header className="site-header">
        <div className="compact-brand">{["profile","moderation","support"].includes(tab)&&<button className="back-button" aria-label="Вернуться к сходкам" onClick={()=>navigate("catalog")}><NavIcon kind="back"/></button>}<span className="wordmark">СХОДКА</span><span className="city-label">Москва · 16+</span></div>
        <button className="profile-button" aria-label="Открыть личный кабинет" aria-current={tab === "profile" ? "page" : undefined} onClick={() => navigate("profile")}>
          <PersonAvatar name={demo ? (currentUserId === "user-1" ? "Ира" : "Саша") : profile.name} avatarUrl={demo ? undefined : profile.avatarUrl} size="large" />
        </button>
      </header>

      {demo && <div className="demo-switcher" aria-label="Переключение демонстрационного профиля">
        <span>Демо-профиль</span>
        <button className={currentUserId === "user-1" ? "active" : ""} onClick={() => switchDemoUser("user-1")}>Ира</button>
        <button className={currentUserId === "user-2" ? "active" : ""} onClick={() => switchDemoUser("user-2")}>Саша</button>
      </div>}

      <main>
        <h1 className="tab-title">{{catalog:"Сходки",create:"Создать сходку",friends:"Друзья",mine:"Мои встречи",favorites:"Избранное",profile:"Мой профиль",moderation:"Модерация",support:"Обращения"}[tab]}</h1>
        {(profile.moderationWarning||profile.suspended)&&<div className="notice" role="alert">{profile.suspended?"Ваш аккаунт ограничен модерацией. Публикации и заявки недоступны.":profile.moderationWarning}</div>}
        {tab === "support" && moderator && <SupportView currentUserId={currentUserId}/>}
        {tab === "moderation" && moderator && <ModerationView currentUserId={currentUserId} onChanged={()=>void loadActivities(false)}/>}
        {(tab==="mine"||tab==="favorites")&&<div className="plans-heading"><span className="plans-caption">{tab==="favorites"?"Сохранённые встречи":"Твои планы и заявки"}</span><button className="saved-plans" aria-label={tab==="favorites"?"Вернуться к моим встречам":"Открыть избранное"} onClick={()=>navigate(tab==="favorites"?"mine":"favorites")}><Icon name={tab==="favorites"?"arrow-left":"bookmark"}/>{tab!=="favorites"&&favorites.length>0&&<span className="count-badge">{favorites.length}</span>}</button></div>}

        {message && <button className="notice" onClick={() => setMessage("")}>{message} ×</button>}
        {tab === "profile" && <ProfileView key={currentUserId+(pendingIntent?"-complete":"")} initialEditing={Boolean(pendingIntent)} profile={profile} organized={mine.filter(item => item.relation === "organizer").length} applications={mine.filter(item => item.relation === "participant").length} onSave={saveProfile} onHistory={() => { setHistoryOpen(true); navigate("mine"); }} moderator={moderator} onSupport={()=>navigate("support")} onModeration={()=>navigate("moderation")} />}

        {tab === "favorites" && <section><p className="history-note">Сохранение не подаёт заявку. Завершённые и отменённые встречи остаются здесь, пока вы их не уберёте.</p><div className="activity-list">{favoritesLoading?<LoadingCards/>:favoritesError?<LoadError onRetry={()=>void loadFavorites()}/>:favorites.map(a=><ActivityCard key={a.id} activity={a} onOpen={()=>void openActivity(a.id)}/>)}{!favoritesLoading&&!favoritesError&&!favorites.length&&<EmptyState title="Здесь будут твои находки" text="Сохраняй интересные сходки, чтобы вернуться к ним." action="Посмотреть сходки" onAction={()=>navigate("catalog")}/>}</div></section>}
        {tab === "friends" && <FriendsView key={viewedUser??"friends"} currentUserId={currentUserId} onProfile={setViewedUser}/>}

        {tab === "catalog" && (
          <>
            
            <div className="catalog-categories" role="group" aria-label="Категории">{([['all','Все'],['sport','Спорт'],['games','Компьютерные'],['boardgames','Настольные']] as const).map(([value,label])=><button key={value} className={categoryFilter===value?"chip active":"chip"} onClick={()=>{setCategoryFilter(value);setSport("Все");}}>{label}</button>)}</div>
            <div className="filter-group">
              <span className="filter-label">Когда</span>
              <div className="chips compact">
                {(Object.keys(dateFilterNames) as DateFilter[]).map((item) => (
                  <button className={dateFilter === item ? "chip active" : "chip"} onClick={() => setDateFilter(item)} key={item}>{dateFilterNames[item]}</button>
                ))}
              </div>
            </div>
            <details className="filter-drawer" open={filtersOpen} onToggle={event=>setFiltersOpen(event.currentTarget.open)}><summary><span><Icon name="sliders-horizontal" size={18}/>Настроить поиск</span><Icon name="chevron-down" size={17}/></summary><label className="friends-filter"><input type="checkbox" checked={friendsOnly} onChange={event=>setFriendsOnly(event.target.checked)}/> Организуют друзья</label>
            <div className="filter-group">
              <span className="filter-label">Занятие</span>
              <div className="chips compact">
                {sports.map((item) => <button className={sport === item ? "chip active" : "chip"} onClick={() => setSport(item)} key={item}>{item}</button>)}
              </div>
            </div>
            <label className="place-filter">
              <span className="filter-label">Где</span>
              <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Район, метро или место" />
            </label>
            <div className="catalog-extra-filters"><label>Формат<select value={formatFilter} onChange={e=>setFormatFilter(e.target.value)}><option value="all">Любой</option><option value="offline">Офлайн</option><option value="online">Онлайн</option></select></label><label className="friends-filter"><input type="checkbox" checked={freeOnly} onChange={e=>setFreeOnly(e.target.checked)}/>Есть свободные места</label><label className="friends-filter"><input type="checkbox" checked={favoritesOnly} onChange={e=>setFavoritesOnly(e.target.checked)}/>Только избранное</label><button className="text-button" onClick={()=>{setSport("Все");setDateFilter("all");setPlace("");setCategoryFilter("all");setFriendsOnly(false);setFormatFilter("all");setFreeOnly(false);setFavoritesOnly(false);}}>Сбросить фильтры</button></div>
            </details>
            <section className="section-heading"><h2>Ищут компанию</h2><span>{visible.length}</span></section>
            {loading ? <LoadingCards/> : catalogError?<LoadError onRetry={()=>void loadActivities()}/>: (
              <div className="activity-list">
                {visible.map((item) => <ActivityCard key={item.id} activity={item} onOpen={() => void openActivity(item.id)} />)}
                {!visible.length && <EmptyState title={hasCatalogFilters?"Пока не нашли компанию":"Здесь начинается компания"} text={hasCatalogFilters?"По этим условиям сходок пока нет. Попробуй другие даты или занятия.":"Сходок пока нет. Создай первую и позови других присоединиться."} action={hasCatalogFilters?"Сбросить фильтры":"Создать сходку"} onAction={hasCatalogFilters?resetFilters:()=>navigate("create")}/>}
              </div>
            )}
          </>
        )}

        {tab === "create" && <CreateMeetup onPublish={createActivity}/>}

        {tab === "mine" && <section>
          <AfterMeetings revision={feedbackRevision} currentUserId={currentUserId} onProfile={(id,activityId)=>{setReviewActivityId(activityId);setViewedUser(id);}}/>
          {(requestsLoading||requestsError||activeApplications.length>0)&&<details className="plans-requests" open={requestsOpen} onToggle={e=>setRequestsOpen(e.currentTarget.open)}><summary>{requestsLoading?"Проверяем заявки…":requestsError?"Не удалось проверить заявки":activeApplications.length?"Ждут твоего ответа":"Заявки ко мне"}{!requestsLoading&&!requestsError&&activeApplications.length>0&&<span className="count-badge">{activeApplications.length}</span>}<Icon name="chevron-down" size={18}/></summary>
          {requestsLoading?<LoadingCards/>:requestsError?<LoadError onRetry={()=>void loadApplications()}/>:activeApplications.length?<div className="compact-requests">{activeApplications.map(item=><article className="request-card" key={item.id}><button className="person-row" onClick={()=>setViewedUser(item.userId)}><PersonAvatar name={item.user?.name??"Участник"} avatarUrl={item.user?.avatarUrl}/><span><strong>{item.user?.name??"Участник"}</strong><small>Хочет на «{item.activity?.title}»</small></span></button><div className="request-actions"><button className="secondary" disabled={requestBusy} onClick={()=>void updateApplication(item.id,"rejected")}>Отклонить</button><button className="primary" disabled={requestBusy} onClick={()=>void updateApplication(item.id,"approved")}>Принять</button></div></article>)}</div>:<EmptyState title="Все заявки разобраны" text="Новые отклики на твои сходки появятся здесь. Принятые участники — в карточке встречи."/>}</details>}
          <div className="section-heading"><h2>Ближайшие планы</h2>{displayedMine.length>0&&<span className="count-badge">{displayedMine.length}</span>}</div>
          {mineLoading?<LoadingCards/>:mineError?<LoadError onRetry={()=>void loadMine()}/>:<div className="activity-list">{displayedMine.map(item=><ActivityCard key={item.id} activity={item} onOpen={()=>void openActivity(item.id)}/>)}{!displayedMine.length&&<EmptyState title="Пока нет планов" text="Найди компанию для первой встречи или собери свою." action="Найти сходку" onAction={()=>navigate("catalog")}/>}</div>}
          <details className="plans-history" open={historyOpen} onToggle={e=>setHistoryOpen(e.currentTarget.open)}><summary>История встреч{historyMine.length>0&&<span className="count-badge">{historyMine.length}</span>}<Icon name="chevron-down" size={18}/></summary><p className="history-note">Прошедшие, отменённые и несостоявшиеся встречи. Итог «Состоялась» указывает организатор.</p>{mineLoading?<LoadingCards/>:mineError?<LoadError onRetry={()=>void loadMine()}/>:historyMine.length?historyMine.map(item=><ActivityCard key={item.id} activity={item} onOpen={()=>void openActivity(item.id)}/>):<EmptyState title="История ещё впереди" text="После первых встреч здесь останутся твои общие планы и воспоминания."/>}</details>
        </section>}


      </main>

      <nav aria-label="Основная навигация">
        {(["catalog", "create", "friends", "mine"] as const).map(item => <button key={item} aria-current={tab === item || item==="mine" && tab==="favorites" ? "page" : undefined} className={tab === item || item==="mine" && tab==="favorites" ? "active" : ""} onClick={() => navigate(item)}><span className="nav-icon"><NavIcon kind={item} /></span>{{ catalog: "Сходки", create: "Создать", friends: "Друзья", mine: "Мои" }[item]}</button>)}
      </nav>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <article className="modal meetup-modal" role="dialog" aria-modal="true" aria-label={selected.title} onClick={(event) => event.stopPropagation()}>
            <button className="close" aria-label="Закрыть сходку" onClick={() => setSelected(null)}><Icon name="x"/></button>
            <section className="detail-hero"><div className="detail-date"><time dateTime={selected.date}>{scheduleDay(selected.date)}, {formatTime(selected.date)}</time><span>{new Date(selected.date).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"})}</span></div><span className="event-sport">{selected.sport}</span><h2>{selected.title}</h2><p className="detail-place"><Icon name="map-pin" size={18}/><span>{selected.format==="online"?"Онлайн, из дома":[selected.publicPlace,selected.district].filter(Boolean).join(" · ")}</span></p><span className="detail-level">{levelNames[selected.level]}</span>{selected.audienceGender&&selected.audienceGender!=="any"&&<span className="audience-label">{AUDIENCE_LABELS[selected.audienceGender]}</span>}</section>
            <p className="modal-lead">{selected.description}</p>
            {selected.organizer && (
              <button className="organizer-profile profile-inline" onClick={()=>setViewedUser(selected.organizerId)}>
                <PersonAvatar name={selected.organizer.name} avatarUrl={selected.organizer.avatarUrl} size="large" />
                <div><span>Организатор</span><strong>{selected.organizer.name}</strong><RatingBadge rating={selected.organizer.rating} reviewsCount={selected.organizer.reviewsCount} /></div>
              </button>
            )}
            <ParticipantList participants={selected.participants} />
            {selected.organizer?.bio && <p className="modal-lead">Об организаторе: {selected.organizer.bio}</p>}
            <p className="relation-status">{outcomeLabel(selected)}</p>
            <div className="meetup-tools"><button className="secondary" disabled={favoriteBusy} onClick={()=>void toggleFavorite(selected.id)}>{favorites.some(a=>a.id===selected.id)?"Убрать из избранного":"В избранное"}</button><button className="secondary" disabled={actionBusy} onClick={()=>void shareActivity()}>Поделиться</button></div>
            {shareUrl&&<label className="share-link">Ссылка на сходку<input readOnly value={shareUrl} onFocus={e=>e.target.select()}/><small>Скопируйте и отправьте другу. В боте он сможет открыть эту встречу.</small></label>}
            <dl>
              <div><dt>Когда</dt><dd>{formatDate(selected.date)}</dd></div>
              <div><dt>Формат</dt><dd>{selected.format==="online"?"Онлайн, из дома":selected.category==="games"?"Компьютерный клуб":"Личная встреча"}</dd></div>
              <div><dt>Где</dt><dd>{selected.format==="online"?"Онлайн":`${selected.publicPlace}, ${selected.district}`}</dd></div>
              {selected.gamePlatform&&<div><dt>Платформа</dt><dd>{selected.gamePlatform}</dd></div>}
              {selected.connectionLink&&<div><dt>Подключение</dt><dd><a href={selected.connectionLink} target="_blank" rel="noreferrer">Открыть ссылку ↗</a></dd></div>}
              {selected.exactAddress && (
                <div><dt>Точный адрес</dt><dd>{selected.exactAddress}</dd></div>
              )}
              <div><dt>Кого ждём</dt><dd>{levelNames[selected.level]}</dd></div>
              <div><dt>Возраст</dt><dd>{selected.ageGroup}</dd></div>
              {(!selected.category||selected.category==="sport")&&<div><dt>Инвентарь</dt><dd>{selected.equipment||"Не требуется"}</dd></div>}
              <div><dt>Стоимость</dt><dd>{selected.price ? `${selected.price} ₽ с человека` : "Бесплатно"}</dd></div>
            </dl>
            {selected.organizerId!==currentUserId&&<button className="secondary full contact-organizer" onClick={()=>setViewedUser(selected.organizerId)}>Профиль и контакт организатора</button>}
            {selected.organizerId === currentUserId && activityPhase(selected) === "upcoming" && (
              <button className="secondary danger full" onClick={() => void cancelActivity()}>Отменить сходку</button>
            )}
            {selected.organizerId===currentUserId&&!terminal(selected)&&Date.parse(selected.date)<=clock&&<div className="finish-actions"><p>Как прошла встреча?</p><button className="primary full" disabled={actionBusy} onClick={()=>void finishActivity("completed")}>Завершить: состоялась</button><button className="secondary full" disabled={actionBusy} onClick={()=>void finishActivity("not_held")}>Не состоялась</button></div>}
            {selected.organizerId!==currentUserId&&!terminal(selected)&&Date.parse(selected.date)>clock&&["approved","pending"].includes(selected.applicationStatus??"")&&<button className="secondary danger full" disabled={actionBusy} onClick={()=>void leaveActivity()}>{selected.applicationStatus==="pending"?"Отозвать заявку":"Отменить участие"}</button>}
            {selected.organizerId!==currentUserId&&<button className="text-button report-button" onClick={async()=>{const reason=window.prompt("Причина жалобы на сходку (до 500 символов)");if(!reason?.trim())return;try{await api("/api/reports",{method:"POST",body:JSON.stringify({kind:"activity",targetId:selected.id,reason})},currentUserId);setSelected(null);setMessage("Жалоба отправлена модераторам");}catch(error){setSelected(null);setMessage(error instanceof Error?error.message:"Не удалось отправить жалобу");}}}>Пожаловаться на сходку</button>}
            {joinGuidance&&<section className="meeting-feedback" role="status"><h3>Как работает заявка</h3><p>Организатор сначала рассмотрит твой отклик. После одобрения вы увидите контакты друг друга и сможете договориться о встрече.</p><button className="primary full" disabled={actionBusy} onClick={()=>void joinActivity(true)}>Понятно, подать заявку</button><button className="text-button" onClick={()=>setJoinGuidance(false)}>Пока не отправлять</button></section>}
            {!joinGuidance&&selected.organizerId !== currentUserId && <button className="primary full" disabled={actionBusy || selected.moderationHidden || selected.status !== "open" || new Date(selected.date).getTime() <= clock || ["pending","approved","rejected"].includes(selected.applicationStatus??"")} onClick={() => void joinActivity()}>{selected.applicationStatus==="approved"?"Вы участвуете":selected.applicationStatus==="pending"?"Заявка на рассмотрении":selected.applicationStatus==="rejected"?"Заявка отклонена":"Подать заявку"}</button>}
          </article>
        </div>
      )}
      {viewedUser&&<PublicProfileModal key={viewedUser} userId={viewedUser} currentUserId={currentUserId} reviewActivityId={reviewActivityId} onChanged={()=>{void loadMine();void loadApplications();void loadActivities(false);}} onClose={()=>{setViewedUser(null);setReviewActivityId(undefined);setFeedbackRevision(v=>v+1);}} onActivity={id=>{setViewedUser(null);void openActivity(id);}}/>}
    </div>
    </FavoriteActions.Provider></ProfileOpener.Provider>
  );
}

export default App;

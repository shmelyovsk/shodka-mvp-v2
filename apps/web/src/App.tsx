import { FormEvent, createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, DEFAULT_USER_ID, type Profile } from "./api";
import { SupportView } from "./SupportView";
import { ModerationView } from "./ModerationView";
import { FriendsView } from "./FriendsView";
import { PublicProfileModal } from "./PublicProfileModal";
import { SPORT_OPTIONS, GAME_OPTIONS } from "./options";
import { ProfileView } from "./ProfileView";
import { NavIcon } from "./NavIcon";
import { activityPhase, inHistoryTab, type HistoryTab } from "./history";
import type { Activity, OrganizerApplication } from "./types";

type Tab = "catalog" | "create" | "requests" | "mine" | "profile" | "friends" | "moderation" | "support" | "favorites";
type DateFilter = "all" | "today" | "tomorrow" | "week";

const FavoriteActions = createContext<{ids:Set<string>;toggle:(id:string)=>void}>({ids:new Set(),toggle:()=>{}});
const terminal=(a:Activity)=>["cancelled","completed","not_held"].includes(a.status);
const moscowDay=(date:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
const outcomeLabel=(a:Activity)=>a.status==="completed"?"Состоялась":a.status==="not_held"?"Не состоялась":a.status==="cancelled"?"Отменена":activityPhase(a)==="past"?"Итог не указан":activityPhase(a)==="started"?"Уже началась":"";
const ProfileOpener = createContext<(id: string) => void>(() => {});
const levelNames = { beginner: "Начинающий", any: "Любой", intermediate: "Средний" };
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

function minimumDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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

function ActivityCard({ activity, onOpen }: { activity: Activity; onOpen: () => void }) {
  const openProfile = useContext(ProfileOpener);
  const favorites=useContext(FavoriteActions);
  const free = activity.capacity - activity.approvedCount;
  return (
    <article className="activity-card" onClick={onOpen}>
      <div className="card-topline">
        <span className="sport-pill">{activity.sport}</span>
        <span className={free <= 2 ? "places hot" : "places"}>{activity.moderationHidden ? "Скрыта модерацией" : outcomeLabel(activity) || (free > 0 ? `${free} мест` : "Набор закрыт")}</span>
        <button type="button" className="bookmark-button" aria-label={favorites.ids.has(activity.id)?"Убрать из избранного":"В избранное"} aria-pressed={favorites.ids.has(activity.id)} onClick={event=>{event.stopPropagation();favorites.toggle(activity.id);}}><svg width="22" height="22" viewBox="0 0 24 24" fill={favorites.ids.has(activity.id)?"currentColor":"none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg></button>
      </div>
      <h3><button className="card-title-button" onClick={event=>{event.stopPropagation();onOpen();}}>{activity.title}</button></h3>
      <p className="meta">{formatDate(activity.date)}</p>
      <p className="meta">{activity.district} · {activity.publicPlace}</p>
      {activity.organizer && (
        <button className="organizer-inline profile-inline" onClick={event=>{event.stopPropagation();if(activity.organizer)openProfile(activity.organizer.id);}}>
          <PersonAvatar name={activity.organizer.name} avatarUrl={activity.organizer.avatarUrl} />
          <span>Организатор <strong>{activity.organizer.name}</strong><RatingBadge rating={activity.organizer.rating} reviewsCount={activity.organizer.reviewsCount} /></span>
        </button>
      )}
      <ParticipantList participants={activity.participants} />
      <div className="card-footer">
        <span>Уровень: {levelNames[activity.level].toLowerCase()}<br/>Возраст: {activity.ageGroup}{activity.minAge!==undefined&&activity.maxAge!==undefined?" лет":""}</span>
        <strong>{activity.price ? `${activity.price} ₽ с человека` : "Бесплатно"}</strong>
      </div>
      {activity.relation && (
        <span className={`relation-status ${activity.applicationStatus ?? "organizer"}`}>
          {activity.relation === "organizer"
            ? "Вы организатор"
            : applicationStatusNames[activity.applicationStatus ?? "pending"]}
        </span>
      )}
    </article>
  );
}

function App() {
  const [favorites,setFavorites]=useState<Activity[]>([]);
  const [favoriteBusy,setFavoriteBusy]=useState(false);
  const [formatFilter,setFormatFilter]=useState("all");
  const [freeOnly,setFreeOnly]=useState(false);
  const [favoritesOnly,setFavoritesOnly]=useState(false);
  const [shareUrl,setShareUrl]=useState("");
  const [actionBusy,setActionBusy]=useState(false);
  const [moderator,setModerator]=useState(false);
  const [viewedUser, setViewedUser] = useState<string | null>(null);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createCategory, setCreateCategory] = useState<"sport"|"games">("sport");
  const [createFormat, setCreateFormat] = useState<"offline"|"online">("offline");
  const [chosenActivity, setChosenActivity] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [demo, setDemo] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(DEFAULT_USER_ID);
  const [historyTab, setHistoryTab] = useState<HistoryTab>("upcoming");
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

  useEffect(() => {
    api<{ user: Profile; demo: boolean; moderator:boolean }>("/api/me").then(result => {
      setModerator(result.moderator); setProfile(result.user); setCurrentUserId(result.user.id); setDemo(result.demo);
    }).catch(error => setAuthError(error.message)).finally(() => setAuthReady(true));
  }, []);
  async function saveProfile(patch: Record<string, unknown>) {
    const result = await api<{ user: Profile }>("/api/me", { method: "PATCH", body: JSON.stringify(patch) }, currentUserId);
    for(const key of ["nickname"] as const) {
      if(typeof patch[key]==="string") {
        const expected=(patch[key] as string).trim().replace(/^@/,"").toLowerCase();
        if((result.user[key]??"").toLowerCase()!==expected)throw new Error("Сервер не сохранил новые поля. Проверьте обновление сервера и попробуйте снова");
      }
    }
    setProfile(result.user); setAuthError("");
    await loadActivities(false);
  }
  function requireAge() {
    if (profile && profile.age >= 16) return true;
    setSelected(null); setTab("profile");
    setMessage("Перед заявкой или созданием сходки укажите возраст в профиле");
    return false;
  }
  function navigate(next: Tab) {
    if (next === "create" && !requireAge()) return;
    setTab(next); setSelected(null); setViewedUser(null); setMessage("");
  }

  async function loadActivities(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const data = await api<Activity[]>(`/api/activities${friendsOnly?"?friends=true":""}`,{},currentUserId);
      setActivities(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function loadFavorites(){setFavorites(await api<Activity[]>("/api/favorites",{},currentUserId));}
  useEffect(()=>{if(authReady&&profile)void loadFavorites().catch(e=>setMessage(e.message));},[authReady,currentUserId]);
  useEffect(()=>{if(authReady&&profile){const id=new URLSearchParams(window.location.search).get("activity");if(id&&/^[A-Za-z0-9_-]{1,64}$/.test(id))void openActivity(id);}},[authReady,currentUserId]);
  async function toggleFavorite(id:string){if(favoriteBusy)return;setFavoriteBusy(true);try{await api('/api/favorites/'+id,{method:favorites.some(a=>a.id===id)?"DELETE":"PUT"},currentUserId);await loadFavorites();}catch(e){setMessage(e instanceof Error?e.message:"Не удалось сохранить");}finally{setFavoriteBusy(false);}}
  async function finishActivity(outcome:"completed"|"not_held"){if(!selected||actionBusy||!window.confirm(outcome==="completed"?"Встреча состоялась? После завершения участники смогут оставить отзывы.":"Отметить, что встреча не состоялась? Отзывы будут недоступны."))return;setActionBusy(true);try{await api('/api/activities/'+selected.id+'/finish',{method:"POST",body:JSON.stringify({outcome})},currentUserId);setSelected(null);setMessage(outcome==="completed"?"Сходка завершена. Отзывы доступны в профилях участников.":"Отмечено: сходка не состоялась");await Promise.all([loadMine(),loadActivities(false),loadFavorites()]);}catch(e){setMessage(e instanceof Error?e.message:"Не удалось завершить встречу");}finally{setActionBusy(false);}}
  async function leaveActivity(){if(!selected||actionBusy)return;const soon=Date.parse(selected.date)-Date.now()<3600000;if(!window.confirm(selected.applicationStatus==="pending"?"Отозвать заявку? Организатор получит уведомление.":soon?"Встреча начнётся менее чем через час. Точно отменить участие? Организатор получит уведомление.":"Отменить участие? Организатор получит уведомление, а ваше место освободится."))return;setActionBusy(true);try{await api('/api/activities/'+selected.id+'/leave',{method:"POST"},currentUserId);setSelected(null);setMessage("Участие отменено");await Promise.all([loadMine(),loadActivities(false)]);}catch(e){setMessage(e instanceof Error?e.message:"Не удалось отменить участие");}finally{setActionBusy(false);}}
  async function shareActivity(){if(!selected||actionBusy)return;setActionBusy(true);try{const {url}=await api<{url:string}>('/api/activities/'+selected.id+'/share',{},currentUserId);setShareUrl(url);if(navigator.share){try{await navigator.share({title:selected.title,url});}catch{/* The link remains available for manual copying. */}}else if(navigator.clipboard){await navigator.clipboard.writeText(url).catch(()=>{});}}catch(e){setMessage(e instanceof Error?e.message:"Не удалось получить ссылку");}finally{setActionBusy(false);}}
  async function loadMine() {
    const data = await api<Activity[]>(`/api/users/${currentUserId}/activities`, {}, currentUserId);
    setMine(data);
  }

  async function loadApplications() {
    const data = await api<OrganizerApplication[]>(`/api/organizers/${currentUserId}/applications`, {}, currentUserId);
    setApplications(data);
  }

  useEffect(() => {
    void loadActivities();
    const refreshTimer = window.setInterval(() => { setClock(Date.now()); void loadActivities(false); }, 60_000);
    return () => window.clearInterval(refreshTimer);
  }, [friendsOnly, currentUserId]);
  useEffect(() => { if (authReady && profile && (tab === "mine" || tab === "profile")) void loadMine().catch(error => setMessage(error.message)); }, [tab, currentUserId, authReady]);
  useEffect(() => { if (authReady && profile && (tab === "requests" || tab === "mine")) void loadApplications().catch(error => setMessage(error.message)); }, [tab, currentUserId]);

  const sports = useMemo(() => ["Все", ...Array.from(new Set(activities.map((item) => item.sport)))], [activities]);
  const visible = activities.filter((item) => {
    const matchesSport = sport === "Все" || item.sport === sport;
    const placeQuery = place.trim().toLocaleLowerCase("ru");
    const matchesPlace = !placeQuery || `${item.district} ${item.publicPlace}`.toLocaleLowerCase("ru").includes(placeQuery);
    return (categoryFilter === "all" || (item.category??"sport") === categoryFilter) && !terminal(item) && moscowDay(new Date(item.date)) >= moscowDay(new Date(clock)) && (formatFilter==="all"||(item.format??"offline")===formatFilter) && (!freeOnly||(item.status==="open"&&item.capacity>item.approvedCount&&Date.parse(item.date)>clock)) && (!favoritesOnly||favorites.some(f=>f.id===item.id)) && matchesSport && matchesDateFilter(item.date, dateFilter) && matchesPlace;
  });
  const displayedMine = mine.filter(item => inHistoryTab(item, historyTab, new Date(clock))).sort((a, b) => historyTab === "upcoming" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const reminders = mine
    .filter((item) => !terminal(item) && (item.relation === "organizer" || item.applicationStatus === "approved"))
    .filter((item) => {
      const remaining = new Date(item.date).getTime() - Date.now();
      return remaining >= 0 && remaining <= 7 * 86_400_000;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  async function openActivity(id: string) {
    try {
      setShareUrl("");
      setSelected(await api<Activity>(`/api/activities/${id}`, {}, currentUserId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка загрузки");
    }
  }

  async function joinActivity() {
    if (!selected || !requireAge()) return;
    try {
      await api(`/api/activities/${selected.id}/applications`, { method: "POST" }, currentUserId);
      setMessage("Заявка отправлена организатору");
      setSelected(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить заявку");
    }
  }

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireAge()) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    if (payload.sport === "Другое") payload.sport = String(payload.customSport??"").trim();
    delete payload.customSport;
    const localDate = new Date(String(payload.date));
    if (Number.isNaN(localDate.getTime())) {
      setMessage("Укажите корректную дату и время");
      return;
    }
    payload.date = localDate.toISOString();
    try {
      await api<Activity>("/api/activities", { method: "POST", body: JSON.stringify(payload) }, currentUserId);
      setMessage("Сходка опубликована");
      formElement.reset();
      await loadActivities();
      setTab("mine");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать сходку");
    }
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
    try {
      await api(`/api/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }, currentUserId);
      setMessage(status === "approved" ? "Участник принят" : "Заявка отклонена");
      await loadApplications();
      await loadActivities(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить заявку");
    }
  }

  function switchDemoUser(userId: string) {
    setCurrentUserId(userId);
    setSelected(null);
    setMine([]);
    setApplications([]);
    setTab("catalog");
    setMessage(userId === "user-1" ? "Демо-профиль: Ира" : "Демо-профиль: Саша");
  }

  if (!authReady) return <div className="app-shell welcome-shell"><p className="empty">Проверяем вход…</p></div>;
  if (!profile) return <div className="app-shell welcome-shell"><section className="welcome-card"><span className="eyebrow">Москва · 16+</span><h1>Сходка</h1><p>{authError}</p><button className="primary" onClick={()=>window.location.reload()}>Повторить подключение</button><p>Откройте приложение из бота MAX или Telegram.</p><a href="https://t.me/skhodkaa_bot">Telegram</a> · <a href="https://max.ru/t221_hakaton_max_bot">MAX</a></section></div>;

  return (
    <ProfileOpener.Provider value={setViewedUser}><FavoriteActions.Provider value={{ids:new Set(favorites.map(a=>a.id)),toggle:id=>void toggleFavorite(id)}}>
    <div className="app-shell">
      <header className="site-header">
        {(tab === "profile" || tab === "moderation" || tab === "support") ? <button className="back-button" onClick={() => navigate("catalog")}><NavIcon kind="back" />К сходкам</button> : <span className="city-label">Москва <span className="age-mark">· 16+</span></span>}
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
        {(profile.moderationWarning||profile.suspended)&&<div className="notice" role="alert">{profile.suspended?"Ваш аккаунт ограничен модерацией. Публикации и заявки недоступны.":profile.moderationWarning}</div>}
        {tab === "support" && moderator && <SupportView currentUserId={currentUserId}/>}
        {tab === "moderation" && moderator && <ModerationView currentUserId={currentUserId} onChanged={()=>void loadActivities(false)}/>}
        {(tab==="mine"||tab==="requests"||tab==="favorites")&&<div className="mine-sections"><button className={tab==="mine"?"active":""} onClick={()=>setTab("mine")}>Мои встречи</button><button className={tab==="requests"?"active":""} onClick={()=>setTab("requests")}>Заявки ко мне <span>{applications.filter(item=>item.status==="pending"&&item.activity&&!terminal(item.activity)&&new Date(item.activity?.date??0).getTime()>clock).length}</span></button><button className={tab==="favorites"?"active":""} onClick={()=>setTab("favorites")}>Избранное</button></div>}
        {message && <button className="notice" onClick={() => setMessage("")}>{message} ×</button>}
        {tab === "profile" && <ProfileView key={currentUserId} profile={profile} organized={mine.filter(item => item.relation === "organizer").length} applications={mine.filter(item => item.relation === "participant").length} onSave={saveProfile} onHistory={() => { setHistoryTab("past"); navigate("mine"); }} moderator={moderator} onSupport={()=>navigate("support")} onModeration={()=>navigate("moderation")} />}

        {tab === "favorites" && <section><h2>Избранное</h2><p className="history-note">Сохранение не подаёт заявку. Завершённые и отменённые встречи остаются здесь, пока вы их не уберёте.</p><div className="activity-list">{favorites.map(a=><ActivityCard key={a.id} activity={a} onOpen={()=>void openActivity(a.id)}/>)}{!favorites.length&&<p className="empty">Сохраняйте встречи значком закладки.</p>}</div></section>}
        {tab === "friends" && <FriendsView key={viewedUser??"friends"} currentUserId={currentUserId} onProfile={setViewedUser}/>}

        {tab === "catalog" && (
          <>
            <section className="hero">
              <img src="/shodka-court.webp" alt="Спортивная площадка «Сходка»" />
              <button className="primary hero-action" onClick={() => navigate("create")}>Создать сходку</button>
            </section>
            <div className="catalog-categories" role="group" aria-label="Категории">{([['all','Все'],['sport','Спорт'],['games','Компьютерные игры']] as const).map(([value,label])=><button key={value} className={categoryFilter===value?"chip active":"chip"} onClick={()=>{setCategoryFilter(value);setSport("Все");}}>{label}</button>)}</div>
            <label className="friends-filter"><input type="checkbox" checked={friendsOnly} onChange={event=>setFriendsOnly(event.target.checked)}/> Организуют друзья</label>
            <div className="filter-group">
              <span className="filter-label">Когда</span>
              <div className="chips compact">
                {(Object.keys(dateFilterNames) as DateFilter[]).map((item) => (
                  <button className={dateFilter === item ? "chip active" : "chip"} onClick={() => setDateFilter(item)} key={item}>{dateFilterNames[item]}</button>
                ))}
              </div>
            </div>
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
            <section className="section-heading"><h2>Ближайшие сходки</h2><span>{visible.length}</span></section>
            {loading ? <p className="empty">Загружаем активности…</p> : (
              <div className="activity-list">
                {visible.map((item) => <ActivityCard key={item.id} activity={item} onOpen={() => void openActivity(item.id)} />)}
                {!visible.length && <p className="empty">По выбранным фильтрам сходок пока нет.</p>}
              </div>
            )}
          </>
        )}

        {tab === "create" && (
          <section>
            <div className="section-heading"><h2>Новая сходка</h2></div>
            <form className="form" onSubmit={createActivity}>
              <label>Название<input required name="title" placeholder="Волейбол после пар" /></label>
              <label>Категория<select name="category" value={createCategory} onChange={event=>{setCreateCategory(event.target.value as "sport"|"games");setChosenActivity("");}}><option value="sport">Спорт</option><option value="games">Компьютерные игры</option></select></label>
              <label>Занятие<select required name="sport" value={chosenActivity} onChange={event=>setChosenActivity(event.target.value)}><option value="" disabled>Выберите</option>{(createCategory==="sport"?SPORT_OPTIONS:GAME_OPTIONS).map(item=><option key={item}>{item}</option>)}<option>Другое</option></select></label>
              {chosenActivity==="Другое"&&<label>Какое занятие?<input required name="customSport" maxLength={80} placeholder="Напишите название спорта или игры"/></label>}
              <label>Формат<select name="format" value={createFormat} onChange={event=>setCreateFormat(event.target.value as "offline"|"online")}><option value="offline">{createCategory==="games"?"Компьютерный клуб":"Личная встреча"}</option><option value="online">Онлайн, из дома</option></select></label>
              {createCategory==="games"&&<label>Платформа / сервер / уровень<input name="gamePlatform" maxLength={100} placeholder="Например, ПК · Steam · любой ранг"/></label>}
              <label>Дата и время<input required type="datetime-local" name="date" min={minimumDateTime()} /></label>
              <div className="form-row">{createFormat==="offline"&&<label>Район<input required name="district" placeholder="Сокол" /></label>}<label>Участников<input required type="number" min="2" max="30" name="capacity" defaultValue="4" /></label></div>
              {createFormat==="offline"&&<label>Публичное место<input required name="publicPlace" placeholder={createCategory==="games"?"Название компьютерного клуба":"Спортивный центр рядом с метро"} /></label>}
              {createFormat==="offline"?<label>Точный адрес<input name="exactAddress" placeholder="Увидят только подтверждённые участники" /></label>:<label>Ссылка подключения<input name="connectionLink" type="url" maxLength={2048} placeholder="https://… (необязательно)"/><span className="form-hint">Ссылку увидят только принятые участники. Без ссылки договоритесь через организатора.</span></label>}
              <div className="form-row"><label>Уровень<select name="level" defaultValue="any"><option value="beginner">Начинающий</option><option value="any">Любой</option><option value="intermediate">Средний</option></select></label><label>С человека, ₽<input type="number" min="0" name="price" defaultValue="0" /></label></div>
              <div className="form-row"><label>Возраст от<input type="number" min="16" max="100" name="minAge" placeholder="Необязательно" /></label><label>Возраст до<input type="number" min="16" max="100" name="maxAge" placeholder="Необязательно" /></label></div>
              <p className="form-hint">Если поля пустые, присоединиться сможет любой пользователь 16+.</p>
              {createCategory!=="games"&&<label>Инвентарь<input name="equipment" placeholder="Мяч уже есть" /></label>}
              <label>Описание<textarea name="description" rows={3} placeholder="Расскажите о формате встречи" /></label>
              <button className="primary full" type="submit">Опубликовать</button>
            </form>
          </section>
        )}

        {tab === "mine" && (
          <section>
            {historyTab === "upcoming" && !!reminders.length && (
              <div className="reminders">
                <div className="section-heading"><h2>Не забудьте</h2><span>{reminders.length}</span></div>
                {reminders.map((item) => (
                  <button className="reminder-card" key={item.id} onClick={() => void openActivity(item.id)}>
                    <span className="reminder-icon">⏰</span>
                    <span><strong>{reminderLabel(item.date)}</strong><small>{item.title} · {item.district}</small></span>
                  </button>
                ))}
              </div>
            )}
            <div className="section-heading"><h2>Мои сходки</h2><span>{displayedMine.length}</span></div>
            <div className="history-tabs" role="group" aria-label="История сходок">{(["upcoming", "past", "cancelled"] as HistoryTab[]).map(item => <button key={item} aria-pressed={historyTab === item} className={historyTab === item ? "active" : ""} onClick={() => setHistoryTab(item)}>{{ upcoming: "Предстоящие", past: "Прошедшие", cancelled: "Отменены / не состоялись" }[item]}</button>)}</div>
            {historyTab === "past" && <p className="history-note">«Состоялась» — отметка организатора. Если итог не указан, встреча попадает сюда после полуночи по Москве.</p>}
            <div className="activity-list">
              {displayedMine.map((item) => <ActivityCard key={item.id} activity={item} onOpen={() => void openActivity(item.id)} />)}
              {!displayedMine.length && <p className="empty">Здесь пока нет сходок. Найдём компанию для спорта?</p>}
            </div>
          </section>
        )}

        {tab === "requests" && (
          <section>
            <div className="section-heading"><h2>Заявки ко мне</h2><span>{applications.length}</span></div>
            <div className="request-list">
              {applications.map((application) => (
                <article className="request-card" key={application.id}>
                  <span className="sport-pill">{application.activity?.sport ?? "Спорт"}</span>
                  <button className="request-person profile-inline" onClick={()=>setViewedUser(application.userId)}>
                    <PersonAvatar name={application.user?.name ?? "Участник"} avatarUrl={application.user?.avatarUrl} size="large" />
                    <div><h3>{application.user?.name ?? "Участник"}</h3><RatingBadge rating={application.user?.rating} reviewsCount={application.user?.reviewsCount} /></div>
                  </button>
                  <p className="meta">Хочет присоединиться к «{application.activity?.title ?? "сходке"}»</p>
                  <p className="meta">Возраст: {application.user?.age !== undefined ? `${application.user.age} лет` : "не указан"}</p>
                  {application.status === "pending" && application.activity && !terminal(application.activity) && new Date(application.activity?.date ?? 0).getTime() > clock ? (
                    <div className="request-actions">
                      <button className="secondary danger" onClick={() => void updateApplication(application.id, "rejected")}>Отклонить</button>
                      <button className="primary" onClick={() => void updateApplication(application.id, "approved")}>Принять</button>
                    </div>
                  ) : (
                    <span className={`relation-status ${application.status}`}>
                      {application.status === "approved" ? "Участник принят" : application.status === "pending" ? "Встреча началась или завершена" : application.status === "withdrawn" ? "Участник отозвал заявку" : "Заявка отклонена"}
                    </span>
                  )}
                </article>
              ))}
              {!applications.length && <p className="empty">На ваши сходки пока нет заявок.</p>}
            </div>
          </section>
        )}
      </main>

      <nav aria-label="Основная навигация">
        {(["catalog", "create", "friends", "mine"] as const).map(item => <button key={item} aria-current={tab === item || item==="mine" && (tab==="requests"||tab==="favorites") ? "page" : undefined} className={tab === item || item==="mine" && (tab==="requests"||tab==="favorites") ? "active" : ""} onClick={() => navigate(item)}><span className="nav-icon"><NavIcon kind={item} /></span>{{ catalog: "Сходки", create: "Создать", friends: "Друзья", mine: "Мои" }[item]}</button>)}
      </nav>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <article className="modal" onClick={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)}>×</button>
            <span className="sport-pill">{selected.sport}</span>
            <h2>{selected.title}</h2>
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
              <div><dt>Уровень</dt><dd>{levelNames[selected.level]}</dd></div>
              <div><dt>Возраст</dt><dd>{selected.ageGroup}</dd></div>
              {selected.category!=="games"&&<div><dt>Инвентарь</dt><dd>{selected.equipment||"Не требуется"}</dd></div>}
              <div><dt>Стоимость</dt><dd>{selected.price ? `${selected.price} ₽ с человека` : "Бесплатно"}</dd></div>
            </dl>
            {selected.organizerId!==currentUserId&&<button className="secondary full contact-organizer" onClick={()=>setViewedUser(selected.organizerId)}>Профиль и контакт организатора</button>}
            {selected.organizerId === currentUserId && activityPhase(selected) === "upcoming" && (
              <button className="secondary danger full" onClick={() => void cancelActivity()}>Отменить сходку</button>
            )}
            {selected.organizerId===currentUserId&&!terminal(selected)&&Date.parse(selected.date)<=clock&&<div className="finish-actions"><p>Как прошла встреча?</p><button className="primary full" disabled={actionBusy} onClick={()=>void finishActivity("completed")}>Завершить: состоялась</button><button className="secondary full" disabled={actionBusy} onClick={()=>void finishActivity("not_held")}>Не состоялась</button></div>}
            {selected.organizerId!==currentUserId&&!terminal(selected)&&Date.parse(selected.date)>clock&&["approved","pending"].includes(selected.applicationStatus??"")&&<button className="secondary danger full" disabled={actionBusy} onClick={()=>void leaveActivity()}>{selected.applicationStatus==="pending"?"Отозвать заявку":"Отменить участие"}</button>}
            {selected.organizerId!==currentUserId&&<button className="text-button report-button" onClick={async()=>{const reason=window.prompt("Причина жалобы на сходку (до 500 символов)");if(!reason?.trim())return;try{await api("/api/reports",{method:"POST",body:JSON.stringify({kind:"activity",targetId:selected.id,reason})},currentUserId);setSelected(null);setMessage("Жалоба отправлена модераторам");}catch(error){setSelected(null);setMessage(error instanceof Error?error.message:"Не удалось отправить жалобу");}}}>Пожаловаться на сходку</button>}
            {selected.organizerId !== currentUserId && <button className="primary full" disabled={actionBusy || selected.moderationHidden || selected.status !== "open" || new Date(selected.date).getTime() <= clock || ["pending","approved","rejected"].includes(selected.applicationStatus??"")} onClick={() => void joinActivity()}>{selected.applicationStatus==="approved"?"Вы участвуете":selected.applicationStatus==="pending"?"Заявка на рассмотрении":selected.applicationStatus==="rejected"?"Заявка отклонена":"Подать заявку"}</button>}
          </article>
        </div>
      )}
      {viewedUser&&<PublicProfileModal key={viewedUser} userId={viewedUser} currentUserId={currentUserId} onClose={()=>setViewedUser(null)} onActivity={id=>{setViewedUser(null);void openActivity(id);}}/>}
    </div>
    </FavoriteActions.Provider></ProfileOpener.Provider>
  );
}

export default App;

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, DEFAULT_USER_ID, type Profile } from "./api";
import { ProfileView } from "./ProfileView";
import { NavIcon } from "./NavIcon";
import { activityPhase, inHistoryTab, type HistoryTab } from "./history";
import type { Activity, OrganizerApplication } from "./types";

type Tab = "catalog" | "create" | "requests" | "mine" | "profile";
type DateFilter = "all" | "today" | "tomorrow" | "week";

const levelNames = { beginner: "Начинающий", any: "Любой", intermediate: "Средний" };
const applicationStatusNames = {
  pending: "Ожидает подтверждения",
  approved: "Вы участвуете",
  rejected: "Заявка отклонена",
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
  const activityDate = startOfDay(new Date(value));
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  if (filter === "today") return activityDate.getTime() === today.getTime();
  if (filter === "tomorrow") return activityDate.getTime() === tomorrow.getTime();
  return activityDate >= today && activityDate < weekEnd;
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
  if (!participants?.length) return null;
  const visibleParticipants = participants.slice(0, 4);
  return (
    <div className="participants-block">
      <span className="participants-label">Участники</span>
      <div className="participant-list">
        {visibleParticipants.map((participant) => (
          <span className="participant-chip" key={participant.id} title={`${participant.name}, ${participant.age} лет`}>
            <PersonAvatar name={participant.name} avatarUrl={participant.avatarUrl} />
            <span><strong>{participant.name}</strong><small>{participant.age} лет</small></span>
          </span>
        ))}
        {participants.length > visibleParticipants.length && (
          <span className="participant-more">+{participants.length - visibleParticipants.length}</span>
        )}
      </div>
    </div>
  );
}

function ActivityCard({ activity, onOpen }: { activity: Activity; onOpen: () => void }) {
  const free = activity.capacity - activity.approvedCount;
  const phase = activityPhase(activity);
  return (
    <button className="activity-card" onClick={onOpen}>
      <div className="card-topline">
        <span className="sport-pill">{activity.sport}</span>
        <span className={free <= 2 ? "places hot" : "places"}>{phase === "cancelled" ? "Отменена" : phase === "past" ? "Время встречи прошло" : phase === "started" ? "Уже началась" : free > 0 ? `${free} мест` : "Набор закрыт"}</span>
      </div>
      <h3>{activity.title}</h3>
      <p className="meta">{formatDate(activity.date)}</p>
      <p className="meta">{activity.district} · {activity.publicPlace}</p>
      {activity.organizer && (
        <div className="organizer-inline">
          <PersonAvatar name={activity.organizer.name} avatarUrl={activity.organizer.avatarUrl} />
          <span>Организатор <strong>{activity.organizer.name}</strong><RatingBadge rating={activity.organizer.rating} reviewsCount={activity.organizer.reviewsCount} /></span>
        </div>
      )}
      <ParticipantList participants={activity.participants} />
      <div className="card-footer">
        <span>{levelNames[activity.level]} · {activity.ageGroup}</span>
        <strong>{activity.price ? `${activity.price} ₽ с человека` : "Бесплатно"}</strong>
      </div>
      {activity.relation && (
        <span className={`relation-status ${activity.applicationStatus ?? "organizer"}`}>
          {activity.relation === "organizer"
            ? "Вы организатор"
            : applicationStatusNames[activity.applicationStatus ?? "pending"]}
        </span>
      )}
    </button>
  );
}

function App() {
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
    api<{ user: Profile; demo: boolean }>("/api/me").then(result => {
      setProfile(result.user); setCurrentUserId(result.user.id); setDemo(result.demo);
    }).catch(error => setAuthError(error.message)).finally(() => setAuthReady(true));
  }, []);
  async function saveProfile(patch: Record<string, unknown>) {
    const result = await api<{ user: Profile }>("/api/me", { method: "PATCH", body: JSON.stringify(patch) }, currentUserId);
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
    setTab(next); setSelected(null); setMessage("");
  }

  async function loadActivities(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const data = await api<Activity[]>("/api/activities");
      setActivities(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

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
  }, []);
  useEffect(() => { if (authReady && profile && (tab === "mine" || tab === "profile")) void loadMine().catch(error => setMessage(error.message)); }, [tab, currentUserId, authReady]);
  useEffect(() => { if (authReady && profile && tab === "requests") void loadApplications().catch(error => setMessage(error.message)); }, [tab, currentUserId]);

  const sports = useMemo(() => ["Все", ...Array.from(new Set(activities.map((item) => item.sport)))], [activities]);
  const visible = activities.filter((item) => {
    const matchesSport = sport === "Все" || item.sport === sport;
    const placeQuery = place.trim().toLocaleLowerCase("ru");
    const matchesPlace = !placeQuery || `${item.district} ${item.publicPlace}`.toLocaleLowerCase("ru").includes(placeQuery);
    return new Date(item.date).getTime() > clock && matchesSport && matchesDateFilter(item.date, dateFilter) && matchesPlace;
  });
  const displayedMine = mine.filter(item => inHistoryTab(item, historyTab, new Date(clock))).sort((a, b) => historyTab === "upcoming" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const reminders = mine
    .filter((item) => item.status !== "cancelled" && (item.relation === "organizer" || item.applicationStatus === "approved"))
    .filter((item) => {
      const remaining = new Date(item.date).getTime() - Date.now();
      return remaining >= 0 && remaining <= 7 * 86_400_000;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  async function openActivity(id: string) {
    try {
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
  if (!profile) return <div className="app-shell welcome-shell"><section className="welcome-card"><span className="eyebrow">Москва · 16+</span><h1>Сходка</h1><p>{authError}</p><p>Откройте приложение из бота MAX или Telegram.</p><a href="https://t.me/skhodkaa_bot">Telegram</a> · <a href="https://max.ru/t221_hakaton_max_bot">MAX</a></section></div>;

  return (
    <div className="app-shell">
      <header className="site-header">
        {tab === "profile" ? <button className="back-button" onClick={() => navigate("catalog")}><NavIcon kind="back" />К сходкам</button> : <span className="city-label">Москва</span>}
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
        {message && <button className="notice" onClick={() => setMessage("")}>{message} ×</button>}
        {tab === "profile" && <ProfileView key={currentUserId} profile={profile} organized={mine.filter(item => item.relation === "organizer").length} applications={mine.filter(item => item.relation === "participant").length} onSave={saveProfile} onHistory={() => { setHistoryTab("past"); navigate("mine"); }} />}

        {tab === "catalog" && (
          <>
            <section className="hero">
              <img src="/shodka-court.webp" alt="Спортивная площадка «Сходка»" />
              <button className="primary hero-action" onClick={() => navigate("create")}>Создать сходку</button>
            </section>
            <div className="filter-group">
              <span className="filter-label">Когда</span>
              <div className="chips compact">
                {(Object.keys(dateFilterNames) as DateFilter[]).map((item) => (
                  <button className={dateFilter === item ? "chip active" : "chip"} onClick={() => setDateFilter(item)} key={item}>{dateFilterNames[item]}</button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">Вид спорта</span>
              <div className="chips compact">
                {sports.map((item) => <button className={sport === item ? "chip active" : "chip"} onClick={() => setSport(item)} key={item}>{item}</button>)}
              </div>
            </div>
            <label className="place-filter">
              <span className="filter-label">Где</span>
              <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Район, метро или место" />
            </label>
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
              <label>Вид спорта<select required name="sport" defaultValue=""><option value="" disabled>Выберите</option><option>Бег</option><option>Настольный теннис</option><option>Волейбол</option><option>Баскетбол</option><option>Футбол</option><option>Бадминтон</option><option>Велосипед</option></select></label>
              <label>Дата и время<input required type="datetime-local" name="date" min={minimumDateTime()} /></label>
              <div className="form-row"><label>Район<input required name="district" placeholder="Сокол" /></label><label>Участников<input required type="number" min="2" max="30" name="capacity" defaultValue="4" /></label></div>
              <label>Публичное место<input required name="publicPlace" placeholder="Спортивный центр рядом с метро" /></label>
              <label>Точный адрес<input name="exactAddress" placeholder="Увидят только подтверждённые участники" /></label>
              <div className="form-row"><label>Уровень<select name="level" defaultValue="any"><option value="beginner">Начинающий</option><option value="any">Любой</option><option value="intermediate">Средний</option></select></label><label>С человека, ₽<input type="number" min="0" name="price" defaultValue="0" /></label></div>
              <div className="form-row"><label>Возраст от<input type="number" min="16" max="100" name="minAge" placeholder="Необязательно" /></label><label>Возраст до<input type="number" min="16" max="100" name="maxAge" placeholder="Необязательно" /></label></div>
              <p className="form-hint">Если поля пустые, присоединиться сможет любой пользователь 16+.</p>
              <label>Инвентарь<input name="equipment" placeholder="Мяч уже есть" /></label>
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
            <div className="history-tabs" role="group" aria-label="История сходок">{(["upcoming", "past", "cancelled"] as HistoryTab[]).map(item => <button key={item} aria-pressed={historyTab === item} className={historyTab === item ? "active" : ""} onClick={() => setHistoryTab(item)}>{{ upcoming: "Предстоящие", past: "Прошедшие", cancelled: "Отменённые" }[item]}</button>)}</div>
            {historyTab === "past" && <p className="history-note">История встреч, а не подтверждение посещения. Начавшиеся сегодня остаются в «Предстоящих» до полуночи по Москве.</p>}
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
                  <div className="request-person">
                    <PersonAvatar name={application.user?.name ?? "Участник"} avatarUrl={application.user?.avatarUrl} size="large" />
                    <div><h3>{application.user?.name ?? "Участник"}</h3><RatingBadge rating={application.user?.rating} reviewsCount={application.user?.reviewsCount} /></div>
                  </div>
                  <p className="meta">Хочет присоединиться к «{application.activity?.title ?? "сходке"}»</p>
                  <p className="meta">Возраст: {application.user?.age !== undefined ? `${application.user.age} лет` : "не указан"}</p>
                  {application.status === "pending" && application.activity?.status !== "cancelled" && new Date(application.activity?.date ?? 0).getTime() > clock ? (
                    <div className="request-actions">
                      <button className="secondary danger" onClick={() => void updateApplication(application.id, "rejected")}>Отклонить</button>
                      <button className="primary" onClick={() => void updateApplication(application.id, "approved")}>Принять</button>
                    </div>
                  ) : (
                    <span className={`relation-status ${application.status}`}>
                      {application.status === "approved" ? "Участник принят" : application.status === "pending" ? "Встреча началась или отменена" : "Заявка отклонена"}
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
        {(["catalog", "create", "requests", "mine"] as const).map(item => <button key={item} aria-current={tab === item ? "page" : undefined} className={tab === item ? "active" : ""} onClick={() => navigate(item)}><span className="nav-icon"><NavIcon kind={item} /></span>{{ catalog: "Сходки", create: "Создать", requests: "Заявки", mine: "Мои" }[item]}</button>)}
      </nav>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <article className="modal" onClick={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)}>×</button>
            <span className="sport-pill">{selected.sport}</span>
            <h2>{selected.title}</h2>
            <p className="modal-lead">{selected.description}</p>
            {selected.organizer && (
              <div className="organizer-profile">
                <PersonAvatar name={selected.organizer.name} avatarUrl={selected.organizer.avatarUrl} size="large" />
                <div><span>Организатор</span><strong>{selected.organizer.name}</strong><RatingBadge rating={selected.organizer.rating} reviewsCount={selected.organizer.reviewsCount} /></div>
              </div>
            )}
            <ParticipantList participants={selected.participants} />
            {selected.organizer?.bio && <p className="modal-lead">Об организаторе: {selected.organizer.bio}</p>}
            <dl>
              <div><dt>Когда</dt><dd>{formatDate(selected.date)}</dd></div>
              <div><dt>Где</dt><dd>{selected.publicPlace}, {selected.district}</dd></div>
              {selected.exactAddress && (
                <div><dt>Точный адрес</dt><dd>{selected.exactAddress}</dd></div>
              )}
              <div><dt>Уровень</dt><dd>{levelNames[selected.level]}</dd></div>
              <div><dt>Возраст</dt><dd>{selected.ageGroup}</dd></div>
              <div><dt>Инвентарь</dt><dd>{selected.equipment}</dd></div>
              <div><dt>Стоимость</dt><dd>{selected.price ? `${selected.price} ₽ с человека` : "Бесплатно"}</dd></div>
            </dl>
            {selected.organizerId === currentUserId && activityPhase(selected) === "upcoming" && (
              <button className="secondary danger full" onClick={() => void cancelActivity()}>Отменить сходку</button>
            )}
            {selected.organizerId !== currentUserId && <button className="primary full" disabled={selected.status !== "open" || new Date(selected.date).getTime() <= clock} onClick={() => void joinActivity()}>Подать заявку</button>}
          </article>
        </div>
      )}
    </div>
  );
}

export default App;

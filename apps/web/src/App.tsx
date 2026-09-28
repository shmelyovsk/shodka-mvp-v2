import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, DEFAULT_USER_ID } from "./api";
import type { Activity, OrganizerApplication } from "./types";

type Tab = "catalog" | "create" | "requests" | "mine";

const levelNames = { beginner: "Начинающий", any: "Любой", intermediate: "Средний" };
const applicationStatusNames = {
  pending: "Ожидает подтверждения",
  approved: "Вы участвуете",
  rejected: "Заявка отклонена",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ActivityCard({ activity, onOpen }: { activity: Activity; onOpen: () => void }) {
  const free = activity.capacity - activity.approvedCount;
  return (
    <button className="activity-card" onClick={onOpen}>
      <div className="card-topline">
        <span className="sport-pill">{activity.sport}</span>
        <span className={free <= 2 ? "places hot" : "places"}>{free > 0 ? `${free} мест` : "Набор закрыт"}</span>
      </div>
      <h3>{activity.title}</h3>
      <p className="meta">{formatDate(activity.date)} · {activity.durationMinutes} мин</p>
      <p className="meta">{activity.district} · {activity.publicPlace}</p>
      <div className="card-footer">
        <span>{levelNames[activity.level]}</span>
        <strong>{activity.price ? `${activity.price} ₽` : "Бесплатно"}</strong>
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
  const [currentUserId, setCurrentUserId] = useState(DEFAULT_USER_ID);
  const [tab, setTab] = useState<Tab>("catalog");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [mine, setMine] = useState<Activity[]>([]);
  const [applications, setApplications] = useState<OrganizerApplication[]>([]);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [sport, setSport] = useState("Все");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadActivities() {
    setLoading(true);
    try {
      const data = await api<Activity[]>("/api/activities");
      setActivities(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
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

  useEffect(() => { void loadActivities(); }, []);
  useEffect(() => { if (tab === "mine") void loadMine(); }, [tab, currentUserId]);
  useEffect(() => { if (tab === "requests") void loadApplications(); }, [tab, currentUserId]);

  const sports = useMemo(() => ["Все", ...Array.from(new Set(activities.map((item) => item.sport)))], [activities]);
  const visible = sport === "Все" ? activities : activities.filter((item) => item.sport === sport);

  async function openActivity(id: string) {
    try {
      setSelected(await api<Activity>(`/api/activities/${id}`, {}, currentUserId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка загрузки");
    }
  }

  async function joinActivity() {
    if (!selected) return;
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
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

  async function updateApplication(id: string, status: "approved" | "rejected") {
    try {
      await api(`/api/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }, currentUserId);
      setMessage(status === "approved" ? "Участник принят" : "Заявка отклонена");
      await loadApplications();
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

  return (
    <div className="app-shell">
      <header>
        <div>
          <span className="eyebrow">Москва · 16+</span>
          <h1>Сходка</h1>
        </div>
        <div className="avatar">{currentUserId === "user-1" ? "И" : "С"}</div>
      </header>

      <div className="demo-switcher" aria-label="Переключение демонстрационного профиля">
        <span>Демо-профиль</span>
        <button className={currentUserId === "user-1" ? "active" : ""} onClick={() => switchDemoUser("user-1")}>Ира</button>
        <button className={currentUserId === "user-2" ? "active" : ""} onClick={() => switchDemoUser("user-2")}>Саша</button>
      </div>

      <main>
        {message && <button className="notice" onClick={() => setMessage("")}>{message} ×</button>}

        {tab === "catalog" && (
          <>
            <section className="hero">
              <p>Двигаться проще вместе</p>
              <h2>Найди компанию для спорта рядом</h2>
              <button className="primary" onClick={() => setTab("create")}>Создать сходку</button>
            </section>
            <div className="chips">
              {sports.map((item) => <button className={sport === item ? "chip active" : "chip"} onClick={() => setSport(item)} key={item}>{item}</button>)}
            </div>
            <section className="section-heading"><h2>Ближайшие сходки</h2><span>{visible.length}</span></section>
            {loading ? <p className="empty">Загружаем активности…</p> : (
              <div className="activity-list">
                {visible.map((item) => <ActivityCard key={item.id} activity={item} onOpen={() => void openActivity(item.id)} />)}
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
              <label>Дата и время<input required type="datetime-local" name="date" /></label>
              <div className="form-row"><label>Район<input required name="district" placeholder="Сокол" /></label><label>Участников<input required type="number" min="2" max="30" name="capacity" defaultValue="4" /></label></div>
              <label>Публичное место<input required name="publicPlace" placeholder="Спортивный центр рядом с метро" /></label>
              <label>Точный адрес<input name="exactAddress" placeholder="Увидят только подтверждённые участники" /></label>
              <div className="form-row"><label>Уровень<select name="level" defaultValue="any"><option value="beginner">Начинающий</option><option value="any">Любой</option><option value="intermediate">Средний</option></select></label><label>Стоимость, ₽<input type="number" min="0" name="price" defaultValue="0" /></label></div>
              <label>Инвентарь<input name="equipment" placeholder="Мяч уже есть" /></label>
              <label>Описание<textarea name="description" rows={3} placeholder="Расскажите о формате встречи" /></label>
              <button className="primary full" type="submit">Опубликовать</button>
            </form>
          </section>
        )}

        {tab === "mine" && (
          <section>
            <div className="section-heading"><h2>Мои сходки</h2><span>{mine.length}</span></div>
            <div className="activity-list">
              {mine.map((item) => <ActivityCard key={item.id} activity={item} onOpen={() => void openActivity(item.id)} />)}
              {!mine.length && <p className="empty">Вы ещё не создавали сходки и не подавали заявки.</p>}
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
                  <h3>{application.user?.name ?? "Участник"}</h3>
                  <p className="meta">Хочет присоединиться к «{application.activity?.title ?? "сходке"}»</p>
                  <p className="meta">Возрастная группа: {application.user?.ageGroup ?? "не указана"}</p>
                  {application.status === "pending" ? (
                    <div className="request-actions">
                      <button className="secondary danger" onClick={() => void updateApplication(application.id, "rejected")}>Отклонить</button>
                      <button className="primary" onClick={() => void updateApplication(application.id, "approved")}>Принять</button>
                    </div>
                  ) : (
                    <span className={`relation-status ${application.status}`}>
                      {application.status === "approved" ? "Участник принят" : "Заявка отклонена"}
                    </span>
                  )}
                </article>
              ))}
              {!applications.length && <p className="empty">На ваши сходки пока нет заявок.</p>}
            </div>
          </section>
        )}
      </main>

      <nav>
        <button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}><span>⌂</span>Сходки</button>
        <button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}><span>＋</span>Создать</button>
        <button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}><span>✓</span>Заявки</button>
        <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}><span>●</span>Мои</button>
      </nav>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <article className="modal" onClick={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)}>×</button>
            <span className="sport-pill">{selected.sport}</span>
            <h2>{selected.title}</h2>
            <p className="modal-lead">{selected.description}</p>
            <dl>
              <div><dt>Когда</dt><dd>{formatDate(selected.date)}, {selected.durationMinutes} мин</dd></div>
              <div><dt>Где</dt><dd>{selected.publicPlace}, {selected.district}</dd></div>
              {selected.exactAddress && (
                <div><dt>Точный адрес</dt><dd>{selected.exactAddress}</dd></div>
              )}
              <div><dt>Уровень</dt><dd>{levelNames[selected.level]}</dd></div>
              <div><dt>Возраст</dt><dd>{selected.ageGroup}</dd></div>
              <div><dt>Инвентарь</dt><dd>{selected.equipment}</dd></div>
              <div><dt>Стоимость</dt><dd>{selected.price ? `${selected.price} ₽` : "Бесплатно"}</dd></div>
            </dl>
            {selected.organizerId !== currentUserId && <button className="primary full" disabled={selected.status !== "open"} onClick={() => void joinActivity()}>Подать заявку</button>}
          </article>
        </div>
      )}
    </div>
  );
}

export default App;

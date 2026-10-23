import { useRef, useState, type FormEvent } from "react";
import type { Profile } from "./api";

export function ProfileView({ profile, organized, applications, onSave, onHistory }: {
  profile: Profile; organized: number; applications: number;
  onSave: (patch: Record<string, unknown>) => Promise<void>; onHistory: () => void;
}) {
  const [photo, setPhoto] = useState(profile.avatarUrl);
  const [photoAction, setPhotoAction] = useState<"custom" | "platform" | null>(null);
  const [busy, setBusy] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function selectPhoto(file?: File) {
    if (!file) return;
    setMessage(""); setReadingPhoto(true);
    const url = URL.createObjectURL(file);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Выберите JPG, PNG или WebP до 10 МБ");
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Не удалось обработать фото");
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
      setPhoto(canvas.toDataURL("image/jpeg", .82)); setPhotoAction("custom");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось загрузить фото"); }
    finally { URL.revokeObjectURL(url); setReadingPhoto(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const age = String(data.get("age") ?? "").trim();
    const patch: Record<string, unknown> = {
      name: data.get("name"), bio: data.get("bio"), district: data.get("district"),
      sports: data.getAll("sports"), level: data.get("level"), notificationsEnabled: data.get("notifications") === "on",
      ...(age ? { age: Number(age) } : {}),
      ...(photoAction === "custom" ? { avatarUrl: photo } : photoAction === "platform" ? { usePlatformAvatar: true } : {}),
    };
    setBusy(true); setMessage("");
    try { await onSave(patch); setMessage("Профиль сохранён"); setPhotoAction(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль"); }
    finally { setBusy(false); }
  }
  return <section className="account-page">
    <div className="account-heading"><span className="eyebrow">Это вы</span><h1>Мой профиль</h1><p>Знакомиться проще, когда немного знаешь друг о друге.</p></div>
    <form className="form account-form" onSubmit={submit}>
      <fieldset disabled={busy || readingPhoto} className="account-fields">
        <div className="account-photo-row">
          {photo ? <img className="account-photo" src={photo} alt="Ваше фото" /> : <span className="account-photo account-initial">{profile.name.slice(0, 1)}</span>}
          <div><button type="button" className="secondary" onClick={() => fileInput.current?.click()}>{readingPhoto ? "Обрабатываем…" : "Выбрать фото"}</button><p className="account-caption">JPG, PNG или WebP</p>
            {profile.platformAvatarUrl && <button type="button" className="text-button" onClick={() => { setPhoto(profile.platformAvatarUrl); setPhotoAction("platform"); }}>Фото из мессенджера</button>}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { void selectPhoto(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
        <label>Как вас зовут<input name="name" required maxLength={80} defaultValue={profile.name} autoComplete="given-name" /></label>
        <div className="form-row"><label>Возраст<input name="age" type="number" inputMode="numeric" min={16} max={100} placeholder="От 16 лет" defaultValue={profile.age || ""} /></label><label>Район или метро<input name="district" maxLength={100} placeholder="Например, Сокол" defaultValue={profile.district} /></label></div>
        <p className="form-hint">Возраст нужен перед первой заявкой или созданием сходки и виден другим участникам.</p>
        <label>О себе<textarea name="bio" rows={3} maxLength={500} placeholder="Что любите, как проводите время, какую компанию ищете" defaultValue={profile.bio} /></label>
        <fieldset className="sports-options"><legend>Любимые виды спорта</legend>{["Бег", "Настольный теннис", "Волейбол", "Баскетбол", "Футбол", "Бадминтон", "Велосипед"].map(sport => <label key={sport}><input type="checkbox" name="sports" value={sport} defaultChecked={profile.sports?.includes(sport)} /><span>{sport}</span></label>)}</fieldset>
        <label>Уровень подготовки<select name="level" defaultValue={profile.level ?? "any"}><option value="any">Играю ради удовольствия</option><option value="beginner">Начинаю знакомиться со спортом</option><option value="intermediate">Регулярно занимаюсь</option></select></label>
        <label className="notification-toggle"><input type="checkbox" name="notifications" defaultChecked={profile.notificationsEnabled !== false} /><span>Уведомления о заявках и изменениях встреч<small>Сообщения от бота в вашем мессенджере</small></span></label>
        <button className="primary full" type="submit">{busy ? "Сохраняем…" : "Сохранить профиль"}</button>
      </fieldset>
      {message && <p className="account-feedback" role="status">{message}</p>}
    </form>
    <section className="account-history"><h2>Ваша история</h2><div className="account-stats"><div><strong>{organized}</strong><span>Организовано</span></div><div><strong>{applications}</strong><span>Заявок на встречи</span></div></div><button className="secondary full" onClick={onHistory}>Посмотреть мои сходки</button><p className="account-caption">Заявка не подтверждает фактическое посещение встречи.</p></section>
    <details className="support-card"><summary>Поддержать СХОДКУ <span aria-hidden="true">♡</span></summary><p>«СХОДКА» бесплатна. Добровольная поддержка поможет нам оплачивать сервер и развивать проект.</p><p className="account-caption">Способ поддержки скоро появится здесь. Все основные возможности останутся бесплатными.</p></details>
  </section>;
}

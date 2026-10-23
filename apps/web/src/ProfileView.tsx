import { useEffect, useRef, useState, type FormEvent } from "react";
import { SPORT_OPTIONS, GAME_OPTIONS } from "./options";
import type { Profile } from "./api";

export function ProfileView({ profile, organized, applications, onSave, onHistory, moderator, onModeration }: {
  profile: Profile; organized: number; applications: number;
  onSave: (patch: Record<string, unknown>) => Promise<void>; onHistory: () => void; moderator:boolean; onModeration:()=>void;
}) {
  const [nickname,setNickname]=useState(profile.nickname??"");
  const [telegramContact,setTelegramContact]=useState(profile.telegramContact??"");
  useEffect(()=>{setNickname(profile.nickname??"");setTelegramContact(profile.telegramContact??"");},[profile.nickname,profile.telegramContact]);
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
      ...(String(data.get("nickname")??"").trim() ? {nickname:data.get("nickname")} : {}),
      telegramContact: data.get("telegramContact"), shareContact: data.get("shareContact") === "on",
      name: data.get("name"), bio: data.get("bio"), district: data.get("district"),
      sports: data.getAll("sports"), notificationsEnabled: data.get("notifications") === "on",
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
        <label>Ник СХОДКИ<input name="nickname" minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]{2,23}" placeholder="ira_sport" value={nickname} onChange={event=>setNickname(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false}/></label><p className="form-hint">Уникальный ник внутри приложения, не обязательно как в Telegram. 3–24 символа: латиница, цифры и _. По нему друзья смогут вас найти.</p>
        <div className="form-row"><label>Возраст<input name="age" type="number" inputMode="numeric" min={16} max={100} placeholder="От 16 лет" defaultValue={profile.age || ""} /></label><label>Район или метро<input name="district" maxLength={100} placeholder="Например, Сокол" defaultValue={profile.district} /></label></div>
        <p className="form-hint">Возраст нужен перед первой заявкой или созданием сходки и виден другим участникам.</p>
        <label>О себе<textarea name="bio" rows={3} maxLength={500} placeholder="Что любите, как проводите время, какую компанию ищете" defaultValue={profile.bio} /></label>
        <fieldset className="sports-options"><legend>Интересы: спорт и игры (до 12)</legend>{[...SPORT_OPTIONS, ...GAME_OPTIONS, ...(profile.sports??[]).filter(item=>![...SPORT_OPTIONS,...GAME_OPTIONS].includes(item))].map(sport => <label key={sport}><input type="checkbox" name="sports" value={sport} defaultChecked={profile.sports?.includes(sport)} /><span>{sport}</span></label>)}</fieldset>
        <label>Контакт в Telegram<input name="telegramContact" maxLength={33} value={telegramContact} onChange={event=>setTelegramContact(event.target.value)} autoComplete="off" placeholder="@username" autoCapitalize="none" spellCheck={false}/></label>
        <label className="notification-toggle"><input type="checkbox" name="shareContact" defaultChecked={profile.shareContact===true}/><span>Показывать мой Telegram-контакт друзьям и после одобрения заявки<small>Контакт увидят друзья, а также организатор и принятый участник общей встречи. Для остальных он скрыт.</small></span></label>
        <label className="notification-toggle"><input type="checkbox" name="notifications" defaultChecked={profile.notificationsEnabled !== false} /><span>Уведомления о заявках и изменениях встреч<small>Сообщения от бота в вашем мессенджере</small></span></label>
        <button className="primary full" type="submit">{busy ? "Сохраняем…" : "Сохранить профиль"}</button>
      </fieldset>
      {message && <p className="account-feedback" role="status">{message}</p>}
    </form>
    <section className="account-history"><h2>Ваша история</h2><div className="account-stats"><div><strong>{organized}</strong><span>Организовано</span></div><div><strong>{applications}</strong><span>Заявок на встречи</span></div></div><button className="secondary full" onClick={onHistory}>Посмотреть мои сходки</button><p className="account-caption">Заявка не подтверждает фактическое посещение встречи.</p></section>
    {moderator&&<button className="secondary full friends-entry" onClick={onModeration}>Модерация и жалобы →</button>}

  </section>;
}

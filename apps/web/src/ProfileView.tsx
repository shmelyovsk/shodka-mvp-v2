import { useEffect, useRef, useState, type FormEvent } from "react";
import { SPORT_OPTIONS, GAME_OPTIONS, BOARD_GAME_OPTIONS } from "./options";
import { openDonation, DONATION_URL } from "./donation";
import { MyReviews } from "./MyReviews";
import { BlockedUsers } from "./BlockedUsers";
import { Icon } from "./Icon";
import { api, type Profile } from "./api";

export function ProfileView({ profile, organized, applications, onSave, onHistory, moderator, onModeration, onSupport, initialEditing=false }: {
  profile: Profile; organized: number; applications: number; initialEditing?:boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>; onHistory: () => void; moderator:boolean; onModeration:()=>void; onSupport:()=>void;
}) {
  const [editing,setEditing]=useState(initialEditing);
  const [linkUrl,setLinkUrl]=useState("");
  const [nickname,setNickname]=useState(profile.nickname??"");
  useEffect(()=>{setNickname(profile.nickname??"");},[profile.nickname]);
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
      gender: data.get("gender"), name: data.get("name"), bio: data.get("bio"), district: data.get("district"),
      sports: data.getAll("sports"), notificationsEnabled: data.get("notifications") === "on",
      ...(age ? { age: Number(age) } : {}),
      ...(photoAction === "custom" ? { avatarUrl: photo } : photoAction === "platform" ? { usePlatformAvatar: true } : {}),
    };
    setBusy(true); setMessage("");
    try { await onSave(patch); setMessage("Профиль сохранён"); setPhotoAction(null); setEditing(false); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль"); }
    finally { setBusy(false); }
  }
  return <section className="account-page">
    <div className="account-heading"><div className="profile-toolbar"><span className="eyebrow">Данные и настройки</span>{!editing&&<button type="button" className="edit-profile-button" onClick={()=>{setMessage("");setEditing(true);}}><Icon name="pencil" size={17}/>Изменить</button>}</div>{editing&&<><h1>Немного<br/>о тебе.</h1><p>Пусть знакомиться будет проще.</p></>}</div>
    {!editing&&<div className="profile-overview"><section className="profile-hero"><div className="profile-identity">{profile.avatarUrl?<img className="account-photo" src={profile.avatarUrl} alt="Твоё фото"/>:<span className="account-photo account-initial">{profile.name.slice(0,1)}</span>}<div><h1>{profile.name}</h1><p>{profile.nickname?'@'+profile.nickname:'Ник пока не выбран'}</p></div></div><div className="profile-facts"><span>{profile.age?profile.age+' лет':'Возраст не указан'}</span><span><Icon name="map-pin" size={17}/>{profile.district||'Район не указан'}</span></div></section><section className="profile-section"><h2>Пол</h2><p>{{female:"Женский",male:"Мужской",unspecified:"Не указан"}[profile.gender??"unspecified"]}</p></section><section className="profile-section"><h2>О себе</h2><p>{profile.bio||'Расскажи, чем любишь заниматься и какую компанию ищешь.'}</p></section><section className="profile-section"><h2>Что мне интересно</h2><div className="public-interests">{profile.sports?.length?profile.sports.map(sport=><span className="interest-tag" key={sport}>{sport}</span>):<p>Добавь интересы — так проще найти своих.</p>}</div></section><section className="profile-contact"><h2><Icon name="send" size={20}/>Telegram{profile.telegramContact?' · @'+profile.telegramContact:''}</h2><p>{profile.telegramContact?'Контакт видят друзья после принятия запроса, а также организатор и участник после одобрения заявки.':'Контакт пока не указан. Открой редактирование профиля, чтобы узнать, как его подтвердить.'}</p></section>{message&&<p className="account-feedback" role="status">{message}</p>}</div>}
    {editing&&<form className="form account-form" onSubmit={submit}>
      <fieldset disabled={busy || readingPhoto} className="account-fields">
        <div className="account-photo-row">
          {photo ? <img className="account-photo" src={photo} alt="Ваше фото" /> : <span className="account-photo account-initial">{profile.name.slice(0, 1)}</span>}
          <div><button type="button" className="secondary" onClick={() => fileInput.current?.click()}>{readingPhoto ? "Обрабатываем…" : "Выбрать фото"}</button><p className="account-caption">JPG, PNG или WebP · до 10 МБ</p>
            {profile.platformAvatarUrl && <button type="button" className="text-button" onClick={() => { setPhoto(profile.platformAvatarUrl); setPhotoAction("platform"); }}>Фото из мессенджера</button>}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { void selectPhoto(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
        <label>Как вас зовут<input name="name" required maxLength={80} defaultValue={profile.name} autoComplete="given-name" /></label>
        <label>Ник СХОДКИ<input name="nickname" minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]{2,23}" placeholder="username" value={nickname} onChange={event=>setNickname(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false}/></label><p className="form-hint">Уникальный ник внутри приложения, не обязательно как в Telegram. 3–24 символа: латиница, цифры и _. По нему друзья смогут вас найти.</p>
        <div className="form-row"><label>Возраст<input name="age" type="number" inputMode="numeric" min={16} max={100} placeholder="От 16 лет" defaultValue={profile.age || ""} /></label><label>Район или метро<input name="district" maxLength={100} placeholder="Например, Сокол" defaultValue={profile.district} /></label></div>
        <p className="form-hint">Возраст нужен перед первой заявкой или созданием сходки и виден другим участникам.</p>
        <label>Пол<select name="gender" defaultValue={profile.gender??"unspecified"}><option value="unspecified">Не указан</option><option value="female">Женский</option><option value="male">Мужской</option></select></label><p className="form-hint">Добровольно. Для встреч только для девушек или парней пол нужно указать. Он виден в профиле участника.</p>
        <label>О себе<textarea name="bio" rows={3} maxLength={500} placeholder="Что любите, как проводите время, какую компанию ищете" defaultValue={profile.bio} /></label>
        <fieldset className="sports-options"><legend>Интересы: спорт и игры (до 12)</legend>{[...SPORT_OPTIONS, ...GAME_OPTIONS, ...BOARD_GAME_OPTIONS, ...(profile.sports??[]).filter(item=>![...SPORT_OPTIONS,...GAME_OPTIONS,...BOARD_GAME_OPTIONS].includes(item))].map(sport => <label key={sport}><input type="checkbox" name="sports" value={sport} defaultChecked={profile.sports?.includes(sport)} /><span>{sport}</span></label>)}</fieldset>
        <label>Контакт в Telegram<input value={profile.telegramContact?'@'+profile.telegramContact:'Не указан'} readOnly aria-readonly="true"/></label>
        <p className="history-note">Контакт берётся из Telegram, изменить его здесь нельзя. Его увидят друзья, а после одобрения заявки — организатор и принятый участник друг у друга. Для остальных контакт скрыт.</p>
        {!profile.telegramContact&&<p className="history-note">Установите имя пользователя @username в настройках Telegram и полностью переоткройте мини-приложение.</p>}
        {profile.id.startsWith("max:")&&<><button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setMessage("");try{const result=await api<{url:string}>("/api/telegram-link",{method:"POST",body:"{}"},profile.id);setLinkUrl(result.url);setMessage("Откройте ссылку в Telegram и нажмите «Запустить». Ссылка действует 10 минут. После привязки нажмите «Обновить контакт».");}catch(e){setMessage(e instanceof Error?e.message:"Не удалось создать ссылку");}finally{setBusy(false);}}}>Привязать Telegram</button>{linkUrl&&<a className="secondary" href={linkUrl} target="_blank" rel="noopener noreferrer">Открыть Telegram для подтверждения</a>}<button type="button" className="text-button" onClick={()=>window.location.reload()}>Обновить контакт</button></>}

        <label className="notification-toggle"><input type="checkbox" name="notifications" defaultChecked={profile.notificationsEnabled !== false} /><span>Уведомления о заявках и изменениях встреч<small>Сообщения от бота в вашем мессенджере</small></span></label>
        <button className="primary full" type="submit">{busy ? "Сохраняем…" : "Сохранить профиль"}</button>
      <button type="button" className="text-button cancel-edit" disabled={busy} onClick={()=>{setEditing(false);setNickname(profile.nickname??"");setPhoto(profile.avatarUrl);setPhotoAction(null);setMessage("");}}>Отменить изменения</button>
      </fieldset>
      {message && <p className="account-feedback" role="status">{message}</p>}
    </form>}
    {!editing&&<section className="account-history"><h2>Ваша история</h2><div className="account-stats"><div><strong>{organized}</strong><span>Организовано</span></div><div><strong>{applications}</strong><span>Заявок на встречи</span></div></div><button className="secondary full" onClick={onHistory}>Посмотреть мои сходки</button><p className="account-caption">Заявка не подтверждает фактическое посещение встречи.</p></section>}
    {!editing&&<MyReviews userId={profile.id}/>}
    {!editing&&<section className="profile-contact profile-donation"><h2>Помочь СХОДКЕ</h2><p>Сервис бесплатный. Если хочешь помочь оплачивать сервер и развивать проект, поддержи нас любой суммой. Это добровольно и не влияет на возможности приложения.</p><a className="primary full" href={DONATION_URL} onClick={openDonation} target="_blank" rel="noopener noreferrer">Поддержать проект<Icon name="arrow-up-right" size={18}/></a></section>}
    {!editing&&<BlockedUsers currentUserId={profile.id}/>}
    {!editing&&moderator&&<button className="secondary full friends-entry" onClick={onSupport}>Обращения: проблемы и идеи →</button>}
    {!editing&&moderator&&<button className="secondary full friends-entry" onClick={onModeration}>Модерация и жалобы →</button>}

  </section>;
}

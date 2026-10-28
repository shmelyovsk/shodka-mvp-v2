import type { Profile } from "./api";
export function missingProfileFields(profile:Profile|null):string[]{
 const missing:string[]=[];
 if(!profile?.name?.trim())missing.push("имя");
 if(!profile?.nickname||!/^[a-z][a-z0-9_]{2,23}$/.test(profile.nickname))missing.push("ник СХОДКИ");
 if(!profile||!Number.isInteger(profile.age)||profile.age<16||profile.age>100)missing.push("возраст от 16 лет");
 if(!profile?.telegramContact)missing.push("подтверждённый Telegram-контакт");
 return missing;
}

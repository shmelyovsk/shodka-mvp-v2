import {RUSSIAN_STEMS,RUSSIAN_WORDS,ENGLISH_WORD_PATTERNS,MASKED_WORDS} from "./textDictionary.js";
export class ContentRejected extends Error {}
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const ruStems=new RegExp("^(?:"+RUSSIAN_STEMS.map(escape).join("|")+")[\\p{L}]*$","u"),ruWords=new Set(RUSSIAN_WORDS);
const enWords=new RegExp("^(?:"+ENGLISH_WORD_PATTERNS.join("|")+")$","u");
const lookalikes:Record<string,string>={a:"а",b:"в",c:"с",e:"е",h:"н",k:"к",m:"м",o:"о",p:"р",t:"т",x:"х",y:"у",i:"и",j:"й",u:"у",n:"п",v:"в",z:"з",0:"о",1:"и",3:"з",4:"ч",6:"б",8:"в",9:"я"};
const latinKeys="qwertyuiop[]asdfghjkl;'zxcvbnm,.",russianKeys="йцукенгшщзхъфывапролджэячсмитьбю";
const keyboard=(s:string)=>[...s].map(c=>{const i=latinKeys.indexOf(c);return i<0?c:russianKeys[i];}).join("");
function translit(s:string){return s.replace(/uy/g,"уй").replace(/ye/g,"е").replace(/oy(?=$|[^a-z])/g,"ой").replace(/shch/g,"щ").replace(/sch/g,"щ").replace(/yo/g,"е").replace(/zh/g,"ж").replace(/kh/g,"х").replace(/ts/g,"ц").replace(/ch/g,"ч").replace(/sh/g,"ш").replace(/yu/g,"ю").replace(/ya/g,"я").replace(/[a-z]/g,c=>({a:"а",b:"б",c:"к",d:"д",e:"е",f:"ф",g:"г",h:"х",i:"и",j:"й",k:"к",l:"л",m:"м",n:"н",o:"о",p:"п",q:"к",r:"р",s:"с",t:"т",u:"у",v:"в",w:"в",x:"х",y:"ы",z:"з"} as Record<string,string>)[c]??c);}
function normalize(s:string){return s.normalize("NFKC").toLowerCase().replace(/ё/g,"е").normalize("NFD").replace(/и\u0306/g,"й").replace(/\p{M}/gu,"").replace(/\p{Cf}/gu,"");}
function variants(s:string){const digit=s.replace(/[0134689]/g,c=>lookalikes[c]);const mixed=digit.replace(/[abcehkmoptxyijunvz]/g,c=>lookalikes[c]);const raw=[s,digit,mixed,translit(digit),keyboard(s)];return new Set(raw.flatMap(w=>[w,w.replace(/(.)\1+/gu,"$1"),w.replace(/(.)\1{2,}/gu,"$1$1")]));}
function badWord(word:string){return [...variants(word)].some(w=>ruWords.has(w)||ruStems.test(w)||enWords.test(w));}
function containsThreat(raw:string){
 const ru=raw.replace(/[abcehkmoptxyijunvz0134689]/g,c=>lookalikes[c]).replace(/[^\p{L}\p{N}]+/gu," ").trim();
 const verbs="(?:убью|убьем|изобью|изобьем|зарежу|зарежем|расстреляю|расстреляем|покалечу|покалечим|изнасилую|изнасилуем|пристрелю|пристрелим|застрелю|застрелим|прирежу|прирежем|взорву|взорвем|сожгу|сожжем|прибью|прибьем|удушу|задушу|задушим)",target="(?:тебя|вас|его|ее|их)",between="(?:\\s+[\\p{L}]+){0,2}\\s+";
 if(new RegExp("(?:^|\\s)(?:"+verbs+between+target+"|"+target+between+verbs+")(?:$|\\s)","u").test(ru))return true;
 if(/(?:убей(?:те)?\s+себя|покончи\s+с\s+собой|сломаю\s+тебе\s+(?:шею|ноги|руки|позвоночник)|выстрелю\s+в\s+тебя|сдохните?)(?:$|\s)/u.test(ru))return true;
 const en=raw.replace(/[^a-z0-9]+/g," ");return /(?:^| )(?:kill|murder|rape|stab|shoot|strangle)(?: (?:you|u|him|her|them))(?=$| )|(?:^| )(?:you|u) (?:will die|must die)|(?:^| )kill yourself(?=$| )/.test(en);
}
export function isRejectedText(text:string){
 const raw=normalize(text).replace(/(?<=\p{L})[!|](?=\p{L})/gu,"i").replace(/\$/g,"s").replace(/@/g,"a");if(containsThreat(raw))return true;
 const tokens=[...raw.matchAll(/[\p{L}\p{N}]+/gu)];if(tokens.some(t=>badWord(t[0])))return true;
 if((keyboard(raw).match(/[\p{L}\p{N}]+/gu)??[]).some(t=>badWord(t)))return true;
 // Reassemble punctuation-separated chunks and individual spaced letters, never arbitrary normal words.
 for(let i=0;i<tokens.length;i++){
  let joined=tokens[i][0],single=joined.length===1;
  for(let j=i+1;j<Math.min(tokens.length,i+18);j++){
   const prev=tokens[j-1],next=tokens[j],gap=raw.slice((prev.index??0)+prev[0].length,next.index);single=single&&next[0].length===1;
   if(gap.length>4||!gap||(!/^[._*#~\-•·]+$/u.test(gap)&&!(single&&/^\s+$/u.test(gap))))break;
   joined+=next[0];if(joined.length>40)break;if(badWord(joined))return true;
  }
 }
 for(const token of raw.match(/[\p{L}\p{N}*#•]+/gu)??[]){if(!/[*#•]/.test(token)||token.length>32)continue;const normalized=token.replace(/[abcehkmoptxyijunvz0134689]/g,c=>lookalikes[c]);for(const v of [token,normalized]){if(v.replace(/[*#•]/g,"").length<2)continue;const pattern="^"+[...v].map(c=>/[*#•]/.test(c)?".":escape(c)).join("")+"$";const re=new RegExp(pattern,"u");if(MASKED_WORDS.some(w=>re.test(w)))return true;}}
 return false;
}
export function checkContent(...values:unknown[]){if(values.some(value=>typeof value==="string"&&isRejectedText(value)))throw new ContentRejected("В тексте найдены мат, оскорбление или угроза. Переформулируйте сообщение");}

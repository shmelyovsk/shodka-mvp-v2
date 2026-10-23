import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {checkContent,ContentRejected,isRejectedText} from '../apps/server/dist/textFilter.js';
import {RUSSIAN_STEMS,RUSSIAN_WORDS} from '../apps/server/dist/textDictionary.js';
const blocked=[
 'нахер','похеру','нихера','охереть','херовый','йобаный','ёпта','ёпт','дибил','хули','блеат','блэт','пнх',
 'хуй','хуями','нахуй','нахуя','похуй','охуенно','ахуеть','пиздец','спиздил','напиздел','ебать','ебаный','ёбаный','ебнутый','заебал','долбоёб','подъебать','разъёбанный','съебаться','переебать','уёбок','еблан',
 'сука','сукой','сучка','сучара','сученыш','сволочь','ублюдок','мразь','мудак','мудила','гандон','гондон','говно','дерьмо','залупа','пидор','пидорас','педик','педераст','шлюха','шалава','дебил','идиот','придурок','тупой','тупая','конченый','лох','лошара','чмо','тварь',
 'ХУЙ','сУкА','суууука','сукаааа','cyka','сyкa','cука','п1дор','г0вно','4мо','suka','pidoras','blyat','huy','nahui','yebat','tupoy','cerf','t,fnm','[eq',
 'с.у.к.а','х_у_й','п-и-д-о-р','х у й','с у к а','f u c k','f.u.c.k','х*й','с*ка','п*здец','бл*дь','f*ck','b!tch','sh!t','$uka','х\u200bуй','с\u2060ука','fück',
 'fuck','fucking','fucker','motherfucker','shit','shitty','bullshit','bitch','bitches','asshole','dickhead','cock','cocksucker','cunt','bastard','slut','whore','faggot','nigger','retard','moron','idiot','scumbag','dumbass','stfu',
 'я убью тебя','я изобью вас','я тебя завтра зарежу','вас расстреляю','покалечу тебя','изнасилую тебя','сожгу вас','сломаю тебе шею','выстрелю в тебя','убей себя','покончи с собой','сдохни','I will kill you','I will shoot you','kill yourself'
];
const allowed=[
 'Бег','Настольный теннис','Большой теннис','Волейбол','Баскетбол','Футбол','Бадминтон','Велосипед','Плавание','Фитнес','Йога','Скалолазание','Падел','Сквош','Ролики','Коньки','Лыжи','Шахматы','Пешие прогулки',
 'Counter-Strike 2','Dota 2','Valorant','League of Legends','Minecraft','Fortnite','Apex Legends','Overwatch 2','EA Sports FC','Rocket League','Genshin Impact','Assassin’s Creed','Hearthstone','Scunthorpe United','Dickinson','Shitov',
 'страхуй напарника','подстрахуй меня','учёба после тренировки','учеба','мебель','хлеб','команда','команды','мандарин','мандарины','мандала','педикюр','педагог','Херсон','Козлов','Александр Козлов','Хачик','Семён','Лёша','Нигер',
 'Новичков','Любой уровень','С опытом','Никаких оскорблений','Новички и опытные игроки','Учимся стрелять в Counter-Strike','Победим босса в игре','Слабый уровень подготовки','Иди от метро к площадке','Hello, world','Найди свою команду!','С друзьями после учебы','Спасибо за встречу','Ирина','Наталья','Москва','Сокол','Сходка',
 '1234567890','в 18:00','Счёт 4:3','Возраст 18–22','Бесплатно','Футбол по четвергам','Купи хлеб и молоко','Я не собираюсь никого убивать'
];
const misses=blocked.filter(s=>!isRejectedText(s)),falsePositives=allowed.filter(s=>isRejectedText(s));
assert.deepEqual(misses,[],'missed abuse/threat samples');assert.deepEqual(falsePositives,[],'ordinary sports, names and places must pass');
for(const word of RUSSIAN_WORDS)assert.ok(isRejectedText(word),'dictionary word: '+word);
for(const stem of RUSSIAN_STEMS)assert.ok(isRejectedText(stem),'dictionary stem: '+stem);
assert.throws(()=>checkContent('Встреча','Дебил'),ContentRejected);assert.doesNotThrow(()=>checkContent('иди','от метро'));
const start=performance.now();assert.doesNotThrow(()=>checkContent('спорт '.repeat(400)));assert.ok(performance.now()-start<2500,'bounded processing time');
console.log('PASS: '+blocked.length+' blocked and '+allowed.length+' allowed cases; dictionary coverage, morphology, obfuscation, translit, keyboard layout, threats and benign text performance');

import { Icon, type IconName } from "./Icon";
const icons: Record<string,IconName>={catalog:"map-pin",create:"plus",friends:"users-round",mine:"calendar-days",requests:"check",back:"arrow-left"};
export function NavIcon({kind}:{kind:"catalog"|"create"|"requests"|"mine"|"back"|"friends"}){return <Icon name={icons[kind]} size={kind==="back"?22:26}/>;}

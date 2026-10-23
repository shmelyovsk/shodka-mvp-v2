// Lucide icons, vendored from lucide-icons/lucide. See LUCIDE-LICENSE.txt.
const shapes = {
  "map-pin": <><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
  <circle cx="12" cy="10" r="3" /></>,
  "plus": <><path d="M5 12h14" />
  <path d="M12 5v14" /></>,
  "users-round": <><path d="M18 21a8 8 0 0 0-16 0" />
  <circle cx="10" cy="8" r="5" />
  <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" /></>,
  "calendar-days": <><path d="M8 2v3" />
  <path d="M16 2v3" />
  <rect x="3" y="3" width="18" height="18" rx="2" />
  <path d="M3 9h18" />
  <path d="M8 13h.01" />
  <path d="M12 13h.01" />
  <path d="M16 13h.01" />
  <path d="M8 17h.01" />
  <path d="M12 17h.01" />
  <path d="M16 17h.01" /></>,
  "arrow-left": <><path d="m12 19-7-7 7-7" />
  <path d="M19 12H5" /></>,
  "arrow-right": <><path d="M5 12h14" />
  <path d="m12 5 7 7-7 7" /></>,
  "arrow-up-right": <><path d="M7 7h10v10" />
  <path d="M7 17 17 7" /></>,
  "bookmark": <><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" /></>,
  "pencil": <><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
  <path d="m15 5 4 4" /></>,
  "clock-3": <><circle cx="12" cy="12" r="10" />
  <path d="M12 6v6h4" /></>,
  "sliders-horizontal": <><path d="M10 5H3" />
  <path d="M12 19H3" />
  <path d="M14 3v4" />
  <path d="M16 17v4" />
  <path d="M21 12h-9" />
  <path d="M21 19h-5" />
  <path d="M21 5h-7" />
  <path d="M8 10v4" />
  <path d="M8 12H3" /></>,
  "search": <><path d="m21 21-4.34-4.34" />
  <circle cx="11" cy="11" r="8" /></>,
  "x": <><path d="M18 6 6 18" />
  <path d="m6 6 12 12" /></>,
  "check": <><path d="M20 6 9 17l-5-5" /></>,
  "send": <><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
  <path d="m21.854 2.147-10.94 10.939" /></>,
  "chevron-down": <><path d="m6 9 6 6 6-6" /></>,
};
export type IconName = keyof typeof shapes;
export function Icon({name,size=22,className=""}:{name:IconName;size?:number;className?:string}) {
 return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}


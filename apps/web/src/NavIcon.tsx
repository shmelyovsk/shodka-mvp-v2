export function NavIcon({ kind }: { kind: "catalog" | "create" | "requests" | "mine" | "back" | "friends" }) {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "catalog" && <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z" /></>}
    {kind === "friends" && <><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 21v-2a6 6 0 0 1 12 0v2m2-6a5 5 0 0 1 6 5v1"/></>}
    {kind === "create" && <><rect x="3" y="3" width="18" height="18" rx="6" /><path d="M12 7v10M7 12h10" /></>}
    {kind === "requests" && <><rect x="4" y="3" width="16" height="18" rx="4" /><path d="m8 12 3 3 5-6" /></>}
    {kind === "mine" && <><rect x="3" y="5" width="18" height="16" rx="4" /><path d="M7 3v4M17 3v4M3 10h18m-13 5 2 2 4-4" /></>}
    {kind === "back" && <path d="m14 5-7 7 7 7" />}
  </svg>;
}

import type { MouseEvent } from "react";

// Same address as the working /support button. Never embed the payment page.
export const DONATION_URL = "https://yoomoney.ru/quickpay/fundraise/button?billNumber=1L700LK69PT.261028";

export function openDonation(event: MouseEvent<HTMLAnchorElement>) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const bridges = window as unknown as {
    Telegram?: { WebApp?: { initData?: string; openLink?: (url: string) => void } };
    WebApp?: { initData?: string; openLink?: (url: string) => void };
  };
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const telegram = bridges.Telegram?.WebApp;
  const max = bridges.WebApp;
  const bridge = telegram?.initData || hash.has("tgWebAppData") ? telegram : max?.initData || hash.has("WebAppData") ? max : undefined;
  if (bridge?.openLink) {
    try { bridge.openLink(DONATION_URL); event.preventDefault(); } catch { /* Keep the ordinary browser link as fallback. */ }
  }
}

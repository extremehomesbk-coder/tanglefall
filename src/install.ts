/** Home-screen install: Chrome/Android hand us a deferred prompt; iOS has no API (the menu shows a hint instead). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;

export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
  });
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return installed || nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export function canPromptInstall(): boolean {
  return deferred !== null && !isStandalone();
}

/** iPhone Safari: no prompt API, so the menu explains the Share > Add to Home Screen route. */
export function isIosBrowser(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone();
}

export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null;
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    return choice.outcome === 'accepted';
  } catch {
    return false;
  }
}

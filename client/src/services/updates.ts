// Software-updates via GitHub Releases (Settings > Software).
// Nieuwe versie uitbrengen: tools/release.ps1 (verhoogt version.json, bouwt de APK en zet hem in een GitHub Release).
// PandaOS kijkt hier of er een nieuwere release is en laat de launcher de APK downloaden en installeren
// (PandaAndroid.installUpdate -> UpdateInstaller.kt).

// Openbare repository met de releases
export const UPDATE_REPO = 'tracemodule/pandaOS';

export interface ReleaseInfo {
  version: string; // zonder 'v', bijv. '1.1.1'
  notes: string; // tekst van de release
  apkUrl: string | null; // downloadlink van de APK
  published: string;
}

const bridge = () => (window as any).PandaAndroid;

// Versie die nu draait: op de radio die van de launcher-app, anders die van de webapp
export const currentVersion = (): string => {
  try {
    const native = bridge()?.getAppVersion?.();
    if (native) return JSON.parse(native).version;
  } catch { /* geen launcher */ }
  return __PANDAOS_VERSION__;
};

// '1.10.0' > '1.9.3'
export const isNewer = (candidate: string, current: string) => {
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
};

// Nieuwste release op GitHub (zonder inloggen: de repository is openbaar)
export const fetchLatestRelease = async (): Promise<ReleaseInfo | null> => {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (response.status === 404) return null; // nog geen release
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  const data = await response.json();
  const apk = (data.assets ?? []).find((asset: { name: string }) => asset.name.toLowerCase().endsWith('.apk'));
  return {
    version: String(data.tag_name ?? '').replace(/^v/i, ''),
    notes: data.body ?? '',
    apkUrl: apk?.browser_download_url ?? null,
    published: data.published_at ?? '',
  };
};

// Bij het opstarten (na het VW-logo): nieuwe versie? Dan een melding. Installeren gebeurt in Settings > Software.
export const checkForUpdatesAtStartup = async (notify: (message: string, type: 'info', label: string) => void) => {
  try {
    const release = await fetchLatestRelease();
    if (release && isNewer(release.version, currentVersion())) notify(`PandaOS ${release.version}`, 'info', 'UPDATE AVAILABLE');
  } catch { /* geen internet: volgende keer */ }
};

// Laat de launcher de update downloaden en installeren (alleen op de radio)
export const canInstallUpdates = () => typeof bridge()?.installUpdate === 'function';
export const installUpdate = (apkUrl: string) => bridge()?.installUpdate(apkUrl);

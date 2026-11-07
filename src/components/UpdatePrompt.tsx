import { useRegisterSW } from 'virtual:pwa-register/react';

/** Shown when a new version of the installed app has downloaded. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="update-toast" role="status">
      {needRefresh ? (
        <>
          <span>A new version is ready.</span>
          <button type="button" className="btn-primary btn-small" onClick={() => updateServiceWorker(true)}>
            Reload
          </button>
        </>
      ) : (
        <span>Ready to work offline.</span>
      )}
      <button type="button" className="btn-quiet btn-small" onClick={() => (setNeedRefresh(false), setOfflineReady(false))}>
        Dismiss
      </button>
    </div>
  );
}

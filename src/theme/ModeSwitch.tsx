import { useTheme, type ModeSetting } from './ThemeProvider';

const OPTIONS: { value: ModeSetting; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4' },
  { value: 'dark', label: 'Dark', icon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z' },
  { value: 'auto', label: 'Follow system', icon: 'M4 5h16v11H4zM9 20h6M12 16v4' },
];

/** Light / dark / follow-system switch for the topbar. */
export function ModeSwitch() {
  const { mode, setMode } = useTheme();
  return (
    <div className="mode-switch" role="radiogroup" aria-label="Color mode">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={mode === o.value}
          title={o.label}
          aria-label={o.label}
          onClick={() => setMode(o.value)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={o.icon} />
          </svg>
        </button>
      ))}
    </div>
  );
}

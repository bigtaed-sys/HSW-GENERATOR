import { Download, FilePlus2, FolderOpen, Hexagon, Link2, Monitor, Moon, PanelLeft, PanelRight, Redo2, Save, Sun, Undo2 } from 'lucide-react';
import { useRef } from 'react';
import { useT } from '../i18n';
import { defaultProject } from '../model/defaults';
import { useStore, type Theme } from '../model/store';
import { Segmented } from './controls';
import { download, shareUrl } from './share';

export function TopBar({
  onExport,
  toast,
  drawer,
  setDrawer,
}: {
  onExport: () => void;
  toast: (s: string) => void;
  drawer: string | null;
  setDrawer: (d: string | null) => void;
}) {
  const t = useT();
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const ThemeIcon = s.theme === 'light' ? Sun : s.theme === 'dark' ? Moon : Monitor;
  const themeLabel = s.theme === 'light' ? t('themeLight') : s.theme === 'dark' ? t('themeDark') : t('themeSystem');

  const save = () =>
    download(JSON.stringify(s.project, null, 2), `${s.project.name || 'hsw-wall'}.hsw.json`, 'application/json');
  const open = async (f: File) => {
    try {
      const p = JSON.parse(await f.text());
      if (!p || typeof p !== 'object' || !p.wall) throw new Error('bad');
      s.setProject(p);
      window.dispatchEvent(new Event('hsw-fit'));
    } catch {
      toast(t('openFailed'));
    }
  };
  const share = async () => {
    const url = shareUrl(s.project);
    if (url.length > 60000) return toast(t('shareTooLong'));
    try {
      await navigator.clipboard.writeText(url);
      toast(t('shareCopied'));
    } catch {
      window.prompt(t('share'), url);
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <Hexagon size={17} strokeWidth={2.4} />
        </div>
        <span className="brand-name">{t('appName')}</span>
      </div>
      <button
        className={`icon-btn mobile-toggle ${drawer === 'left' ? 'active' : ''}`}
        onClick={() => setDrawer(drawer === 'left' ? null : 'left')}
        aria-label={t('tabWall')}
      >
        <PanelLeft size={17} />
      </button>
      <input
        className="project-name"
        value={s.project.name}
        onChange={(e) => s.update((p) => void (p.name = e.target.value), { transient: true })}
        onFocus={() => s.checkpoint()}
        onBlur={() => s.update(() => {})}
        aria-label="Project name"
      />
      <div className="sep hide-sm" />
      <button className="icon-btn" onClick={s.undo} disabled={!s.past.length} title={`${t('undo')} (Ctrl+Z)`}>
        <Undo2 size={17} />
      </button>
      <button className="icon-btn hide-xs" onClick={s.redo} disabled={!s.future.length} title={`${t('redo')} (Ctrl+Shift+Z)`}>
        <Redo2 size={17} />
      </button>
      <div className="sep hide-sm" />
      <button
        className="icon-btn hide-sm"
        title={t('newProject')}
        onClick={() => {
          if (confirm(t('confirmNew'))) {
            s.setProject({ ...defaultProject(), name: t('untitled') });
            window.dispatchEvent(new Event('hsw-fit'));
          }
        }}
      >
        <FilePlus2 size={17} />
      </button>
      <button className="icon-btn hide-sm" title={t('open')} onClick={() => fileRef.current?.click()}>
        <FolderOpen size={17} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.hsw.json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) open(f);
          e.target.value = '';
        }}
      />
      <button className="icon-btn hide-sm" title={t('save')} onClick={save}>
        <Save size={17} />
      </button>
      <button className="icon-btn hide-sm" title={t('share')} onClick={share}>
        <Link2 size={17} />
      </button>
      <div className="spacer" />
      <Segmented
        full={false}
        value={s.view}
        onChange={(v) => s.setUi({ view: v })}
        options={[
          { value: '2d', label: t('view2d') },
          { value: '3d', label: t('view3d') },
        ]}
      />
      <div className="sep hide-sm" />
      <Segmented
        full={false}
        value={s.lang}
        onChange={(v) => s.setUi({ lang: v })}
        options={[
          { value: 'ru', label: 'RU' },
          { value: 'en', label: 'EN' },
        ]}
      />
      <button className="icon-btn" title={themeLabel} onClick={() => s.setUi({ theme: nextTheme[s.theme] })}>
        <ThemeIcon size={17} />
      </button>
      <button
        className={`icon-btn mobile-toggle ${drawer === 'right' ? 'active' : ''}`}
        onClick={() => setDrawer(drawer === 'right' ? null : 'right')}
        aria-label={t('library')}
      >
        <PanelRight size={17} />
      </button>
      <button className="btn primary" onClick={onExport}>
        <Download size={15} />
        <span className="hide-sm">{t('export')}</span>
      </button>
    </header>
  );
}

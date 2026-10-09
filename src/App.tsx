import { Lightbulb, PenTool, AlertTriangle, Eye, EyeOff, Hexagon, Layers, Maximize, MousePointer2, RotateCcw, Bolt, Shapes, Square } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useT } from './i18n';
import { useGeo } from './model/geo';
import { useStore } from './model/store';
import { Canvas2D, requestFit } from './ui/Canvas2D';
import { ExportDialog } from './ui/ExportDialog';
import { LeftPanel } from './ui/LeftPanel';
import { RightPanel } from './ui/RightPanel';
import { TopBar } from './ui/TopBar';

const Viewer3D = lazy(() => import('./ui/Viewer3D').then((m) => ({ default: m.Viewer3D })));

function useThemeAttr() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (e.key === 'Escape') {
        s.setUi({ placing: null, selection: null, tool: 'select' });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        const sel = s.selection;
        s.update((p) => {
          if (sel.kind === 'accessory') p.accessories = p.accessories.filter((a) => a.id !== sel.id);
          if (sel.kind === 'cutout') p.cutouts = p.cutouts.filter((a) => a.id !== sel.id);
          if (sel.kind === 'model') p.customModels = p.customModels.filter((a) => a.id !== sel.id);
        });
        s.setUi({ selection: null });
      } else if (e.key.startsWith('Arrow') && s.selection && s.selection.kind !== 'cutout') {
        e.preventDefault();
        const sel = s.selection;
        const dc = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0;
        const dr = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
        s.update((p) => {
          const x = (sel.kind === 'accessory' ? p.accessories : p.customModels).find((a) => a.id === sel.id);
          if (x) {
            x.c += dc;
            x.r += dr;
          }
        });
      } else if (!mod && e.key.toLowerCase() === 'f') {
        requestFit();
      } else if (!mod && (e.key === '1' || e.key === '2')) {
        s.setUi({ view: e.key === '1' ? '2d' : '3d' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function CanvasToolbar() {
  const t = useT();
  const s = useStore();
  const tools = [
    { id: 'select', icon: <MousePointer2 size={16} />, label: t('toolSelect') },
    { id: 'solid', icon: <Square size={16} fill="currentColor" fillOpacity={0.35} />, label: t('toolSolid') },
    { id: 'mount', icon: <Bolt size={16} />, label: t('toolMount') },
    { id: 'reset', icon: <RotateCcw size={16} />, label: t('toolReset') },
  ] as const;
  const custom = s.project.wall.shape === 'custom';
  const hasLed = !!useGeo((g) => g.layout?.led);
  return (
    <div className="floating bc">
      {s.view === '2d' && custom && (
        <button
          className={`icon-btn ${s.tool === 'outline' && !s.placing ? 'active' : ''}`}
          title={t('toolOutline')}
          onClick={() => s.setUi({ tool: 'outline', placing: null })}
        >
          <PenTool size={16} />
        </button>
      )}
      {s.view === '2d' &&
        tools.map((x) => (
          <button
            key={x.id}
            className={`icon-btn ${s.tool === x.id && !s.placing ? 'active' : ''}`}
            title={x.label}
            onClick={() => s.setUi({ tool: x.id, placing: null })}
          >
            {x.icon}
          </button>
        ))}
      {s.view === '2d' && <div className="sep" />}
      <button className={`icon-btn ${s.showPanels ? 'active' : ''}`} title={t('togglePanels')} onClick={() => s.setUi({ showPanels: !s.showPanels })}>
        <Hexagon size={16} />
      </button>
      <button className={`icon-btn ${s.showAccessories ? 'active' : ''}`} title={t('toggleAccessories')} onClick={() => s.setUi({ showAccessories: !s.showAccessories })}>
        {s.showAccessories ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
      {s.view === '3d' && hasLed && (
        <button className={`icon-btn ${s.ledSim ? 'active' : ''}`} title={t('ledSim')} onClick={() => s.setUi({ ledSim: !s.ledSim })}>
          <Lightbulb size={16} />
        </button>
      )}
      {s.view === '3d' && (
        <button className={`icon-btn ${s.exploded ? 'active' : ''}`} title={t('exploded')} onClick={() => s.setUi({ exploded: !s.exploded })}>
          <Layers size={16} />
        </button>
      )}
      <div className="sep" />
      <button className="icon-btn" title={`${t('fit')} (F)`} onClick={requestFit}>
        <Maximize size={16} />
      </button>
    </div>
  );
}

function StatusBar() {
  const t = useT();
  const layout = useGeo((s) => s.layout);
  const busy = useGeo((s) => s.layoutBusy);
  const meshes = useGeo((s) => s.meshes);
  const st = layout?.stats;
  // Exact once every piece is built (3D view), otherwise the layout's estimate.
  const built = layout && layout.pieces.length > 0 && layout.pieces.every((p) => meshes[p.id]);
  const volume = built ? layout.pieces.reduce((a, p) => a + meshes[p.id].volume, 0) : (st?.volume ?? 0);
  const grams = volume * 1.24;
  return (
    <footer className="statusbar">
      {st && (
        <>
          <span>
            {t('statSize')} <b>{st.width.toFixed(0)} × {st.height.toFixed(0)}</b> mm
          </span>
          <span>
            {t('statCells')} <b>{st.holes + st.partial + st.mounts + (layout?.cells.filter((c) => c.kind === 'conn').length ?? 0)}</b>
          </span>
          {st.connectors > 0 && (
            <span className="hide-sm">
              {t('statConnectors')} <b>{st.connectors}</b>
            </span>
          )}
          <span>
            {t('statPanels')} <b>{st.panels}</b>
          </span>
          {st.framePieces > 0 && (
            <span className="hide-sm">
              {t('statFrame')} <b>{st.framePieces}</b>
            </span>
          )}
          <span className="hide-sm">
            <span title={t(built ? 'filamentExact' : 'filamentEstimate')}>{t('statFilament')}</span> <b>{built ? '' : '≈'}{grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams.toFixed(0)} g`}</b>
          </span>
        </>
      )}
      {busy && (
        <svg className="spin" width="12" height="12" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="40 20" />
        </svg>
      )}
      <div className="spacer" />
      {layout?.warnings.map((w) => (
        <span key={w} className="status-warn">
          <AlertTriangle size={13} />
          {t(w as Parameters<typeof t>[0])}
        </span>
      ))}
    </footer>
  );
}

export default function App() {
  useThemeAttr();
  useShortcuts();
  const t = useT();
  const view = useStore((s) => s.view);
  const placing = useStore((s) => s.placing);
  const [exporting, setExporting] = useState(false);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const toast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  }, []);
  const lang = useStore((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="app" data-drawer={drawer ?? undefined}>
      <TopBar onExport={() => setExporting(true)} toast={toast} drawer={drawer} setDrawer={setDrawer} />
      <LeftPanel />
      <main className="main">
        {view === '2d' ? (
          <Canvas2D />
        ) : (
          <Suspense fallback={null}>
            <Viewer3D />
          </Suspense>
        )}
        <CanvasToolbar />
        {placing && (
          <div className="hint-bubble">
            <Shapes size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
            {t('placeHint')}
          </div>
        )}
        {toastMsg && <div className="toast">{toastMsg}</div>}
      </main>
      <RightPanel />
      <StatusBar />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}

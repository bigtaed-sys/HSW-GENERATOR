import { Download, FileBox, FileImage, FlaskConical, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { accessoryDef } from '../geometry/accessories/defs';
import { geometry } from '../geometry/client';
import { assemblySvg } from '../export/assembly';
import { useT } from '../i18n';
import { shapeKey, useGeo } from '../model/geo';
import { useStore } from '../model/store';
import { download } from './share';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const project = useStore((s) => s.project);
  const layout = useGeo((s) => s.layout);
  const [format, setFormat] = useState<'stl' | '3mf'>('stl');
  const [include, setInclude] = useState({ panels: true, frame: true, accessories: true });
  const [progress, setProgress] = useState<{ d: number; t: number } | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => geometry.onProgress((id, d, tot) => id === jobId && setProgress({ d, t: tot })) as () => void, [jobId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasFrame = (layout?.stats.framePieces ?? 0) > 0;
  const counts = {
    panels: layout?.stats.panels ?? 0,
    frame: layout?.stats.framePieces ?? 0,
    accessories: project.accessories.length,
  };

  const run = async (testKit = false) => {
    const names: Record<string, string> = { panel: t('panelName'), frame: t('frameName') };
    for (const a of project.accessories) names[a.type] = accessoryDef(a.type)?.name[lang] ?? a.type;
    setError(null);
    setProgress({ d: 0, t: 1 });
    names.cap = names.cap ?? accessoryDef('cap')?.name[lang] ?? 'cap';
    names.hook = names.hook ?? accessoryDef('hook')?.name[lang] ?? 'hook';
    const job = geometry.export(project, format, { ...include, frame: include.frame && hasFrame }, names, testKit);
    setJobId(job.id);
    try {
      const { data, filename } = await job.promise;
      download(data as BlobPart, filename, format === '3mf' ? 'model/3mf' : 'application/zip');
    } catch (e) {
      setError(String(e));
    } finally {
      setProgress(null);
      setJobId(null);
    }
  };

  const sheet = () => {
    if (!layout) return;
    const svg = assemblySvg(project, layout, useGeo.getState().shapes, shapeKey, project.name);
    download(svg, `${project.name || 'hsw-wall'}-assembly.svg`, 'image/svg+xml');
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{t('exportTitle')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('close')}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="card kit-card">
            <div className="card-head">
              <span>
                <FlaskConical size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
                {t('testKit')}
              </span>
              <button className="btn small" onClick={() => run(true)} disabled={!!progress || !layout}>
                <Download size={13} /> {t('testKitDownload')}
              </button>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              {t('testKitHint')}
            </p>
          </div>
          <div className="option-list" style={{ marginBottom: 16 }}>
            {(['stl', '3mf'] as const).map((f) => (
              <label key={f} className={`option ${format === f ? 'on' : ''}`}>
                <input type="radio" checked={format === f} onChange={() => setFormat(f)} />
                <FileBox size={16} />
                {f === 'stl' ? t('formatStl') : t('format3mf')}
              </label>
            ))}
          </div>
          <h3 className="section-title">{t('include')}</h3>
          <div className="option-list">
            {(['panels', 'frame', 'accessories'] as const).map((k) => (
              <label key={k} className={`option ${include[k] && counts[k] ? 'on' : ''}`} style={!counts[k] ? { opacity: 0.5 } : undefined}>
                <input
                  type="checkbox"
                  disabled={!counts[k]}
                  checked={include[k] && counts[k] > 0}
                  onChange={(e) => setInclude({ ...include, [k]: e.target.checked })}
                />
                {t(k === 'panels' ? 'includePanels' : k === 'frame' ? 'includeFrame' : 'includeAccessories')}
                <small>{counts[k]}</small>
              </label>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            {t('exportNote')}
          </p>
          {error && <p className="hint" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={sheet} disabled={!layout}>
            <FileImage size={15} /> {t('assemblySheet')}
          </button>
          <div className="spacer" />
          <button className="btn primary" onClick={() => run()} disabled={!!progress || !layout}>
            {progress ? (
              t('exporting', { d: progress.d, t: progress.t })
            ) : (
              <>
                <Download size={15} /> {t('download')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

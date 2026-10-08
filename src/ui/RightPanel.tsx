import { AlertTriangle, Box, CheckCircle2, Copy, MousePointerClick, RotateCw, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ACCESSORIES, accessoryDef, defaultParams } from '../geometry/accessories/defs';
import { useT, type TKey } from '../i18n';
import { PALETTE } from '../model/defaults';
import { ensureShape, shapeKey, useGeo } from '../model/geo';
import { cellIndex, isPlacementValid } from '../model/placement';
import { uid, useStore } from '../model/store';
import type { Accessory, CustomModel } from '../model/types';
import { Section, Slider, Swatches } from './controls';

export function RightPanel() {
  const t = useT();
  const tab = useStore((s) => s.rightTab);
  const sel = useStore((s) => s.selection);
  const setUi = useStore((s) => s.setUi);
  const hasSel = sel?.kind === 'accessory' || sel?.kind === 'model';
  return (
    <aside className="right">
      <nav className="tabs">
        <button className={`tab ${tab === 'library' ? 'on' : ''}`} onClick={() => setUi({ rightTab: 'library' })}>
          <Box size={16} />
          {t('library')}
        </button>
        <button className={`tab ${tab === 'inspector' ? 'on' : ''}`} onClick={() => setUi({ rightTab: 'inspector' })}>
          <MousePointerClick size={16} />
          {t('inspector')}
        </button>
      </nav>
      <div className="panel-scroll">{tab === 'library' ? <Library /> : hasSel ? <Inspector /> : <EmptyInspector />}</div>
    </aside>
  );
}

function EmptyInspector() {
  const t = useT();
  return (
    <div className="empty">
      <MousePointerClick size={28} />
      <div>{t('nothingSelected')}</div>
    </div>
  );
}

/** Side-view silhouette of an accessory, computed by the geometry worker. */
export function ShapeThumb({ type, params, color }: { type: string; params: Record<string, number>; color?: string }) {
  const key = shapeKey(type, params);
  const shape = useGeo((s) => s.shapes[key]);
  useEffect(() => ensureShape(type, params), [type, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useMemo(() => {
    if (!shape) return null;
    const pts = shape.side.flat();
    if (!pts.length) return null;
    // Side view: x = -z (towards wall on the left), y = up.
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.12;
    const d = shape.side.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join('L') + 'Z').join('');
    return { d, vb: `${x0 - pad} ${-y1 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}` };
  }, [shape]);
  if (!view) return <div className="lib-thumb" />;
  return (
    <div className="lib-thumb">
      <svg width="100%" height="56" viewBox={view.vb} preserveAspectRatio="xMidYMid meet">
        <path d={view.d} fill={color ?? 'currentColor'} fillOpacity={color ? 1 : 0.85} fillRule="evenodd" />
      </svg>
    </div>
  );
}

const CATS: { id: string; label: TKey }[] = [
  { id: 'all', label: 'catAll' },
  { id: 'hooks', label: 'catHooks' },
  { id: 'storage', label: 'catStorage' },
  { id: 'tools', label: 'catTools' },
  { id: 'misc', label: 'catMisc' },
];

function Library() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const placing = useStore((s) => s.placing);
  const setUi = useStore((s) => s.setUi);
  const [cat, setCat] = useState('all');
  const items = ACCESSORIES.filter((a) => cat === 'all' || a.category === cat);
  return (
    <>
      <Section>
        <div className="chips" style={{ marginBottom: 12 }}>
          {CATS.map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
              {t(c.label)}
            </button>
          ))}
        </div>
        <div className="lib-grid">
          {items.map((a) => (
            <button
              key={a.type}
              className={`lib-card ${placing === a.type ? 'on' : ''}`}
              onClick={() => setUi({ placing: placing === a.type ? null : a.type, tool: 'select', selection: null })}
              title={a.desc[lang]}
            >
              <ShapeThumb type={a.type} params={defaultParams(a.type)} />
              <span className="lib-name">{a.name[lang]}</span>
              <span className="lib-desc">{a.desc[lang]}</span>
            </button>
          ))}
        </div>
        {placing && <p className="hint">{t('placeHint')}</p>}
      </Section>
      <div className="divider" />
      <MyModels />
    </>
  );
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function MyModels() {
  const t = useT();
  const models = useStore((s) => s.project.customModels);
  const sel = useStore((s) => s.selection);
  const update = useStore((s) => s.update);
  const setUi = useStore((s) => s.setUi);
  const onFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    const id = uid();
    const m: CustomModel = {
      id,
      name: f.name.replace(/\.stl$/i, ''),
      stl: toBase64(buf),
      c: 0,
      r: 0,
      rot: [0, 0, 0],
      offset: [0, 0, 0],
      color: PALETTE[3],
    };
    update((p) => void p.customModels.push(m));
    setUi({ selection: { kind: 'model', id }, rightTab: 'inspector' });
  };
  return (
    <Section title={t('myModels')}>
      <label className="upload">
        <Upload size={15} /> {t('uploadStl')}
        <input
          type="file"
          accept=".stl"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </label>
      <p className="hint">{t('uploadHint')}</p>
      {models.map((m) => (
        <div
          key={m.id}
          className={`model-row ${sel?.kind === 'model' && sel.id === m.id ? 'on' : ''}`}
          onClick={() => setUi({ selection: { kind: 'model', id: m.id }, rightTab: 'inspector' })}
        >
          <i className="dot" style={{ background: m.color }} />
          <span>{m.name}</span>
        </div>
      ))}
    </Section>
  );
}

function Inspector() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const sel = useStore((s) => s.selection)!;
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  const setUi = useStore((s) => s.setUi);
  const layout = useGeo((s) => s.layout);
  const index = useMemo(() => cellIndex(layout), [layout]);

  if (sel.kind === 'model') {
    const m = project.customModels.find((x) => x.id === sel.id);
    if (!m) return <EmptyInspector />;
    const edit = (fn: (x: CustomModel) => void, transient?: boolean) =>
      update((p) => {
        const x = p.customModels.find((q) => q.id === m.id);
        if (x) fn(x);
      }, { transient });
    return (
      <>
        <Section title={m.name}>
          <span className="mini-label">{t('rotation')}</span>
          <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 14 }}>
            {(['X', 'Y', 'Z'] as const).map((ax, i) => (
              <button key={ax} className="btn small" onClick={() => edit((x) => void (x.rot[i] = (x.rot[i] + 1) % 4))}>
                <RotateCw size={13} /> {ax} · {m.rot[i] * 90}°
              </button>
            ))}
          </div>
          {(['X', 'Y', 'Z'] as const).map((ax, i) => (
            <Slider
              key={ax}
              label={`${t('offset')} ${ax}`}
              value={m.offset[i]}
              min={-100}
              max={100}
              step={0.5}
              onChange={(v, tr) => edit((x) => void (x.offset[i] = v), tr)}
            />
          ))}
        </Section>
        <Section title={t('color')}>
          <Swatches value={m.color} onChange={(v) => edit((x) => void (x.color = v))} />
        </Section>
        <button
          className="btn danger block"
          onClick={() => {
            update((p) => void (p.customModels = p.customModels.filter((q) => q.id !== m.id)));
            setUi({ selection: null });
          }}
        >
          <Trash2 size={14} /> {t('delete')}
        </button>
      </>
    );
  }

  const a = project.accessories.find((x) => x.id === sel.id);
  const def = a && accessoryDef(a.type);
  if (!a || !def) return <EmptyInspector />;
  const valid = isPlacementValid(a, index, project.accessories);
  const edit = (fn: (x: Accessory) => void, transient?: boolean) =>
    update((p) => {
      const x = p.accessories.find((q) => q.id === a.id);
      if (x) fn(x);
    }, { transient });

  return (
    <>
      <Section title={def.name[lang]}>
        <ShapeThumb type={a.type} params={a.params} color={a.color} />
        <div className={`status-pill ${valid ? 'ok' : 'bad'}`} style={{ marginTop: 10 }}>
          {valid ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {valid ? t('validPlacement') : t('invalidPlacement')}
        </div>
        {def.params.map((p) => (
          <Slider
            key={p.key}
            label={p.label[lang]}
            value={a.params[p.key] ?? p.def}
            min={p.min}
            max={p.max}
            step={p.step}
            unit={p.unit}
            onChange={(v, tr) => edit((x) => void (x.params[p.key] = v), tr)}
          />
        ))}
      </Section>
      <Section title={t('color')}>
        <Swatches value={a.color} onChange={(v) => edit((x) => void (x.color = v))} />
      </Section>
      <div className="grid2">
        <button
          className="btn"
          onClick={() => {
            const id = uid();
            update((p) => void p.accessories.push({ ...structuredClone(a), id, c: a.c + 2 }));
            setUi({ selection: { kind: 'accessory', id } });
          }}
        >
          <Copy size={14} /> {t('duplicate')}
        </button>
        <button
          className="btn danger"
          onClick={() => {
            update((p) => void (p.accessories = p.accessories.filter((q) => q.id !== a.id)));
            setUi({ selection: null });
          }}
        >
          <Trash2 size={14} /> {t('delete')}
        </button>
      </div>
    </>
  );
}


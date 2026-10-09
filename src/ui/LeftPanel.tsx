import { Frame, Hexagon, Plus, Printer, Scissors, Square, Trash2, Grid3x3, Crosshair } from 'lucide-react';
import type { ReactNode } from 'react';
import { PITCH_X, PITCH_Y } from '../geometry/constants';
import { useT, type TKey } from '../i18n';
import { PRINTERS } from '../model/defaults';
import { useGeo } from '../model/geo';
import { uid, useStore } from '../model/store';
import type { WallShape } from '../model/types';
import { OUTLINE_PRESETS, presetPoints, scalePoints } from '../model/outlines';
import { FRAME_STYLES, frameStyle, frameStyleParams } from '../geometry/frames/styles';
import { FRAME_PRESETS } from '../model/framePresets';
import { NumberInput, ParamControl, Section, Segmented, Slider, Swatches, Toggle, useBind } from './controls';

type Tab = 'wall' | 'frame' | 'grid' | 'cutouts' | 'print';

const TABS: { id: Tab; icon: ReactNode; label: TKey }[] = [
  { id: 'wall', icon: <Square size={16} />, label: 'tabWall' },
  { id: 'frame', icon: <Frame size={16} />, label: 'tabFrame' },
  { id: 'grid', icon: <Hexagon size={16} />, label: 'tabGrid' },
  { id: 'cutouts', icon: <Scissors size={16} />, label: 'tabCutouts' },
  { id: 'print', icon: <Printer size={16} />, label: 'tabPrint' },
];

export function LeftPanel() {
  const t = useT();
  const tab = useStore((s) => s.leftTab);
  const setUi = useStore((s) => s.setUi);
  return (
    <aside className="left">
      <nav className="tabs">
        {TABS.map((x) => (
          <button key={x.id} className={`tab ${tab === x.id ? 'on' : ''}`} onClick={() => setUi({ leftTab: x.id })}>
            {x.icon}
            {t(x.label)}
          </button>
        ))}
      </nav>
      <div className="panel-scroll">
        {tab === 'wall' && <WallTab />}
        {tab === 'frame' && <FrameTab />}
        {tab === 'grid' && <GridTab />}
        {tab === 'cutouts' && <CutoutsTab />}
        {tab === 'print' && <PrintTab />}
      </div>
    </aside>
  );
}

function ShapeIcon({ shape }: { shape: WallShape }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 };
  return (
    <svg width="44" height="30" viewBox="0 0 44 30">
      {shape === 'rect' && <rect x="3" y="3" width="38" height="24" rx="4" {...common} />}
      {shape === 'hexagon' && <path d="M3 15 L11 3 H33 L41 15 L33 27 H11 Z" strokeLinejoin="round" {...common} />}
      {shape === 'ellipse' && <ellipse cx="22" cy="15" rx="19" ry="12" {...common} />}
      {shape === 'custom' && <path d="M3 27 V3 H22 V14 H41 V27 Z" strokeLinejoin="round" {...common} />}
      {shape === 'honeycomb' && (
        <path
          d="M4 9 L8 3 H14 L18 9 L14 15 L18 21 L14 27 H8 L4 21 L8 15 Z M18 9 H24 L28 3 H34 L38 9 L34 15 L38 21 L34 27 H28 L24 21 H18"
          strokeLinejoin="round"
          {...common}
        />
      )}
    </svg>
  );
}

function WallTab() {
  const t = useT();
  const wall = useStore((s) => s.project.wall);
  const update = useStore((s) => s.update);
  const bind = useBind();
  const shapes: { id: WallShape; label: TKey }[] = [
    { id: 'rect', label: 'shapeRect' },
    { id: 'hexagon', label: 'shapeHexagon' },
    { id: 'ellipse', label: 'shapeEllipse' },
    { id: 'honeycomb', label: 'shapeHoneycomb' },
    { id: 'custom', label: 'shapeCustom' },
  ];
  const lang = useStore((s) => s.lang);
  const setUi = useStore((s) => s.setUi);
  const presets: [number, number][] = [
    [500, 400],
    [800, 500],
    [1000, 600],
    [1200, 800],
    [1600, 900],
  ];
  return (
    <>
      <Section title={t('shape')}>
        <div className="shape-grid">
          {shapes.map((s) => (
            <button
              key={s.id}
              className={`shape-card ${wall.shape === s.id ? 'on' : ''}`}
              onClick={() => {
                update((p) => {
                  p.wall.shape = s.id;
                  if (s.id === 'custom' && (p.wall.points?.length ?? 0) < 3) p.wall.points = presetPoints('rect', p.wall.width, p.wall.height);
                });
                if (s.id === 'custom') setUi({ tool: 'outline', placing: null });
              }}
            >
              <ShapeIcon shape={s.id} />
              {t(s.label)}
            </button>
          ))}
        </div>
        {wall.shape === 'honeycomb' && <p className="hint">{t('honeycombHint')}</p>}
      </Section>
      {wall.shape === 'custom' && (
        <Section title={t('outlineTemplates')}>
          <div className="chips">
            {OUTLINE_PRESETS.map((o) => (
              <button
                key={o.id}
                className="chip"
                onClick={() => {
                  update((p) => void (p.wall.points = presetPoints(o.id, p.wall.width, p.wall.height)));
                  setUi({ tool: 'outline', placing: null });
                }}
              >
                {o.name[lang]}
              </button>
            ))}
          </div>
          <p className="hint">{t('outlineHint')}</p>
        </Section>
      )}
      <Section title={t('width') + ' × ' + t('height')}>
        <Slider
          label={t('width')}
          value={wall.width}
          min={150}
          max={3000}
          step={5}
          inputMax={6000}
          onChange={bind((p, v) => {
            p.wall.width = v;
            if (p.wall.shape === 'custom' && p.wall.points.length >= 3) p.wall.points = scalePoints(p.wall.points, v, p.wall.height);
          })}
        />
        <Slider
          label={t('height')}
          value={wall.height}
          min={150}
          max={2500}
          step={5}
          inputMax={6000}
          onChange={bind((p, v) => {
            p.wall.height = v;
            if (p.wall.shape === 'custom' && p.wall.points.length >= 3) p.wall.points = scalePoints(p.wall.points, p.wall.width, v);
          })}
        />
        {wall.shape !== 'honeycomb' && (
          <Slider
            label={t('cornerRadius')}
            value={wall.cornerRadius}
            min={0}
            max={Math.min(200, Math.min(wall.width, wall.height) / 2)}
            onChange={bind((p, v) => (p.wall.cornerRadius = v))}
          />
        )}
      </Section>
      <Section title={t('sizePresets')}>
        <div className="chips">
          {presets.map(([w, h]) => (
            <button
              key={`${w}x${h}`}
              className={`chip ${wall.width === w && wall.height === h ? 'on' : ''}`}
              onClick={() =>
                update((p) => {
                  p.wall.width = w;
                  p.wall.height = h;
                  if (p.wall.shape === 'custom' && p.wall.points.length >= 3) p.wall.points = scalePoints(p.wall.points, w, h);
                })
              }
            >
              {w}×{h}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

const LED_COLORS = ['#ffc27a', '#fff1dc', '#dfe9ff', '#ff6fae', '#ff3b3b', '#3b82ff', '#30e08a', '#b35cff'];

/** Strip length, preview switch and light colour; shown whenever the frame takes a strip. */
function LedExtras() {
  const t = useT();
  const led = useGeo((s) => s.layout?.led);
  const color = useStore((s) => s.project.frame.led.color);
  const sim = useStore((s) => s.ledSim);
  const update = useStore((s) => s.update);
  const setUi = useStore((s) => s.setUi);
  if (!led) return null;
  return (
    <>
      <p className="hint" style={{ marginBottom: 10 }}>
        {t(led.kind === 'inside' ? 'ledInsideHint' : 'ledLength')} <b>≈{(led.length / 1000).toFixed(2)} m</b>
      </p>
      <Toggle label={t('ledSim')} checked={sim} onChange={(v) => setUi({ ledSim: v, ...(v ? { view: '3d' as const } : {}) })} />
      <Swatches palette={LED_COLORS} value={color} onChange={(v) => update((p) => void (p.frame.led.color = v))} />
    </>
  );
}

function FrameTab() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const frame = useStore((s) => s.project.frame);
  const shape = useStore((s) => s.project.wall.shape);
  const color = useStore((s) => s.project.colors.frame);
  const update = useStore((s) => s.update);
  const bind = useBind();
  if (shape === 'honeycomb') return <p className="hint">{t('frameDisabled')}</p>;
  const has = frame.width > 0;
  const style = frameStyle(frame.style);
  const params = frameStyleParams(frame);
  const setParam = (key: string) => (v: number, transient?: boolean) =>
    update((p) => {
      const id = p.frame.style;
      p.frame.styleParams[id] = { ...p.frame.styleParams[id], [key]: v };
    }, { transient });
  return (
    <>
      <Section title={t('framePresets')}>
        <div className="chips">
          {FRAME_PRESETS.map((fp) => (
            <button key={fp.id} className="chip" onClick={() => update((p) => fp.apply(p.frame))}>
              {t(fp.name as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('tabFrame')}>
        <Slider label={t('frameWidth')} value={frame.width} min={0} max={80} onChange={bind((p, v) => (p.frame.width = v))} />
        {!has && <p className="hint">{t('frameNone')}</p>}
        {has && (
          <>
            <Segmented
              value={frame.mode}
              onChange={(v) => update((p) => void (p.frame.mode = v))}
              options={[
                { value: 'separate', label: t('frameSeparate') },
                { value: 'integrated', label: t('frameIntegrated') },
              ]}
            />
            <p className="hint">{frame.mode === 'integrated' ? t('frameIntegratedHint') : t('frameSeparateHint')}</p>
          </>
        )}
      </Section>
      {has && (
        <>
          <Section title={t('frameStyle')}>
            <div className="shape-grid">
              {FRAME_STYLES.map((st) => (
                <button
                  key={st.id}
                  className={`shape-card ${frame.style === st.id ? 'on' : ''}`}
                  onClick={() =>
                    update((p) => {
                      p.frame.style = st.id;
                      // Relief styles need room: widen a narrow frame to the style's width.
                      if (st.minWidth && p.frame.width < st.minWidth) p.frame.width = st.width ?? st.minWidth;
                    })
                  }
                >
                  <svg width="44" height="30" viewBox="0 0 20 20">
                    <path d={st.icon} fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                  </svg>
                  {st.name[lang]}
                </button>
              ))}
            </div>
          </Section>
          <Section title={style.name[lang]}>
            {style.params.map((pd) => (
              <ParamControl key={pd.key} def={pd} value={params[pd.key]} lang={lang} onChange={setParam(pd.key)} />
            ))}
            {style.minWidth && frame.width < style.minWidth && (
              <p className="hint warn">{t('styleTooNarrow').replace('{w}', String(style.minWidth))}</p>
            )}
            {style.note && <p className="hint">{style.note[lang]}</p>}
          </Section>
          <Section title={t('frameFit')}>
            <Slider label={t('proud')} value={frame.proud} min={0} max={12} step={0.5} onChange={bind((p, v) => (p.frame.proud = v))} />
            {frame.mode === 'separate' && <Slider label={t('lip')} value={frame.lip} min={0} max={10} step={0.5} onChange={bind((p, v) => (p.frame.lip = v))} />}
            {frame.mode === 'integrated' ? null : frame.lip > 0 && frame.proud < 1 ? (
              <p className="hint warn" style={{ marginTop: -4, marginBottom: 12 }}>{t('lipNeedsProud')}</p>
            ) : (
              <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>{t('lipHint')}</p>
            )}
            <Segmented
              value={frame.innerProfile}
              onChange={(v) => update((p) => void (p.frame.innerProfile = v))}
              options={[
                { value: 'chamfer', label: t('innerEdgeChamfer') },
                { value: 'round', label: t('innerEdgeRound') },
              ]}
            />
            <div style={{ height: 12 }} />
            <Slider
              label={frame.innerProfile === 'round' ? t('innerRadius') : t('innerChamfer')}
              value={frame.innerChamfer}
              min={0}
              max={Math.max(1, Math.min(8, frame.proud + 2))}
              step={0.2}
              onChange={bind((p, v) => (p.frame.innerChamfer = v))}
            />
          </Section>
          {frame.mode === 'separate' && frame.style === 'lit' && (
            <Section title={t('frameJoints')}>
              <Toggle label={t('frameScrews')} checked={frame.screws} onChange={(v) => update((p) => void (p.frame.screws = v))} />
              <p className="hint">{t('jointsLitHint')}</p>
            </Section>
          )}
          {frame.mode === 'separate' && frame.style !== 'lit' && <Section title={t('frameJoints')}>
            <Segmented
              value={frame.joint}
              onChange={(v) => update((p) => void (p.frame.joint = v))}
              options={[
                { value: 'none', label: t('jointNone') },
                { value: 'lap', label: t('jointLap') },
              ]}
            />
            <div style={{ height: 12 }} />
            {frame.joint === 'lap' && (
              <Slider label={t('jointLength')} value={frame.jointLength} min={20} max={80} onChange={bind((p, v) => (p.frame.jointLength = v))} />
            )}
            <Toggle label={t('frameScrews')} checked={frame.screws} onChange={(v) => update((p) => void (p.frame.screws = v))} />
            <p className="hint">{t('frameJointHint')}</p>
          </Section>}
          {frame.mode === 'integrated' && (
            <Section>
              <Toggle label={t('frameScrews')} checked={frame.screws} onChange={(v) => update((p) => void (p.frame.screws = v))} />
            </Section>
          )}
          <Section title={t('ledTitle')}>
            <Segmented
              value={frame.led.mode}
              onChange={(v) => update((p) => void (p.frame.led.mode = v))}
              options={[
                { value: 'none', label: t('ledNone') },
                { value: 'front', label: t('ledFront') },
                { value: 'halo', label: t('ledHalo') },
              ]}
            />
            <p className="hint" style={{ marginBottom: 12 }}>
              {frame.led.mode === 'front' ? t('ledFrontHint') : frame.led.mode === 'halo' ? t('ledHaloHint') : t('ledNoneHint')}
            </p>
            {frame.led.mode !== 'none' && (
              <>
                <Slider label={t('ledWidth')} value={frame.led.width} min={5} max={30} step={0.5} onChange={bind((p, v) => (p.frame.led.width = v))} />
                <Slider label={t('ledDepth')} value={frame.led.depth} min={1} max={8} step={0.5} onChange={bind((p, v) => (p.frame.led.depth = v))} />
                {frame.led.mode === 'front' && (
                  <Toggle label={t('ledWire')} checked={frame.led.wire} onChange={(v) => update((p) => void (p.frame.led.wire = v))} />
                )}
                {frame.led.width > frame.width - 3 && <p className="hint warn">{t('ledTooWide')}</p>}
              </>
            )}
            <LedExtras />
          </Section>
          {frame.mode === 'separate' && (
            <Section title={t('frameColor')}>
              <Swatches value={color} onChange={(v) => update((p) => void (p.colors.frame = v))} />
            </Section>
          )}
        </>
      )}
    </>
  );
}

function GridTab() {
  const t = useT();
  const grid = useStore((s) => s.project.grid);
  const mount = useStore((s) => s.project.mount);
  const colors = useStore((s) => s.project.colors);
  const color = colors.panel;
  const update = useStore((s) => s.update);
  const bind = useBind();
  return (
    <>
      <Section title={t('cellMode')}>
        <Segmented
          value={grid.mode}
          onChange={(v) => update((p) => void (p.grid.mode = v))}
          options={[
            { value: 'whole', label: t('modeWhole') },
            { value: 'partial', label: t('modePartial') },
          ]}
        />
        <div style={{ height: 12 }} />
        <Slider label={t('minEdge')} value={grid.minEdge} min={0.8} max={12} step={0.1} onChange={bind((p, v) => (p.grid.minEdge = v))} />
        {grid.mode === 'partial' && (
          <Slider
            label={t('minPartial')}
            value={Math.round(grid.minPartial * 100)}
            min={5}
            max={95}
            unit="%"
            onChange={bind((p, v) => (p.grid.minPartial = v / 100))}
          />
        )}
      </Section>
      <Section
        title={t('alignment')}
        action={
          <button className="btn small ghost" onClick={() => update((p) => void ((p.grid.offsetX = 0), (p.grid.offsetY = 0)))}>
            <Crosshair size={13} /> {t('recenter')}
          </button>
        }
      >
        <Slider label={t('offsetX')} value={grid.offsetX} min={-PITCH_X} max={PITCH_X} step={0.1} onChange={bind((p, v) => (p.grid.offsetX = v))} />
        <Slider label={t('offsetY')} value={grid.offsetY} min={-PITCH_Y / 2} max={PITCH_Y / 2} step={0.1} onChange={bind((p, v) => (p.grid.offsetY = v))} />
        <Toggle label={t('flipStagger')} checked={grid.flipStagger} onChange={(v) => update((p) => void (p.grid.flipStagger = v))} />
      </Section>
      <Section title={t('panelColor')}>
        <Swatches value={color} onChange={(v) => update((p) => void (p.colors.panel = v))} />
      </Section>
      <div className="divider" />
      <Section title={t('mounting')}>
        <Segmented
          value={mount.mode}
          onChange={(v) => update((p) => void (p.mount.mode = v))}
          options={[
            { value: 'connectors', label: t('modeConnectors') },
            { value: 'cells', label: t('modeCells') },
          ]}
        />
        <p className="hint" style={{ marginBottom: 12 }}>
          {mount.mode === 'connectors' ? t('connectorsHint') : t('cellsHint')}
        </p>
        {mount.mode === 'connectors' ? (
          <>
            <Toggle label={t('connJunctions')} checked={mount.junctions} onChange={(v) => update((p) => void (p.mount.junctions = v))} />
            <Toggle label={t('connSeams')} checked={mount.seams} onChange={(v) => update((p) => void (p.mount.seams = v))} />
            {mount.seams && (
              <Slider label={t('connectorSpacing')} value={mount.spacing} min={60} max={400} step={5} onChange={bind((p, v) => (p.mount.spacing = v))} />
            )}
            <Toggle label={t('connEdges')} checked={mount.edges} onChange={(v) => update((p) => void (p.mount.edges = v))} />
            {mount.edges && (
              <Slider label={t('connEdgeSpacing')} value={mount.edgeSpacing} min={80} max={500} step={10} onChange={bind((p, v) => (p.mount.edgeSpacing = v))} />
            )}
            <Slider label={t('connMinPerPanel')} value={mount.minPerPanel} min={0} max={4} unit="" onChange={bind((p, v) => (p.mount.minPerPanel = v))} />
            <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>
              {t('connManualHint')}
            </p>
          </>
        ) : (
          <>
            <Slider label={t('mountsPerPanel')} value={mount.perPanel} min={0} max={6} unit="" onChange={bind((p, v) => (p.mount.perPanel = v))} />
            <Slider label={t('floor')} value={mount.floor} min={1.2} max={5} step={0.2} onChange={bind((p, v) => (p.mount.floor = v))} />
          </>
        )}
        <Slider label={t('screwDiameter')} value={mount.screwDiameter} min={2.5} max={6} step={0.5} onChange={bind((p, v) => (p.mount.screwDiameter = v))} />
        <Slider label={t('headDiameter')} value={mount.headDiameter} min={5} max={14} step={0.5} onChange={bind((p, v) => (p.mount.headDiameter = v))} />
        {mount.mode === 'connectors' && (
          <div className="field">
            <div className="field-head">
              <span>{t('connectorColor')}</span>
            </div>
            <Swatches value={colors.connector} onChange={(v) => update((p) => void (p.colors.connector = v))} />
          </div>
        )}
        <p className="hint">
          <Grid3x3 size={12} style={{ verticalAlign: -2 }} /> {t('cellToolsHint')}
        </p>
      </Section>
    </>
  );
}

function CutoutsTab() {
  const t = useT();
  const cutouts = useStore((s) => s.project.cutouts);
  const sel = useStore((s) => s.selection);
  const update = useStore((s) => s.update);
  const setUi = useStore((s) => s.setUi);
  const add = (w: number, h: number, r: number) => {
    const id = uid();
    update((p) => void p.cutouts.push({ id, x: 0, y: 0, w, h, r, rim: 4, chamfer: 1 }));
    setUi({ selection: { kind: 'cutout', id } });
  };
  return (
    <>
      <Section title={t('cutouts')}>
        <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          {t('cutoutsHint')}
        </p>
        <div className="grid2">
          <button className="btn" onClick={() => add(86, 86, 10)}>
            <Plus size={14} /> {t('addSocket')}
          </button>
          <button className="btn" onClick={() => add(120, 60, 6)}>
            <Plus size={14} /> {t('addCustom')}
          </button>
        </div>
      </Section>
      {!cutouts.length && <p className="hint">{t('noCutouts')}</p>}
      {cutouts.map((c, i) => {
        const set = (k: keyof typeof c) => (v: number) =>
          update((p) => {
            const x = p.cutouts.find((q) => q.id === c.id);
            if (x) (x[k] as number) = v;
          });
        const on = sel?.kind === 'cutout' && sel.id === c.id;
        return (
          <div
            key={c.id}
            className="card"
            style={on ? { borderColor: 'var(--accent)' } : undefined}
            onClick={() => setUi({ selection: { kind: 'cutout', id: c.id } })}
          >
            <div className="card-head">
              <span>
                {t('cutout')} {i + 1}
              </span>
              <button
                className="icon-btn"
                title={t('delete')}
                onClick={(e) => {
                  e.stopPropagation();
                  update((p) => void (p.cutouts = p.cutouts.filter((q) => q.id !== c.id)));
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="grid2">
              {(
                [
                  ['x', 'posX', -3000, 3000],
                  ['y', 'posY', -3000, 3000],
                  ['w', 'width', 10, 2000],
                  ['h', 'height', 10, 2000],
                  ['r', 'radius', 0, 500],
                  ['rim', 'rim', 0, 40],
                  ['chamfer', 'chamfer', 0, 5],
                ] as const
              ).map(([k, label, min, max]) => (
                <div key={k}>
                  <span className="mini-label">{t(label)}</span>
                  <NumberInput value={c[k]} min={min} max={max} step={k === 'chamfer' ? 0.1 : 1} unit="mm" onCommit={set(k)} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function PrintTab() {
  const t = useT();
  const printer = useStore((s) => s.project.printer);
  const update = useStore((s) => s.update);
  const bind = useBind();
  const layout = useGeo((s) => s.layout);
  const pieces = layout?.pieces ?? [];
  const grams = (layout?.stats.volume ?? 0) * 1.24;
  return (
    <>
      <Section title={t('printer')}>
        <select
          className="select"
          value={printer.preset}
          onChange={(e) => {
            const pr = PRINTERS.find((x) => x.id === e.target.value)!;
            update((p) => {
              p.printer.preset = pr.id;
              if (pr.id !== 'custom') {
                p.printer.bedW = pr.w;
                p.printer.bedH = pr.h;
              }
            });
          }}
        >
          {PRINTERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === 'custom' ? '—' : `${p.name} · ${p.w}×${p.h}`}
            </option>
          ))}
        </select>
        <div style={{ height: 12 }} />
        <Slider
          label={t('bedWidth')}
          value={printer.bedW}
          min={100}
          max={500}
          onChange={bind((p, v) => ((p.printer.bedW = v), (p.printer.preset = 'custom')))}
        />
        <Slider
          label={t('bedDepth')}
          value={printer.bedH}
          min={100}
          max={500}
          onChange={bind((p, v) => ((p.printer.bedH = v), (p.printer.preset = 'custom')))}
        />
        <Slider label={t('margin')} value={printer.margin} min={0} max={20} onChange={bind((p, v) => (p.printer.margin = v))} />
      </Section>
      <Section title={t('fitTitle')}>
        <Slider
          label={t('holeTolerance')}
          value={printer.holeTolerance}
          min={-0.4}
          max={0.6}
          step={0.05}
          onChange={bind((p, v) => (p.printer.holeTolerance = v))}
        />
        <Slider
          label={t('insertTolerance')}
          value={printer.insertTolerance}
          min={-0.4}
          max={0.4}
          step={0.05}
          onChange={bind((p, v) => (p.printer.insertTolerance = v))}
        />
        <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>
          {t('fitHint')}
        </p>
        <Toggle label={t('engrave')} checked={printer.engrave} onChange={(v) => update((p) => void (p.printer.engrave = v))} />
      </Section>
      <Section title={t('filament')}>
        <div className="big-stat">
          {grams >= 1000 ? (grams / 1000).toFixed(2) : grams.toFixed(0)}
          <small>{grams >= 1000 ? 'kg' : 'g'} PLA</small>
        </div>
        <p className="hint">{t('filamentHint')}</p>
      </Section>
      <Section title={`${t('pieces')} · ${pieces.length}`}>
        <div className="piece-list">
          {pieces.map((p) => (
            <div className="piece-row" key={p.id}>
              <span className="tag">{p.label}</span>
              <span>
                {p.printSize[0].toFixed(0)}×{p.printSize[1].toFixed(0)} mm
              </span>
              {p.printAngle === null ? (
                <span className="badge bad">{t('tooBig')}</span>
              ) : (
                <span className="badge ok">{p.printAngle ? t('rotated', { a: p.printAngle }) : t('fits')}</span>
              )}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

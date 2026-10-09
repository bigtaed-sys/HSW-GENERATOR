import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultParams } from '../geometry/accessories/defs';
import { HOLE, HOLE_FRONT } from '../geometry/constants';
import { cellAt, cellCenter, hexagon, type Vec2 } from '../geometry/lattice';
import type { Layout } from '../geometry/layoutTypes';
import { useT } from '../i18n';
import { PALETTE } from '../model/defaults';
import { shapeKey, useGeo } from '../model/geo';
import { cellIndex, isPlacementValid } from '../model/placement';
import { uid, useStore } from '../model/store';
import { cellKey } from '../model/types';
import { isDark, mix } from './color';
import { preparedModel } from './customModel';

type ViewT = { s: number; tx: number; ty: number };

const pathOf = (polys: Vec2[][]) =>
  polys.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L') + 'Z').join('');

const hexPath = (flat: number, x: number, y: number) => pathOf([hexagon(flat, x, y)]);

const circlePath = (x: number, y: number, r: number) =>
  `M${(x - r).toFixed(2)},${y.toFixed(2)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;

export function fitView(layout: Layout | null, w: number, h: number): ViewT {
  const ow = layout?.stats.width || 900;
  const oh = layout?.stats.height || 600;
  const s = Math.min((w - 120) / ow, (h - 140) / oh);
  return { s: Math.max(0.05, s), tx: w / 2, ty: h / 2 };
}

export const requestFit = () => {
  window.dispatchEvent(new Event('hsw-fit'));
};

export function Canvas2D() {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<ViewT | null>(null);
  const [hover, setHover] = useState<{ c: number; r: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const layout = useGeo((s) => s.layout);
  const shapes = useGeo((s) => s.shapes);
  const project = useStore((s) => s.project);
  const tool = useStore((s) => s.tool);
  const placing = useStore((s) => s.placing);
  const selection = useStore((s) => s.selection);
  const showPanels = useStore((s) => s.showPanels);
  const showAcc = useStore((s) => s.showAccessories);
  const update = useStore((s) => s.update);
  const checkpoint = useStore((s) => s.checkpoint);
  const setUi = useStore((s) => s.setUi);
  const index = useMemo(() => cellIndex(layout), [layout]);

  // Track container size.
  useEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit on first layout and on demand.
  const fitted = useRef(false);
  useEffect(() => {
    if (layout && !fitted.current && size.w > 0) {
      fitted.current = true;
      setView(fitView(layout, size.w, size.h));
    }
  }, [layout, size]);
  useEffect(() => {
    const onFit = () => setView(fitView(useGeo.getState().layout, size.w, size.h));
    window.addEventListener('hsw-fit', onFit);
    return () => window.removeEventListener('hsw-fit', onFit);
  }, [size]);

  const v = view ?? fitView(layout, size.w, size.h);
  const toWorld = useCallback(
    (clientX: number, clientY: number): Vec2 => {
      const r = svgRef.current!.getBoundingClientRect();
      return [(clientX - r.left - v.tx) / v.s, -(clientY - r.top - v.ty) / v.s];
    },
    [v],
  );

  // ---- Static geometry paths -------------------------------------------------
  const colors = project.colors;
  const panelDark = isDark(colors.panel);
  const geo = useMemo(() => {
    if (!layout) return null;
    let openings = '',
      bores = '',
      mounts = '',
      screws = '',
      solids = '';
    for (const c of layout.cells) {
      if (c.kind === 'hole' || c.kind === 'mount') {
        openings += hexPath(HOLE_FRONT, c.x, c.y);
        bores += hexPath(HOLE, c.x, c.y);
        if (c.kind === 'mount') {
          mounts += circlePath(c.x, c.y, project.mount.headDiameter / 2 + 0.6);
          screws += circlePath(c.x, c.y, project.mount.screwDiameter / 2);
        }
      } else if (c.kind === 'partial' && c.poly) {
        openings += pathOf(c.poly);
      } else if (c.kind === 'solid') {
        solids += hexPath(HOLE_FRONT - 2, c.x, c.y);
      }
    }
    const frameScrews = layout.pieces
      .flatMap((p) => p.screws)
      .map(([x, y]) => circlePath(x, y, project.mount.headDiameter / 2))
      .join('');
    return { openings, bores, mounts, screws, solids, frameScrews };
  }, [layout, project.mount.headDiameter, project.mount.screwDiameter]);

  // ---- Interaction -----------------------------------------------------------
  const drag = useRef<
    | { kind: 'pan'; x: number; y: number; tx: number; ty: number }
    | { kind: 'acc'; id: string; grab: Vec2; moved: boolean }
    | { kind: 'model'; id: string; grab: Vec2; moved: boolean }
    | { kind: 'cutout'; id: string; start: Vec2; ox: number; oy: number; moved: boolean }
    | { kind: 'paint'; done: Set<string> }
    | { kind: 'vtx'; i: number; moved: boolean }
    | null
  >(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number; cx: number; cy: number; tx: number; ty: number } | null>(null);

  const applyCellTool = (c: number, r: number) => {
    const k = cellKey(c, r);
    const kind = index.get(k);
    const cur = useStore.getState().project.cells[k];
    update(
      (p) => {
        if (tool === 'reset') delete p.cells[k];
        else if (tool === 'solid') {
          if (cur === 'solid') delete p.cells[k];
          else p.cells[k] = 'solid';
        } else if (tool === 'mount') {
          if (cur === 'open') delete p.cells[k];
          else if (kind === 'conn') {
            // Connector cell: forced singles are removed, anything else is excluded from placement.
            if (cur === 'mount') delete p.cells[k];
            else p.cells[k] = 'open';
          } else if (kind === 'mount') {
            if (cur === 'mount') delete p.cells[k];
            else p.cells[k] = 'open';
          } else if (kind === 'hole') p.cells[k] = 'mount';
        }
      },
      { transient: true },
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    svgRef.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        s: v.s,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        tx: v.tx,
        ty: v.ty,
      };
      drag.current = null;
      return;
    }
    const world = toWorld(e.clientX, e.clientY);
    const target = (e.target as Element).closest('[data-hit]') as HTMLElement | null;
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
      setPanning(true);
      return;
    }
    if (placing) {
      const cell = cellAt(world[0], world[1], project.grid);
      const id = uid();
      const params = defaultParams(placing);
      update((p) => void p.accessories.push({ id, type: placing, c: cell.c, r: cell.r, params, color: PALETTE[p.accessories.length % 7] }));
      setUi({ placing: e.shiftKey ? placing : null, selection: { kind: 'accessory', id }, rightTab: 'inspector' });
      return;
    }
    if (tool === 'outline' && project.wall.shape === 'custom') {
      const hit = target?.dataset.hit ?? '';
      if (hit.startsWith('vtx:') || hit.startsWith('mid:')) {
        checkpoint();
        let i = +hit.slice(4);
        if (hit.startsWith('mid:')) {
          // Insert a corner in the middle of the edge and drag it right away.
          const pts = project.wall.points;
          const a = pts[i],
            b = pts[(i + 1) % pts.length];
          i = i + 1;
          update((p) => void p.wall.points.splice(i, 0, [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)]), { transient: true });
        }
        drag.current = { kind: 'vtx', i, moved: hit.startsWith('mid:') };
        return;
      }
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
      setPanning(true);
      return;
    }
    if (tool !== 'select') {
      checkpoint();
      const cell = cellAt(world[0], world[1], project.grid);
      drag.current = { kind: 'paint', done: new Set([cellKey(cell.c, cell.r)]) };
      applyCellTool(cell.c, cell.r);
      return;
    }
    if (target) {
      const [kind, id] = target.dataset.hit!.split(':');
      checkpoint();
      if (kind === 'acc') {
        const a = project.accessories.find((x) => x.id === id)!;
        const [ax, ay] = cellCenter(a.c, a.r, project.grid);
        drag.current = { kind: 'acc', id, grab: [world[0] - ax, world[1] - ay], moved: false };
        setUi({ selection: { kind: 'accessory', id }, rightTab: 'inspector' });
      } else if (kind === 'model') {
        const m = project.customModels.find((x) => x.id === id)!;
        const [ax, ay] = cellCenter(m.c, m.r, project.grid);
        drag.current = { kind: 'model', id, grab: [world[0] - ax, world[1] - ay], moved: false };
        setUi({ selection: { kind: 'model', id }, rightTab: 'inspector' });
      } else if (kind === 'cutout') {
        const c = project.cutouts.find((x) => x.id === id)!;
        drag.current = { kind: 'cutout', id, start: world, ox: c.x, oy: c.y, moved: false };
        setUi({ selection: { kind: 'cutout', id }, leftTab: 'cutouts' });
      }
      return;
    }
    setUi({ selection: null });
    drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
    setPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const p = pinch.current;
      const s = Math.max(0.03, Math.min(20, (p.s * d) / p.d));
      const rect = svgRef.current!.getBoundingClientRect();
      const cx = p.cx - rect.left,
        cy = p.cy - rect.top;
      const mx = (a.x + b.x) / 2 - rect.left,
        my = (a.y + b.y) / 2 - rect.top;
      setView({ s, tx: mx - ((cx - p.tx) * s) / p.s, ty: my - ((cy - p.ty) * s) / p.s });
      return;
    }
    const world = toWorld(e.clientX, e.clientY);
    const cell = cellAt(world[0], world[1], project.grid);
    if (!hover || hover.c !== cell.c || hover.r !== cell.r) setHover(cell);
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      setView({ s: v.s, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y });
    } else if (d.kind === 'vtx') {
      const pts = useStore.getState().project.wall.points;
      const step = e.shiftKey ? 1 : 5;
      let [nx, ny] = [Math.round(world[0] / step) * step, Math.round(world[1] / step) * step];
      // Line up with the neighbouring corners when close.
      const tol = 8 / v.s;
      for (const q of [pts[(d.i - 1 + pts.length) % pts.length], pts[(d.i + 1) % pts.length]]) {
        if (Math.abs(world[0] - q[0]) < tol) nx = q[0];
        if (Math.abs(world[1] - q[1]) < tol) ny = q[1];
      }
      if (pts[d.i][0] !== nx || pts[d.i][1] !== ny) {
        d.moved = true;
        update(
          (p) => {
            p.wall.points[d.i] = [nx, ny];
            const xs = p.wall.points.map((q) => q[0]),
              ys = p.wall.points.map((q) => q[1]);
            p.wall.width = Math.max(...xs) - Math.min(...xs);
            p.wall.height = Math.max(...ys) - Math.min(...ys);
          },
          { transient: true },
        );
      }
    } else if (d.kind === 'paint') {
      const k = cellKey(cell.c, cell.r);
      if (!d.done.has(k)) {
        d.done.add(k);
        applyCellTool(cell.c, cell.r);
      }
    } else if (d.kind === 'acc' || d.kind === 'model') {
      const target = cellAt(world[0] - d.grab[0], world[1] - d.grab[1], project.grid);
      const list = d.kind === 'acc' ? project.accessories : project.customModels;
      const cur = list.find((x) => x.id === d.id);
      if (cur && (cur.c !== target.c || cur.r !== target.r)) {
        d.moved = true;
        update(
          (p) => {
            const x = (d.kind === 'acc' ? p.accessories : p.customModels).find((q) => q.id === d.id);
            if (x) {
              x.c = target.c;
              x.r = target.r;
            }
          },
          { transient: true },
        );
      }
    } else if (d.kind === 'cutout') {
      const snap = e.shiftKey ? 10 : 1;
      const nx = Math.round((d.ox + world[0] - d.start[0]) / snap) * snap;
      const ny = Math.round((d.oy + world[1] - d.start[1]) / snap) * snap;
      d.moved = true;
      update(
        (p) => {
          const c = p.cutouts.find((q) => q.id === d.id);
          if (c) {
            c.x = nx;
            c.y = ny;
          }
        },
        { transient: true },
      );
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    if (!d) return;
    // Commit the gesture as one undo step.
    if (d.kind === 'paint' || ((d.kind === 'acc' || d.kind === 'model' || d.kind === 'cutout' || d.kind === 'vtx') && d.moved)) update(() => {});
  };

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const r = svgRef.current!.getBoundingClientRect();
      const mx = e.clientX - r.left,
        my = e.clientY - r.top;
      setView((cur) => {
        const c = cur ?? v;
        if (e.ctrlKey || !e.shiftKey) {
          const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
          const s = Math.max(0.03, Math.min(20, c.s * k));
          return { s, tx: mx - ((mx - c.tx) * s) / c.s, ty: my - ((my - c.ty) * s) / c.s };
        }
        return { ...c, tx: c.tx - e.deltaY };
      });
    },
    [v],
  );
  useEffect(() => {
    const el = svgRef.current!;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // ---- Render ----------------------------------------------------------------
  const holeShade = mix(colors.panel, '#000000', panelDark ? 0.5 : 0.3);
  const seam = panelDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
  const frameDark = isDark(colors.frame);
  const sw = 1 / v.s; // one screen pixel in world units

  const ghost = useMemo(() => {
    if (!placing || !hover) return null;
    const params = defaultParams(placing);
    const shape = shapes[shapeKey(placing, params)];
    const valid = isPlacementValid({ id: '', type: placing, c: hover.c, r: hover.r, params }, index, project.accessories);
    return { shape, valid, at: cellCenter(hover.c, hover.r, project.grid) };
  }, [placing, hover, shapes, index, project.accessories, project.grid]);

  const panelPieces = layout?.pieces.filter((p) => p.kind === 'panel') ?? [];
  const framePieces = layout?.pieces.filter((p) => p.kind === 'frame') ?? [];

  return (
    <svg
      ref={svgRef}
      className={`canvas-2d ${placing ? 'placing' : ''} ${tool !== 'select' ? 'tool-cell' : ''} ${panning ? 'panning' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => {
        const hit = ((e.target as Element).closest('[data-hit]') as HTMLElement | null)?.dataset.hit ?? '';
        if (!hit.startsWith('vtx:') || project.wall.points.length <= 3) return;
        const i = +hit.slice(4);
        update((p) => void p.wall.points.splice(i, 1));
      }}
      data-testid="canvas-2d"
    >
      <defs>
        <filter id="wallShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy={6} stdDeviation={10} floodColor="#000" floodOpacity="0.28" />
        </filter>
        <linearGradient id="frameSheen" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.10" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.10" />
        </linearGradient>
      </defs>
      {layout && geo && (
        <g transform={`translate(${v.tx},${v.ty}) scale(${v.s},${-v.s})`}>
          <path d={pathOf(layout.outer)} fill={colors.panel} filter="url(#wallShadow)" fillRule="evenodd" />
          {/* Panels */}
          {panelPieces.map((p) => (
            <path key={p.id} d={pathOf(p.polys)} fill={colors.panel} fillRule="evenodd" />
          ))}
          {/* Integrated frame parts of edge panels */}
          {panelPieces
            .filter((p) => p.framePolys)
            .map((p) => (
              <g key={`fb-${p.id}`}>
                <path d={pathOf(p.framePolys!)} fill={mix(colors.panel, '#ffffff', panelDark ? 0.1 : 0.06)} fillRule="evenodd" />
                <path d={pathOf(p.framePolys!)} fill="url(#frameSheen)" fillRule="evenodd" />
              </g>
            ))}
          {/* Frame */}
          {framePieces.map((p) => (
            <g key={p.id}>
              <path d={pathOf(p.polys)} fill={colors.frame} fillRule="evenodd" />
              <path d={pathOf(p.polys)} fill="url(#frameSheen)" fillRule="evenodd" />
            </g>
          ))}
          {layout.pattern && project.frame.style === 'lit' ? (
            <path d={pathOf(layout.pattern)} fill="#ffd28a" fillOpacity={0.55} />
          ) : layout.pattern && (
            <path
              d={pathOf(layout.pattern)}
              fill={mix(project.frame.mode === 'integrated' ? colors.panel : colors.frame, '#000', 0.22)}
              stroke={mix(project.frame.mode === 'integrated' ? colors.panel : colors.frame, '#fff', 0.12)}
              strokeWidth={sw * 0.6}
            />
          )}
          {/* LED strip route */}
          {layout.led && (
            <g pointerEvents="none">
              <path d={pathOf([layout.led.path])} fill="none" stroke={project.frame.led.color} strokeOpacity={0.85} strokeWidth={Math.max(2 * sw, Math.min(layout.led.width, 6))} strokeDasharray={`${6 * sw} ${4 * sw}`} />
              {layout.led.wire && <circle cx={layout.led.wire[0]} cy={layout.led.wire[1]} r={5 * sw} fill={project.frame.led.color} stroke="#000" strokeWidth={sw} />}
            </g>
          )}
          {/* Seam patches behind a Backlit cells frame */}
          {layout.plates?.map((pl) => (
            <path key={pl.id} d={pathOf(pl.polys)} fill="none" stroke={frameDark ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.55)'} strokeWidth={sw} strokeDasharray={`${3 * sw} ${2 * sw}`} />
          ))}
          {layout.inner.length > 0 && (
            <path
              d={pathOf(layout.inner)}
              fill="none"
              stroke={frameDark ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)'}
              strokeWidth={sw}
              strokeDasharray={project.frame.lip > 0 && project.frame.proud >= 1 ? `${4 * sw} ${3 * sw}` : undefined}
            />
          )}
          {geo.frameScrews && <path d={geo.frameScrews} fill={mix(colors.frame, '#000', 0.35)} />}
          {/* Cells */}
          <path d={geo.openings} fill={holeShade} />
          <path d={geo.bores} fill="var(--wall-behind)" />
          {geo.solids && tool !== 'select' && (
            <path d={geo.solids} fill="none" stroke={seam} strokeWidth={sw} strokeDasharray={`${3 * sw} ${3 * sw}`} />
          )}
          <path d={geo.mounts} fill={mix(colors.panel, '#000', panelDark ? 0.2 : 0.12)} />
          <path d={geo.screws} fill="#000" fillOpacity={0.85} />
          {/* Connectors */}
          {layout.connectors.map((k) => {
            const shape = shapes[shapeKey('connector', k.params)];
            if (!shape) return null;
            return (
              <g key={k.id} transform={`translate(${k.screw[0]},${k.screw[1]}) rotate(${k.rot})`} pointerEvents="none">
                <path d={pathOf(shape.outline)} fill={colors.connector} fillRule="evenodd" stroke={mix(colors.connector, '#000', 0.45)} strokeWidth={sw} />
                <circle r={project.mount.headDiameter / 2} fill={mix(colors.connector, '#000', 0.25)} />
                <circle r={project.mount.screwDiameter / 2} fill="#000" fillOpacity={0.8} />
              </g>
            );
          })}
          {/* Cutouts (hit areas + selection) */}
          {project.cutouts.map((c) => {
            const sel = selection?.kind === 'cutout' && selection.id === c.id;
            return (
              <rect
                key={c.id}
                data-hit={`cutout:${c.id}`}
                x={c.x - c.w / 2}
                y={c.y - c.h / 2}
                width={c.w}
                height={c.h}
                rx={Math.min(c.r, c.w / 2, c.h / 2)}
                fill="transparent"
                stroke={sel ? 'var(--accent)' : 'transparent'}
                strokeWidth={2 * sw}
                strokeDasharray={sel ? `${6 * sw} ${4 * sw}` : undefined}
                style={{ cursor: tool === 'select' && !placing ? 'move' : undefined }}
              />
            );
          })}
          {/* Panel seams */}
          {showPanels &&
            [...panelPieces, ...framePieces].map((p) => (
              <path key={p.id} d={pathOf(p.polys)} fill="none" stroke={p.kind === 'frame' ? (frameDark ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.45)') : seam} strokeWidth={1.25 * sw} strokeLinejoin="round" />
            ))}
        </g>
      )}
      {/* Labels in screen space */}
      {layout && showPanels && (
        <g pointerEvents="none">
          {layout.pieces.map((p) => {
            const x = v.tx + p.anchor[0] * v.s,
              y = v.ty - p.anchor[1] * v.s;
            const bad = p.printAngle === null;
            const w = 14 + p.label.length * 7;
            return (
              <g key={p.id} transform={`translate(${x},${y})`} opacity={v.s < 0.25 && p.kind === 'frame' ? 0 : 1}>
                <rect x={-w / 2} y={-9} width={w} height={18} rx={9} fill={bad ? '#e5484d' : p.kind === 'frame' ? 'rgba(20,16,10,.78)' : 'rgba(242,169,59,.95)'} />
                <text
                  textAnchor="middle"
                  dy="4"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="var(--mono)"
                  fill={bad || p.kind === 'frame' ? '#fff' : '#1d1406'}
                >
                  {p.label}
                </text>
              </g>
            );
          })}
          {layout.plates?.map((pl) => {
            const x = v.tx + pl.anchor[0] * v.s,
              y = v.ty - pl.anchor[1] * v.s;
            const w = 12 + pl.label.length * 6.5;
            return (
              <g key={pl.id} transform={`translate(${x},${y})`} opacity={v.s < 0.25 ? 0 : 1}>
                <rect x={-w / 2} y={-8} width={w} height={16} rx={8} fill="rgba(37,99,235,.92)" />
                <text textAnchor="middle" dy="4" fontSize="10" fontWeight="700" fontFamily="var(--mono)" fill="#fff">
                  {pl.label}
                </text>
              </g>
            );
          })}
        </g>
      )}
      {layout && (
        <g transform={`translate(${v.tx},${v.ty}) scale(${v.s},${-v.s})`}>
          {/* Custom models */}
          {showAcc &&
            project.customModels.map((m) => {
              const { hull } = preparedModel(m);
              const [x, y] = cellCenter(m.c, m.r, project.grid);
              const sel = selection?.kind === 'model' && selection.id === m.id;
              return (
                <g key={m.id} transform={`translate(${x + m.offset[0]},${y + m.offset[1]})`}>
                  <path
                    data-hit={`model:${m.id}`}
                    d={pathOf([hull])}
                    fill={m.color}
                    fillOpacity={0.85}
                    stroke={sel ? 'var(--accent)' : mix(m.color, '#000', 0.4)}
                    strokeWidth={(sel ? 2.5 : 1) * sw}
                    style={{ cursor: 'move' }}
                  />
                </g>
              );
            })}
          {/* Accessories */}
          {showAcc &&
            project.accessories.map((a) => {
              const shape = shapes[shapeKey(a.type, a.params)];
              const [x, y] = cellCenter(a.c, a.r, project.grid);
              const sel = selection?.kind === 'accessory' && selection.id === a.id;
              const valid = isPlacementValid(a, index, project.accessories);
              const d = shape ? pathOf(shape.outline) : hexPath(22.5, 0, 0);
              return (
                <g key={a.id} transform={`translate(${x},${y})`}>
                  {sel && <path d={d} fill="none" stroke="var(--accent)" strokeOpacity={0.35} strokeWidth={8 * sw} strokeLinejoin="round" />}
                  <path
                    data-hit={`acc:${a.id}`}
                    d={d}
                    fill={a.color}
                    fillRule="nonzero"
                    stroke={!valid ? '#e5484d' : sel ? 'var(--accent)' : mix(a.color, '#000', 0.35)}
                    strokeWidth={(sel || !valid ? 2 : 1) * sw}
                    strokeDasharray={!valid ? `${5 * sw} ${3 * sw}` : undefined}
                    strokeLinejoin="round"
                    style={{ cursor: tool === 'select' && !placing ? 'move' : undefined }}
                  />
                </g>
              );
            })}
          {/* Outline editor */}
          {tool === 'outline' && project.wall.shape === 'custom' && project.wall.points.length >= 3 && (
            <g>
              <path d={pathOf([project.wall.points])} fill="none" stroke="var(--accent)" strokeWidth={1.5 * sw} strokeDasharray={`${5 * sw} ${3 * sw}`} />
              {project.wall.points.map((a, i) => {
                const b = project.wall.points[(i + 1) % project.wall.points.length];
                const mx = (a[0] + b[0]) / 2,
                  my = (a[1] + b[1]) / 2;
                return (
                  <g key={`m${i}`} data-hit={`mid:${i}`} style={{ cursor: 'copy' }}>
                    <circle cx={mx} cy={my} r={6 * sw} fill="var(--surface)" stroke="var(--accent)" strokeWidth={1.2 * sw} />
                    <path d={`M${mx - 3 * sw},${my}H${mx + 3 * sw}M${mx},${my - 3 * sw}V${my + 3 * sw}`} stroke="var(--accent)" strokeWidth={1.2 * sw} />
                  </g>
                );
              })}
              {project.wall.points.map(([x, y], i) => (
                <circle
                  key={`v${i}`}
                  data-hit={`vtx:${i}`}
                  cx={x}
                  cy={y}
                  r={7 * sw}
                  fill="var(--accent)"
                  stroke="#fff"
                  strokeWidth={2 * sw}
                  style={{ cursor: 'move' }}
                />
              ))}
            </g>
          )}
          {/* Hover + ghost */}
          {hover && (placing || (tool !== 'select' && tool !== 'outline')) && (
            <path
              d={hexPath(HOLE_FRONT + 1.2, ...cellCenter(hover.c, hover.r, project.grid))}
              fill="var(--accent)"
              fillOpacity={0.18}
              stroke="var(--accent)"
              strokeWidth={2 * sw}
              pointerEvents="none"
            />
          )}
          {ghost?.shape && (
            <path
              transform={`translate(${ghost.at[0]},${ghost.at[1]})`}
              d={pathOf(ghost.shape.outline)}
              fill={ghost.valid ? 'var(--accent)' : '#e5484d'}
              fillOpacity={0.35}
              stroke={ghost.valid ? 'var(--accent)' : '#e5484d'}
              strokeWidth={1.5 * sw}
              pointerEvents="none"
            />
          )}
        </g>
      )}
      {!layout && (
        <text x={size.w / 2} y={size.h / 2} textAnchor="middle" fill="var(--text-3)">
          …
        </text>
      )}
      {placing && <title>{t('placeHint')}</title>}
    </svg>
  );
}


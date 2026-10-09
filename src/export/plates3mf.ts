import { strToU8, zipSync } from 'fflate';
import type { MeshData } from '../geometry/layoutTypes';

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface PlateItem {
  name: string;
  /** Lying on the bed: z from 0, centred on x/y. */
  mesh: Pick<MeshData, 'positions' | 'indices'>;
  /** Copies to print. */
  count?: number;
}

/** Bed size in mm and the free border kept around it. */
export interface Bed {
  w: number;
  h: number;
  margin: number;
}

const uuid = (n: number, kind: number) => `${n.toString(16).padStart(8, '0')}-${kind.toString(16).padStart(4, '0')}-4000-8000-000000000000`;

/** Plates are laid out in a near-square grid with a fifth of a plate between them, as Bambu Studio / OrcaSlicer do. */
function plateColumns(n: number) {
  const v = Math.sqrt(n);
  const r = Math.round(v);
  return v > r ? r + 1 : Math.max(1, r);
}

interface Placed {
  obj: number;
  inst: number;
  plate: number;
  x: number;
  y: number;
}

/** Shelf packing of the copies onto as few plates as possible, biggest first. */
function pack(sizes: { obj: number; inst: number; w: number; h: number }[], bed: Bed, gap: number): Placed[] {
  const W = bed.w - 2 * bed.margin,
    H = bed.h - 2 * bed.margin;
  type Shelf = { y: number; h: number; x: number };
  const plates: Shelf[][] = [];
  const out: Placed[] = [];
  const order = [...sizes].sort((a, b) => b.w * b.h - a.w * a.h);
  for (const it of order) {
    let placed = false;
    // Too big for the bed: its own plate, centred (the slicer will point it out).
    if (it.w > W || it.h > H) {
      plates.push([{ y: H, h: 0, x: W }]);
      out.push({ ...it, plate: plates.length - 1, x: bed.w / 2, y: bed.h / 2 });
      continue;
    }
    for (let pi = 0; pi < plates.length && !placed; pi++) {
      const shelves = plates[pi];
      for (const sh of shelves) {
        if (sh.x + it.w <= W && it.h <= sh.h) {
          out.push({ ...it, plate: pi, x: bed.margin + sh.x + it.w / 2, y: bed.margin + sh.y + it.h / 2 });
          sh.x += it.w + gap;
          placed = true;
          break;
        }
      }
      if (!placed) {
        const top = shelves.reduce((a, s) => Math.max(a, s.y + s.h + gap), 0);
        if (top + it.h <= H) {
          shelves.push({ y: top, h: it.h, x: it.w + gap });
          out.push({ ...it, plate: pi, x: bed.margin + it.w / 2, y: bed.margin + top + it.h / 2 });
          placed = true;
        }
      }
    }
    if (!placed) {
      plates.push([{ y: 0, h: it.h, x: it.w + gap }]);
      out.push({ ...it, plate: plates.length - 1, x: bed.margin + it.w / 2, y: bed.margin + it.h / 2 });
    }
  }
  return out;
}

/**
 * A Bambu Studio / OrcaSlicer project: every part as its own object, packed
 * onto as many plates of the given bed as needed, ready to slice plate by plate.
 */
export function meshesToPlated3mf(items: PlateItem[], bed: Bed, app: string): Uint8Array {
  const n = items.length;
  const sizes: { obj: number; inst: number; w: number; h: number }[] = [];
  const objectFiles: Record<string, Uint8Array> = {};
  const rels: string[] = [];
  const resources: string[] = [];
  items.forEach((it, i) => {
    const k = i + 1;
    const p = it.mesh.positions;
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    const verts: string[] = [];
    for (let v = 0; v < p.length; v += 3) {
      x0 = Math.min(x0, p[v]);
      x1 = Math.max(x1, p[v]);
      y0 = Math.min(y0, p[v + 1]);
      y1 = Math.max(y1, p[v + 1]);
      verts.push(`<vertex x="${p[v].toFixed(4)}" y="${p[v + 1].toFixed(4)}" z="${p[v + 2].toFixed(4)}"/>`);
    }
    const tris: string[] = [];
    const t = it.mesh.indices;
    for (let j = 0; j < t.length; j += 3) tris.push(`<triangle v1="${t[j]}" v2="${t[j + 1]}" v3="${t[j + 2]}"/>`);
    const path = `3D/Objects/object_${k}.model`;
    objectFiles[path] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">` +
        `<resources><object id="${k}" p:UUID="${uuid(k, 1)}" type="model"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object></resources><build/></model>`,
    );
    rels.push(`<Relationship Target="/${path}" Id="rel-${k}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>`);
    resources.push(
      `<object id="${n + k}" p:UUID="${uuid(k, 2)}" type="model"><components><component p:path="/${path}" objectid="${k}" p:UUID="${uuid(k, 3)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components></object>`,
    );
    // Mesh is centred on the origin by the exporter; keep its true footprint for packing.
    const w = x1 - x0,
      h = y1 - y0;
    for (let c = 0; c < Math.max(1, it.count ?? 1); c++) sizes.push({ obj: k, inst: c, w, h });
  });
  const placed = pack(sizes, bed, 4);
  const plateCount = Math.max(1, ...placed.map((q) => q.plate + 1));
  const cols = plateColumns(plateCount);
  const stride = { x: bed.w * 1.2, y: bed.h * 1.2 };
  const at = (q: Placed) => {
    const col = q.plate % cols,
      row = Math.floor(q.plate / cols);
    return [col * stride.x + q.x, -row * stride.y + q.y];
  };
  const build = placed
    .sort((a, b) => a.obj - b.obj || a.inst - b.inst)
    .map((q) => {
      const [x, y] = at(q);
      return `<item objectid="${n + q.obj}" p:UUID="${uuid(q.obj * 1000 + q.inst, 4)}" transform="1 0 0 0 1 0 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} 0" printable="1"/>`;
    });
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n` +
    ` <metadata name="Application">${esc(app)}</metadata>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n` +
    ` <resources>${resources.join('')}</resources>\n <build p:UUID="${uuid(0, 5)}">${build.join('')}</build>\n</model>`;

  const objCfg = items
    .map(
      (it, i) =>
        `  <object id="${n + i + 1}">\n    <metadata key="name" value="${esc(it.name)}"/>\n    <metadata key="extruder" value="1"/>\n` +
        `    <part id="${i + 1}" subtype="normal_part">\n      <metadata key="name" value="${esc(it.name)}"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n    </part>\n  </object>`,
    )
    .join('\n');
  let ident = 1;
  const plates = Array.from({ length: plateCount }, (_, pi) => {
    const inst = placed
      .filter((q) => q.plate === pi)
      .map(
        (q) =>
          `    <model_instance>\n      <metadata key="object_id" value="${n + q.obj}"/>\n      <metadata key="instance_id" value="${q.inst}"/>\n      <metadata key="identify_id" value="${ident++}"/>\n    </model_instance>`,
      )
      .join('\n');
    return `  <plate>\n    <metadata key="plater_id" value="${pi + 1}"/>\n    <metadata key="plater_name" value=""/>\n    <metadata key="locked" value="false"/>\n${inst}\n  </plate>`;
  }).join('\n');
  const assemble = placed
    .map((q) => {
      const [x, y] = at(q);
      return `   <assemble_item object_id="${n + q.obj}" instance_id="${q.inst}" transform="1 0 0 0 1 0 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} 0" offset="0 0 0" />`;
    })
    .join('\n');
  const settings = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${objCfg}\n${plates}\n  <assemble>\n${assemble}\n  </assemble>\n</config>\n`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    ),
    '3D/3dmodel.model': strToU8(model),
    '3D/_rels/3dmodel.model.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
    ),
    'Metadata/model_settings.config': strToU8(settings),
    ...objectFiles,
  };
  return zipSync(files, { level: 6 });
}

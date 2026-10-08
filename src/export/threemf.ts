import { strToU8, zipSync } from 'fflate';
import type { MeshData } from '../geometry/layoutTypes';

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A 3MF package with one object per mesh, laid out in a row so slicers can arrange them. */
export function meshesTo3mf(items: { name: string; mesh: Pick<MeshData, 'positions' | 'indices'> }[]): Uint8Array {
  const objects: string[] = [];
  const build: string[] = [];
  let x = 0;
  items.forEach(({ name, mesh }, i) => {
    const id = i + 1;
    const p = mesh.positions;
    let minX = Infinity,
      maxX = -Infinity;
    const verts: string[] = [];
    for (let v = 0; v < p.length; v += 3) {
      if (p[v] < minX) minX = p[v];
      if (p[v] > maxX) maxX = p[v];
      verts.push(`<vertex x="${p[v].toFixed(4)}" y="${p[v + 1].toFixed(4)}" z="${p[v + 2].toFixed(4)}"/>`);
    }
    const tris: string[] = [];
    const t = mesh.indices;
    for (let k = 0; k < t.length; k += 3) tris.push(`<triangle v1="${t[k]}" v2="${t[k + 1]}" v3="${t[k + 2]}"/>`);
    objects.push(
      `<object id="${id}" name="${esc(name)}" type="model"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`,
    );
    build.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${(x - minX).toFixed(3)} 0 0"/>`);
    x += maxX - minX + 10;
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Application">HSW Generator</metadata>
<resources>${objects.join('')}</resources>
<build>${build.join('')}</build>
</model>`;
  const files = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    ),
    '3D/3dmodel.model': strToU8(model),
  };
  return zipSync(files, { level: 6 });
}

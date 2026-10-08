import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { Project } from '../model/types';

const toB64Url = (u8: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const u8 = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
  return u8;
};

export function shareUrl(project: Project): string {
  const data = toB64Url(deflateSync(strToU8(JSON.stringify({ ...project, customModels: [] })), { level: 9 }));
  return `${location.origin}${location.pathname}#p=${data}`;
}

export function projectFromHash(): Project | null {
  const m = location.hash.match(/#p=([\w-]+)/);
  if (!m) return null;
  try {
    return JSON.parse(strFromU8(inflateSync(fromB64Url(m[1]))));
  } catch {
    return null;
  }
}

export function download(data: BlobPart, filename: string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

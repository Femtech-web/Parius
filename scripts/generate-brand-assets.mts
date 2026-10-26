// Deterministic brand assets. No external images, remote fonts or credentials.
import { createElement as h } from 'react';
import { ImageResponse } from 'next/og';
import { mkdir, writeFile } from 'node:fs/promises';

const night = '#090b0c',
  paper = '#f3f3ef',
  ice = '#a7c5ff';
const letter =
  'M20 49V18h6v3c2-3 5-4 9-4 8 0 13 6 13 14s-5 14-13 14c-4 0-7-1-9-4v8h-6Zm14-26c-5 0-8 3-8 8s3 8 8 8 8-3 8-8-3-8-8-8Z';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${night}"/><path d="${letter}" fill="${paper}"/><circle cx="52" cy="47" r="3.5" fill="${ice}"/></svg>`;
const mark = (size: number) =>
  h(
    'svg',
    { width: size, height: size, viewBox: '0 0 64 64' },
    h('rect', { width: 64, height: 64, rx: 15, fill: night }),
    h('path', { d: letter, fill: paper }),
    h('circle', { cx: 52, cy: 47, r: 3.5, fill: ice }),
  );
const png = async (size: number) =>
  Buffer.from(await new ImageResponse(mark(size), { width: size, height: size }).arrayBuffer());

await mkdir('public', { recursive: true });
await writeFile('src/app/icon.svg', svg + '\n');
await writeFile('src/app/apple-icon.png', await png(180));
// ICO container with PNG entries for modern desktop browsers at common tab sizes.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((bytes, i) => {
  const at = 6 + i * 16;
  header[at] = sizes[i];
  header[at + 1] = sizes[i];
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(bytes.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += bytes.length;
});
await writeFile('src/app/favicon.ico', Buffer.concat([header, ...images]));

const card = h(
  'div',
  {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      background: night,
      color: paper,
      padding: '58px 76px',
      fontFamily: 'sans-serif',
    },
  },
  h(
    'div',
    { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
    h(
      'div',
      { style: { display: 'flex', fontSize: 48, letterSpacing: '-3px', fontWeight: 600 } },
      'parius',
      h('span', { style: { color: ice } }, '.'),
    ),
    h(
      'div',
      { style: { fontSize: 20, color: '#92999f', display: 'flex' } },
      'A shared way forward.',
    ),
  ),
  h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        marginTop: 62,
        fontSize: 66,
        fontWeight: 600,
        letterSpacing: '-2.8px',
        lineHeight: 1.1,
      },
    },
    h('div', { style: { display: 'flex' } }, 'Keep the work, the agreement'),
    h('div', { style: { display: 'flex' } }, 'and the payment connected.'),
  ),
  h(
    'div',
    { style: { display: 'flex', marginTop: 30, fontSize: 26, color: '#a0a6ad' } },
    'For freelancers and clients, from first conversation to final handoff.',
  ),
  h(
    'div',
    {
      style: {
        display: 'flex',
        marginTop: 'auto',
        borderTop: '1px solid #2a3036',
        paddingTop: 25,
        alignItems: 'center',
        gap: 12,
        fontSize: 20,
        color: ice,
      },
    },
    h('div', { style: { display: 'flex', width: 7, height: 7, borderRadius: 7, background: ice } }),
    'Conversations · Agreements · Payments · Memory',
  ),
);
await writeFile(
  'public/og.png',
  Buffer.from(await new ImageResponse(card, { width: 1200, height: 630 }).arrayBuffer()),
);
console.log('Created favicon, SVG icon, Apple icon and 1200×630 social preview.');

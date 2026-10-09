// Development fixture only: emits valid PNGs; does not rasterize the SVG artwork.
import { readFile, writeFile } from 'node:fs/promises';
import { png } from '../tests/helpers/png.mjs';
const [source, output, flag, size] = process.argv.slice(2);
if (flag !== '--width') throw new Error('Unexpected renderer arguments');
const svg = await readFile(source, 'utf8');
const box = svg.match(/viewBox="([^"]+)"/u)[1].split(/\s+/u).map(Number);
const width = Number(size); const height = Math.max(1, Math.round(width * box[3] / box[2]));
await writeFile(output, png(width, height).bytes);

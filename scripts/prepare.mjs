import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'mobile-www');
await mkdir(output, { recursive: true });
await cp(resolve(root, 'src'), output, { recursive: true });
await build({ entryPoints: [resolve(root, 'src/platform.mjs')], outfile: resolve(output, 'platform.mjs'), bundle: true, format: 'esm', target: 'chrome110', minify: true });
const database = JSON.parse(await readFile(resolve(root, 'data/courses.json'), 'utf8'));
const dataDir = resolve(output, 'data');
await rm(resolve(dataDir, 'courses'), { recursive: true, force: true });
await mkdir(resolve(dataDir, 'courses'), { recursive: true });
const catalog = { meta: database.meta, courses: [] };
for (const original of database.courses) {
  const { capacity, enrolled, ...course } = original;
  const { syllabus, ...summary } = course;
  catalog.courses.push(summary);
  await writeFile(resolve(dataDir, 'courses', `${course.id}.json`), JSON.stringify(course));
}
await writeFile(resolve(dataDir, 'catalog.json'), JSON.stringify(catalog));
console.log(`Offline Android assets: ${catalog.courses.length} courses`);

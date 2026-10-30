// CAD 竣工图对象登记：把 data/cad-reference/registration-dataset.json 中的
// 农田/塘口/水闸/泵站/蓄水池按图纸片区登记为正式对象（草稿/待核实口径）。
// 幂等：编号已存在则跳过；仅允许在 agri_dev 执行。
import { readFileSync } from 'node:fs';
import { transaction, closePool } from '../../src/db/pool';
import { saveObject } from '../../src/modules/registry/objects';
import { saveRegion, assignRegion } from '../../src/modules/map/regions';
import { saveBoundary } from '../../src/modules/map/service';

type Item = { code: string; name: string; kind: 'field' | 'pond' | 'facility'; type_label: string; village: string; drawing: string; handle: string; geometry: unknown | null; source_note: string };
type Dataset = { villages: { code: string; name: string; drawing: string }[]; items: Item[] };

async function main() {
  const datasetPath = process.argv[2] ?? 'data/cad-reference/registration-dataset.json';
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8')) as Dataset;
  const report = { villagesCreated: 0, villagesReused: 0, created: 0, skipped: 0, boundaries: 0, links: 0 };
  await transaction(async c => {
    if ((await c.query('SELECT current_database() AS name')).rows[0].name !== 'agri_dev') throw new Error('仅允许在 agri_dev 执行');
    const user = (await c.query("SELECT id FROM users WHERE username='farm-admin' AND role='admin' AND enabled")).rows[0];
    if (!user) throw new Error('请先初始化管理员');
    const farm = (await c.query("SELECT id FROM objects WHERE code='LZH-ROOT' AND kind='farm'")).rows[0];
    if (!farm) throw new Error('未找到 LZH-ROOT 农场');
    const actor = { id: user.id as string, role: 'admin' as const, enabled: true, mfaVerified: true };
    const source = 'CAD 竣工图导入登记（2026-10-30），边界/位置待现场核实';

    const regionIds = new Map<string, string>();
    for (const village of dataset.villages) {
      const existing = (await c.query('SELECT id FROM map_regions WHERE farm_id=$1 AND lower(name)=lower($2) AND archived_at IS NULL', [farm.id, village.name])).rows[0];
      if (existing) { regionIds.set(village.name, existing.id); report.villagesReused++; continue; }
      const region = await saveRegion(c, actor, { farmId: farm.id, name: village.name, source: `按 CAD 竣工图（${village.drawing}）划分的片区，边界未测绘` });
      regionIds.set(village.name, region.id as string);
      report.villagesCreated++;
    }

    const existingCodes = new Set((await c.query('SELECT code FROM objects WHERE code LIKE \'CAD-%\'')).rows.map(row => row.code as string));
    for (const item of dataset.items) {
      if (existingCodes.has(item.code)) { report.skipped++; continue; }
      const object = await saveObject(c, actor, { parentId: farm.id, kind: item.kind, code: item.code, name: item.name, source: item.source_note, reason: 'CAD 竣工图导入登记' });
      if (item.geometry && item.kind !== 'facility') {
        await saveBoundary(c, actor, { objectId: object.id, version: 1, sourceCrs: 4326, status: 'draft', source: item.source_note, geometry: item.geometry });
        report.boundaries++;
      } else if (item.geometry) {
        const ewkt = (await c.query('SELECT ST_AsEWKT(ST_SetSRID(ST_GeomFromGeoJSON($1),4326)) AS g', [JSON.stringify(item.geometry)])).rows[0].g;
        await c.query('UPDATE objects SET boundary=$2::geometry,boundary_status=$3,version=version+1 WHERE id=$1', [object.id, ewkt, 'draft']);
        await c.query('INSERT INTO boundary_versions(object_id,object_version,boundary,source_crs,source,status,created_by) VALUES($1,2,$3::geometry,4326,$4,$5,$6)', [object.id, ewkt, item.source_note, 'draft', actor.id]);
        report.boundaries++;
      }
      await assignRegion(c, actor, { objectId: object.id, regionId: regionIds.get(item.village), source });
      report.created++;
      report.links++;
    }
    console.log(JSON.stringify(report));
  });
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(closePool);

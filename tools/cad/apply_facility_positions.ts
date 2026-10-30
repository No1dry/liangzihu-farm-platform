// 设施位置补登记：把 facility-label-positions.json 中的图面标注位置写入既有设施对象（草稿边界）。
// 幂等：已有边界的对象跳过；仅允许在 agri_dev 执行。
import { readFileSync } from 'node:fs';
import { transaction, closePool } from '../../src/db/pool';

type Position = { code: string; name: string; geometry: unknown; source_note: string };

async function main() {
  const file = process.argv[2] ?? 'data/cad-reference/facility-label-positions.json';
  const { positions } = JSON.parse(readFileSync(file, 'utf-8')) as { positions: Position[] };
  const report = { positioned: 0, skipped: 0, missing: 0 };
  await transaction(async c => {
    if ((await c.query('SELECT current_database() AS name')).rows[0].name !== 'agri_dev') throw new Error('仅允许在 agri_dev 执行');
    const user = (await c.query("SELECT id FROM users WHERE username='farm-admin' AND role='admin' AND enabled")).rows[0];
    if (!user) throw new Error('请先初始化管理员');
    for (const p of positions) {
      const object = (await c.query('SELECT id,version,boundary FROM objects WHERE code=$1 FOR UPDATE', [p.code])).rows[0];
      if (!object) { report.missing++; continue; }
      if (object.boundary) { report.skipped++; continue; }
      const ewkt = (await c.query('SELECT ST_AsEWKT(ST_SetSRID(ST_GeomFromGeoJSON($1),4326)) AS g', [JSON.stringify(p.geometry)])).rows[0].g;
      await c.query('UPDATE objects SET boundary=$2::geometry,boundary_status=$3,version=version+1 WHERE id=$1', [object.id, ewkt, 'draft']);
      await c.query('INSERT INTO boundary_versions(object_id,object_version,boundary,source_crs,source,status,created_by) VALUES($1,$2,$3::geometry,4326,$4,$5,$6)', [object.id, object.version + 1, ewkt, p.source_note, 'draft', user.id]);
      const snapshot = (await c.query('SELECT id,parent_id,code,name,kind,version,boundary_status,ST_AsGeoJSON(boundary)::jsonb AS boundary FROM objects WHERE id=$1', [object.id])).rows[0];
      await c.query('INSERT INTO object_versions(object_id,version,snapshot,reason,created_by) VALUES($1,$2,$3,$4,$5)', [object.id, object.version + 1, snapshot, p.source_note, user.id]);
      report.positioned++;
    }
    console.log(JSON.stringify(report));
  });
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(closePool);

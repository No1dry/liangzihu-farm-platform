import { transaction, closePool } from '../src/db/pool';
import { saveSource, saveDevice } from '../src/modules/registry/devices';
import { savePoint, bindPoint } from '../src/modules/registry/points';
// 首台三诚单螺杆闸门 hbdxscz001 只读登记。来源、设备、测点均保持未核实；
// 绑定对象必须通过 --bind-object <uuid> 显式给出，不伪造任何场区对象。
const POINTS = [
  { code: 'GATE-001-OPENING', name: '闸门001当前开度', metric: 'opening', unit: '%' },
  { code: 'GATE-001-WATER-LEVEL', name: '闸门001水位', metric: 'water_level', unit: 'mm' },
  { code: 'GATE-001-INSTANT-FLOW', name: '闸门001瞬时流量', metric: 'instantaneous_flow', unit: 'm³/s' },
  { code: 'GATE-001-CUMULATIVE-FLOW', name: '闸门001累计流量', metric: 'cumulative_flow', unit: 'm³' },
  { code: 'GATE-001-SET-OPENING', name: '闸门001设置开度', metric: 'set_opening', unit: '%' },
  { code: 'GATE-001-STALL-CURRENT', name: '闸门001堵转电流', metric: 'stall_current', unit: 'mA' },
];
async function main() {
  const args = process.argv.slice(2);
  const bindObject = args.includes('--bind-object') ? args[args.indexOf('--bind-object') + 1] : null;
  if (bindObject && !/^[0-9a-f-]{36}$/i.test(bindObject)) throw new Error('绑定对象编号无效');
  await transaction(async c => {
    if ((await c.query('SELECT current_database() AS name')).rows[0].name !== 'agri_dev') throw new Error('仅登记开发库');
    const user = (await c.query("SELECT id FROM users WHERE username='farm-admin' AND role='admin' AND enabled")).rows[0];
    if (!user) throw new Error('请先初始化管理员');
    const root = (await c.query("SELECT id FROM objects WHERE code='LZH-ROOT'")).rows[0];
    if (!root) throw new Error('请先执行 registry:setup 创建场区入口');
    const actor = { id: user.id, role: 'admin' as const, enabled: true, mfaVerified: true };
    const source = (await c.query("SELECT * FROM data_sources WHERE code='SDSC-GATE'")).rows[0]
      ?? await saveSource(c, actor, { objectId: root.id, code: 'SDSC-GATE', name: '三诚单螺杆闸门MQTT只读上报', provider: 'sdsc', contractRef: 'docs/contracts/gate-sdsc.md' });
    const dtu = (await c.query("SELECT * FROM devices WHERE source_id=$1 AND external_id='hbdxscz001-dtu'", [source.id])).rows[0]
      ?? await saveDevice(c, actor, { objectId: root.id, sourceId: source.id, externalId: 'hbdxscz001-dtu', name: '闸门001通信DTU', kind: 'gateway', source: '厂家《闸门设备通过mqtt对接协议》及接入资料；在线状态待现场核实' });
    const gate = (await c.query("SELECT * FROM devices WHERE source_id=$1 AND external_id='hbdxscz001'", [source.id])).rows[0]
      ?? await saveDevice(c, actor, { objectId: root.id, sourceId: source.id, externalId: 'hbdxscz001', name: '三诚单螺杆闸门001', kind: 'physical', parentDeviceId: dtu.id, model: 'SCZM-LG', serialNumber: '00601925123000009360', source: '厂家接入资料登记；固件VER:V2.4.05.000000.0000；verified留待现场核实' });
    const created: Record<string, string> = {};
    for (const p of POINTS) {
      const point = (await c.query('SELECT * FROM points WHERE code=$1', [p.code])).rows[0]
        ?? await savePoint(c, actor, { deviceId: gate.id, code: p.code, name: p.name, metric: p.metric, unit: p.unit });
      created[p.metric] = point.id;
      if (bindObject && !(await c.query('SELECT 1 FROM point_bindings WHERE point_id=$1 AND valid_to IS NULL', [point.id])).rowCount)
        await bindPoint(c, actor, { pointId: point.id, objectId: bindObject, validFrom: new Date().toISOString(), verified: false, evidence: '登记脚本预绑定，待现场核实后由授权人员置真' });
    }
    console.log(JSON.stringify({ sourceId: source.id, dtuDeviceId: dtu.id, gateDeviceId: gate.id, points: created, bound: !!bindObject }));
    if (!bindObject) console.log('未提供 --bind-object，测点未绑定对象；绑定前测值会被拒绝或隔离，属于预期。');
  });
}
main().catch(e => { console.error(e instanceof Error ? e.message : '闸门登记未完成'); process.exitCode = 1; }).finally(closePool);

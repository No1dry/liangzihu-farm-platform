import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { transaction } from '../src/db/pool';
import { readDatabaseConfig } from '../src/platform/config';
import { AppError } from '../src/platform/error';
import { normalizeGate, gateDeviceFromTopic } from '../src/adapters/gate/adapter';
import type { GateContract } from '../src/adapters/gate/contract';
import { archiveReceipt, persistBatch } from '../src/modules/telemetry/ingest';
import { heartbeat } from '../src/modules/operations/heartbeat';
import { runGateMqtt, type GateMqttConfiguration } from '../src/modules/telemetry/gate-mqtt';
let stopped = false; for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; });
const pool = new pg.Pool(readDatabaseConfig({ ...process.env, DB_POOL_MAX: process.env.GATE_DB_POOL_MAX ?? '2' }));
async function main() {
    const [mode, contractPath, payloadPath] = process.argv.slice(2);
    if (!mode) {
        const file = process.env.GATE_CONTRACT_FILE;
        if (!file) throw new AppError(503, 'GATE_CONTRACT_FILE', '未配置私有闸门契约文件位置');
        const config: GateMqttConfiguration = JSON.parse(await readFile(file, 'utf8'));
        console.log(JSON.stringify(await runGateMqtt(pool, config, { shouldStop: () => stopped })));
        return;
    }
    if (!['--replay', '--synthetic-replay'].includes(mode) || !contractPath || !payloadPath)
        throw new AppError(400, 'USAGE', '用法：worker:gate 常驻订阅（需 GATE_MQTT_ENABLED=1 与 GATE_CONTRACT_FILE）；或 --replay 契约文件 报文信封文件；合成回放仅允许agri_test');
    const synthetic = mode === '--synthetic-replay';
    if (synthetic && (await pool.query('SELECT current_database() AS name')).rows[0].name !== 'agri_test')
        throw new AppError(403, 'SYNTHETIC_TEST_ONLY', '合成报文只能写入agri_test');
    const contract: GateContract = JSON.parse(await readFile(contractPath, 'utf8')), raw = await readFile(payloadPath), receivedAt = new Date().toISOString();
    if (contract.synthetic !== synthetic)
        throw new AppError(422, 'MODE_MISMATCH', '契约性质与回放模式不一致');
    // 回放文件为 {"topic":"...","payload":{...}} 信封：topic 决定设备编号，payload 为厂家原始JSON；整个信封作为原始回执存档。
    let readings;
    try {
        const envelope = JSON.parse(raw.toString('utf8')) as { topic?: unknown; payload?: unknown };
        if (typeof envelope.topic !== 'string' || envelope.payload === undefined)
            throw new AppError(422, 'GATE_REPLAY_ENVELOPE', '回放文件须为含topic与payload的信封JSON');
        readings = normalizeGate(envelope.payload, contract, gateDeviceFromTopic(envelope.topic, contract), receivedAt, synthetic ? 'synthetic' : 'real').map(x => ({ ...x, origin: 'history' as const }));
    }
    catch (e) {
        if (e instanceof AppError && e.code === 'GATE_CONTRACT_NOT_READY')
            throw e;
        await transaction(async (c) => { const rawRef = await archiveReceipt(c, contract.sourceId, raw, receivedAt, synthetic); await c.query('INSERT INTO quarantined_readings(raw_ref,input,reasons) VALUES($1,$2,$3)', [rawRef, { contractVersion: contract.version }, ['adapter_rejected']]); }, pool);
        throw new AppError(422, 'REPLAY_QUARANTINED', '原报文已留存待核；未推进游标');
    }
    const expectedCursor = (await pool.query('SELECT cursor FROM ingestion_cursors WHERE source_id=$1', [contract.sourceId])).rows[0]?.cursor ?? null;
    const sampled = readings.map(r => r.sampledAt).filter((x): x is string => x !== null).sort().pop() ?? receivedAt;
    const results = await persistBatch(pool, { sourceId: contract.sourceId, raw, receivedAt, synthetic, expectedCursor, nextCursor: sampled, readings, resolveMappings: true, contract: { version: contract.version, reference: contract.reference, snapshot: JSON.parse(JSON.stringify(contract)) } });
    await transaction(c => heartbeat(c, 'ingest', 'gate-replay-' + process.pid, 'blocked', new Date(), true, 'GATE_REPLAY_ONLY_G15_PENDING'), pool);
    console.log(JSON.stringify({ mode, inserted: results.filter(r => r.disposition === 'inserted').length, duplicate: results.filter(r => r.disposition === 'duplicate').length, conflict: results.filter(r => r.disposition === 'conflict').length, quarantined: results.filter(r => r.disposition === 'quarantined').length }));
}
main().catch(e => { console.error(e instanceof AppError ? e.message : '闸门采集回放失败；未输出原报文或连接信息'); process.exitCode = 1; }).finally(() => pool.end());

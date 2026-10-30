import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCurrent} from '../../src/app/(platform)/farm-overview/detail-data';
import {bindStateToObject} from '../../src/app/(platform)/farm-overview/use-object-detail';

const now=Date.parse('2026-10-30T12:00:00Z');
const base={value:6.1,unit:'mg/L',sampledAt:'2026-10-30T11:59:00Z',reasons:[]};

test('R01 补丁：trusted 仅当质量明确 valid、时间可解析、时效有效且未超窗',()=>{
  // 基准可信
  assert.equal(classifyCurrent({...base,quality:'valid'},{maxAgeMs:120000,now}).fact,'trusted');
  // 异常质量：null / 未知字符串 / 大小写变体均不得 trusted
  assert.equal(classifyCurrent({...base,quality:null},{maxAgeMs:120000,now}).fact,'suspect');
  assert.equal(classifyCurrent({...base,quality:'unknown'},{maxAgeMs:120000,now}).fact,'suspect');
  assert.equal(classifyCurrent({...base,quality:'Valid'},{maxAgeMs:120000,now}).fact,'suspect');
  // 非法时间
  assert.equal(classifyCurrent({...base,quality:'valid',sampledAt:'not-a-date'},{maxAgeMs:120000,now}).fact,'pending');
  // 未来时间
  const future=classifyCurrent({...base,quality:'valid',sampledAt:'2026-10-30T12:30:00Z'},{maxAgeMs:120000,now});
  assert.equal(future.fact,'suspect');
  assert(future.reason.includes('未来'));
  // 时效参数非法
  assert.equal(classifyCurrent({...base,quality:'valid'},{maxAgeMs:0,now}).fact,'pending');
  assert.equal(classifyCurrent({...base,quality:'valid'},{maxAgeMs:-5,now}).fact,'pending');
  // 边界：恰好等于 maxAge 仍为可信，超出即过期
  const edge=Date.parse('2026-10-30T11:58:00Z');
  assert.equal(classifyCurrent({value:1,unit:'u',quality:'valid',sampledAt:new Date(edge-120000).toISOString(),reasons:[]},{maxAgeMs:120000,now:edge}).fact,'trusted');
  assert.equal(classifyCurrent({value:1,unit:'u',quality:'valid',sampledAt:new Date(edge-120001).toISOString(),reasons:[]},{maxAgeMs:120000,now:edge}).fact,'stale');
});

test('R01 补丁：状态与对象严格绑定，切换瞬间不展示旧对象数据',()=>{
  const stateA={
    objectId:'obj-a',version:1,
    points:[{id:'p1',name:'溶解氧',code:'DO-1',metric:'dissolved_oxygen',unit:'mg/L'}],
    current:[{pointId:'p1',current:{value:6.1,unit:'mg/L',quality:'valid',sampledAt:'2026-10-30T11:59:00Z',reasons:[]}}],
    alerts:[{id:'a1',title:'告警A',state:'open',severity:'warning'}],
    batches:[{id:'b1',object_id:'obj-a',code:'PC-1',species:'虾',variety:null,stage:'养成期',source:'仅测试',verified:true,started_at:'2026-05-01T00:00:00Z',ended_at:null,supersedes_id:null}],
    pointsSource:'ok' as const,currentSource:'ok' as const,alertsSource:'ok' as const,batchSource:'ok' as const,
  };
  // 同一对象：放行
  const same=bindStateToObject(stateA,'obj-a');
  assert.equal(same.points.length,1);
  assert.equal(same.batches.length,1);
  // 切换瞬间（新对象首次渲染，加载尚未开始/完成）：全部清空并回到加载态
  const switched=bindStateToObject(stateA,'obj-b');
  assert.equal(switched.points.length,0,'切换瞬间不得展示旧测点');
  assert.equal(switched.alerts.length,0,'切换瞬间不得展示旧告警');
  assert.equal(switched.batches.length,0,'切换瞬间不得展示旧批次');
  assert.equal(switched.pointsSource,'loading');
  assert.equal(switched.batchSource,'loading');
  // 无选中对象：同样清空
  assert.equal(bindStateToObject(stateA,null).points.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {currentBatch,buildTopIndicators} from '../../src/app/(platform)/farm-overview/detail-data';
import {formatArea,areaPresentation} from '../../src/app/(platform)/farm-overview/detail-area';

const batchRow={id:'b1',object_id:'o1',code:'PC-1',species:'水稻',variety:'甬优',stage:'分蘖期',source:'仅测试',verified:true,started_at:'2026-05-01T00:00:00Z',ended_at:null,supersedes_id:null};

test('F04 当前批次：取最新未结束未更正批次，未核实只作待核实',()=>{
  assert.equal(currentBatch([batchRow],'o1').state,'trusted');
  assert.equal(currentBatch([{...batchRow,verified:false}],'o1').state,'pending');
  assert.equal(currentBatch([],'o1').state,'none');
  assert.equal(currentBatch([{...batchRow,ended_at:'2026-06-01T00:00:00Z'}],'o1').state,'none','已结束批次不算当前');
  // 被更正的旧批次不算当前
  const superseded={...batchRow,id:'b0',started_at:'2026-04-01T00:00:00Z'};
  const replacing={...batchRow,supersedes_id:'b0'};
  const result=currentBatch([superseded,replacing],'o1');
  assert.equal(result.batch?.id,'b1');
  assert.equal(currentBatch([batchRow],'o2').state,'none','其他对象的批次不串用');
});

test('R02-B 塘口顶部指标槽位：最多两个，多测点无代表不取值',()=>{
 const p=(id:string,metric:string,fact:'trusted'|'pending',value:number|null)=>({id,name:id,code:id,metric,unit:'mg/L',fact,value,valueUnit:value===null?null:'mg/L',sampledAt:null,reason:''});
 // 两个单测点指标 → 两个数值槽
 let slots=buildTopIndicators([p('d1','dissolved_oxygen','trusted',6.1),p('w1','water_temp','trusted',25.1)]);
 assert.deepEqual(slots.map(s=>s.kind),['single','single']);
 // 同指标两个可信测点且无代表点 → 一个「多个测点」槽，不取值
 slots=buildTopIndicators([p('d1','dissolved_oxygen','trusted',6.1),p('d2','dissolved_oxygen','trusted',5.8),p('w1','water_temp','trusted',25.1)]);
 assert.equal(slots[0].kind,'multi');
 assert(slots[0].kind==='multi'&&slots[0].count===2,'多测点槽应带测点数');
 assert.equal(slots[1].kind,'single');
 // 非可信测点不进槽位；无可信值时为空
 assert.equal(buildTopIndicators([p('d1','dissolved_oxygen','pending',null)]).length,0);
 // 最多两个指标位置
 slots=buildTopIndicators([p('a','m1','trusted',1),p('b','m2','trusted',2),p('c','m3','trusted',3)]);
 assert.equal(slots.length,2);
});

test('F04 面积格式化：亩为主、㎡为辅，大数值降精度',()=>{
  assert.deepEqual(formatArea(666.6667),{mu:'1.0 亩',sqm:'约 667 ㎡'});
  assert.deepEqual(formatArea(1065000),{mu:'1597 亩',sqm:'约 106.5 万㎡'});
  assert.equal(formatArea(null),null);
  assert.equal(formatArea(0),null);
});

test('R01 面积口径：CAD 施工范围不得称管理范围，登记边界按核实状态标注',()=>{
 const cad=areaPresentation({code:'CAD-MXL-T01',boundary_status:'draft'});
 assert.equal(cad.label,'竣工图施工参考面积');
 assert(!cad.label.includes('管理范围'),'CAD 施工范围不得称管理范围');
 assert(cad.note.includes('尚未核实'));
 assert.equal(areaPresentation({code:'cun-1',boundary_status:'verified'}).label,'管理范围面积');
 assert.equal(areaPresentation({code:'cun-2',boundary_status:'draft'}).label,'管理范围面积');
 assert(areaPresentation({code:'cun-2',boundary_status:'draft'}).note.includes('尚未核实'));
});

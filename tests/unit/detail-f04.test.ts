import test from 'node:test';
import assert from 'node:assert/strict';
import {currentBatch,pickTrustedIndicators} from '../../src/app/(platform)/farm-overview/detail-data';
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

test('F04 摘要水体指标：最多两个可信值，不合并不跳过规则',()=>{
  const views=[
   {id:'p1',name:'溶解氧 1 号',code:'DO-1',metric:'dissolved_oxygen',unit:'mg/L',fact:'trusted' as const,value:6.1,valueUnit:'mg/L',sampledAt:null,reason:''},
   {id:'p2',name:'溶解氧 2 号',code:'DO-2',metric:'dissolved_oxygen',unit:'mg/L',fact:'trusted' as const,value:5.8,valueUnit:'mg/L',sampledAt:null,reason:''},
   {id:'p3',name:'水温',code:'WT-1',metric:'water_temp',unit:'°C',fact:'trusted' as const,value:25.1,valueUnit:'°C',sampledAt:null,reason:''},
   {id:'p4',name:'pH',code:'PH-1',metric:'ph',unit:'',fact:'pending' as const,value:null,valueUnit:null,sampledAt:null,reason:'暂无可信当前值'},
  ];
  const picked=pickTrustedIndicators(views,2);
  assert.equal(picked.length,2,'至多两个');
  assert.deepEqual(picked.map(p=>p.id),['p1','p2'],'同指标多测点都保留、不合并');
  assert(!picked.some(p=>p.fact!=='trusted'),'非可信值不进摘要');
  assert.equal(pickTrustedIndicators([views[3]],2).length,0);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {trustedSubtype,selectOpeningView,orderGateMetrics,type PointView} from '../../src/app/(platform)/farm-overview/detail-data';
import {resolveBusinessClass} from '../../src/app/(platform)/farm-overview/detail-classes';

const point=(id:string,metric:string,fact:PointView['fact'],value:number|null=null):PointView=>({id,name:id,code:id,metric,unit:'%',fact,value,valueUnit:value===null?null:'%',sampledAt:value===null?null:'2026-10-29T10:00:00Z',reason:''});

test('F05 设施子类采信：仅已核实子类生效，未核实/未知/缺失一律回退',()=>{
  assert.equal(trustedSubtype('gate',true),'gate');
  assert.equal(trustedSubtype('pump_station',true),'pump_station');
  assert.equal(trustedSubtype('gate',false),null);
  assert.equal(trustedSubtype('gate',null),null);
  assert.equal(trustedSubtype('sluice',true),null,'未识别子类名不放行');
  assert.equal(trustedSubtype(null,true),null);
  // 分发联动：真实模式只有 verified 子类才分流；名称/symbol 不构成依据
  assert.equal(resolveBusinessClass({kind:'facility',facility_subtype:'gate',subtype_verified:true},false),'gate');
  assert.equal(resolveBusinessClass({kind:'facility',facility_subtype:'gate',subtype_verified:false},false),'generic');
  assert.equal(resolveBusinessClass({kind:'facility',symbol:'gate'},false),'generic');
  assert.equal(resolveBusinessClass({kind:'facility',name:'沙湾1号水闸'} as never,false),'generic');
});

test('F05 实际开度摘要：单测点取值、多测点不合成、设置开度与不可信值不参与',()=>{
  assert.equal(selectOpeningView([]).kind,'none');
  assert.equal(selectOpeningView([point('o1','opening','trusted',65)]).view?.value,65);
  assert.equal(selectOpeningView([point('o1','opening','trusted',65),point('o2','opening','trusted',60)]).kind,'multiple','多个可信开度测点不合成');
  assert.equal(selectOpeningView([point('s1','set_opening','trusted',40)]).kind,'none','设置开度不算实际开度');
  assert.equal(selectOpeningView([point('o1','opening','suspect')]).kind,'none','不可信开度不作为当前值');
});

test('F05 运行信息排序：实际开度第一、设置开度第二、其余保持登记顺序',()=>{
  const ordered=orderGateMetrics([point('w','water_level','trusted'),point('s','set_opening','trusted'),point('o','opening','trusted'),point('f','instantaneous_flow','trusted')]);
  assert.deepEqual(ordered.map(p=>p.metric),['opening','set_opening','water_level','instantaneous_flow']);
});

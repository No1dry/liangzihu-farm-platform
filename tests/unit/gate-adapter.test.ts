import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGate, gateDeviceFromTopic } from '../../src/adapters/gate/adapter';
import type { GateContract } from '../../src/adapters/gate/contract';
// 以下契约与报文全部为合成样例，仅测试用途，不代表三诚真实协议已核实。
const contract:GateContract={version:'synthetic-v1',reference:'合成字段，仅测试，无厂家协议依据',verified:true,synthetic:true,sourceId:'s',
  topicPrefix:'/synthetic/gate/publish/',directionKey:'dir',expectedDirection:'up',wrapperKey:'params',rowsKey:'r_data',nameKey:'name',valueKey:'value',errorKey:'err',
  sampledAtKeys:['sys_time','id'],identityKeys:['sys_sn','sys_imei','sys_time'],
  metrics:[
    {sourceName:'currentMax',metric:'stall_current',sourceUnit:'mA',unit:'mA',scale:1,offset:0},
    {sourceName:'opening',metric:'opening',sourceUnit:'%',unit:'%',scale:1,offset:0},
    {sourceName:'setOpening',metric:'set_opening',sourceUnit:'%',unit:'%',scale:1,offset:0},
    {sourceName:'cumulativeFlows',metric:'cumulative_flow',sourceUnit:'m³',unit:'m³',scale:1,offset:0},
    {sourceName:'waterLevel',metric:'water_level',sourceUnit:'mm',unit:'mm',scale:1,offset:0},
    {sourceName:'instantaneousFlow',metric:'instantaneous_flow',sourceUnit:'m³/s',unit:'m³/s',scale:1,offset:0},
  ],
  mappings:[
    {externalDeviceId:'G1',metric:'stall_current',pointId:'p1'},
    {externalDeviceId:'G1',metric:'opening',pointId:'p2'},
    {externalDeviceId:'G1',metric:'set_opening',pointId:'p3'},
    {externalDeviceId:'G1',metric:'cumulative_flow',pointId:'p4'},
    {externalDeviceId:'G1',metric:'water_level',pointId:'p5'},
    {externalDeviceId:'G1',metric:'instantaneous_flow',pointId:'p6'},
  ]};
// 合成报文：结构照厂家样例，数值与编号均为虚构。
interface SampleMessage{params:{dir:string;id?:string;sys_sn?:string;sys_imei?:string;sys_time?:string;r_data:{name:string;value:number|string;err?:string}[]}}
function sample():SampleMessage{return {params:{dir:'up',id:'1728629601',sys_sn:'SYNTH-SN',sys_imei:'SYNTH-IMEI',sys_time:'1728629601',r_data:[
  {name:'currentMax',value:10006},{name:'pulseEquivalent',value:0},{name:'opening',value:0},{name:'setOpening',value:0},
  {name:'cumulativeFlows',value:0},{name:'waterLevel',value:0},{name:'instantaneousFlow',value:0}]}};}
const at='2026-10-10T00:00:10Z';
test('未核实契约与合成冒充真实均拒绝；主题不符拒绝',()=>{
  assert.throws(()=>normalizeGate(sample(),contract,'G1',at),{code:'GATE_CONTRACT_NOT_READY'});
  assert.throws(()=>normalizeGate(sample(),{...contract,verified:false},'G1',at,'synthetic'),{code:'GATE_CONTRACT_NOT_READY'});
  assert.throws(()=>gateDeviceFromTopic('/other/topic/G1',contract),{code:'GATE_TOPIC'});
  assert.equal(gateDeviceFromTopic('/synthetic/gate/publish/G1',contract),'G1');
});
test('完整报文解析六类测值与单位，未登记的pulseEquivalent跳过，编号与时间按契约组合',()=>{
  const rows=normalizeGate(sample(),contract,'G1',at,'synthetic');
  assert.equal(rows.length,6);
  assert.ok(!rows.some(r=>r.metric==='pulse_equivalent'));
  const opening=rows.find(r=>r.metric==='opening')!;assert.equal(opening.value,0);assert.equal(opening.unit,'%');assert.equal(opening.quality,'valid');
  assert.equal(rows.find(r=>r.metric=='stall_current')!.value,10006);assert.equal(rows.find(r=>r.metric=='stall_current')!.unit,'mA');
  assert.equal(rows.find(r=>r.metric=='water_level')!.unit,'mm');assert.equal(rows.find(r=>r.metric=='instantaneous_flow')!.unit,'m³/s');assert.equal(rows.find(r=>r.metric=='cumulative_flow')!.unit,'m³');
  assert.equal(opening.sampledAt,'2024-10-11T06:53:21.000Z');
  assert.equal(opening.sourceRecordId,'SYNTH-SN/SYNTH-IMEI/1728629601');
  assert.equal(opening.origin,'live');
});
test('err:"1"字段保留原值、值置空并记invalid；不崩溃',()=>{
  const raw=sample();raw.params.r_data[2]={name:'opening',value:12,err:'1'};
  const opening=normalizeGate(raw,contract,'G1',at,'synthetic').find(r=>r.metric==='opening')!;
  assert.equal(opening.rawValue,12);assert.equal(opening.value,null);assert.equal(opening.quality,'invalid');assert.ok(opening.reasons.includes('vendor_field_error'));
});
test('缺sys_time用id兜底；两者都缺不伪造采样时间',()=>{
  const raw=sample();delete raw.params.sys_time;
  assert.equal(normalizeGate(raw,contract,'G1',at,'synthetic')[0].sampledAt,'2024-10-11T06:53:21.000Z');
  delete raw.params.id;
  const rows=normalizeGate(raw,contract,'G1',at,'synthetic');
  assert.equal(rows[0].sampledAt,null);assert.equal(rows[0].quality,'suspect');assert.ok(rows[0].reasons.includes('unknown_sample_time'));
  assert.equal(rows[0].sourceRecordId,'SYNTH-SN/SYNTH-IMEI');
});
test('数字字符串正确解析；非数字记invalid且不崩溃',()=>{
  const raw=sample();raw.params.r_data[2]={name:'opening',value:'42'};
  assert.equal(normalizeGate(raw,contract,'G1',at,'synthetic').find(r=>r.metric==='opening')!.value,42);
  raw.params.r_data[2]={name:'opening',value:'abc'};
  const bad=normalizeGate(raw,contract,'G1',at,'synthetic').find(r=>r.metric==='opening')!;
  assert.equal(bad.rawValue,'abc');assert.equal(bad.value,null);assert.equal(bad.quality,'invalid');assert.ok(bad.reasons.includes('invalid_number'));
});
test('未知字段跳过；映射缺失或重复拒绝而不取第一项；空r_data返回空',()=>{
  const raw=sample();raw.params.r_data.push({name:'mysteryField',value:1});
  assert.equal(normalizeGate(raw,contract,'G1',at,'synthetic').length,6);
  assert.throws(()=>normalizeGate(raw,{...contract,mappings:contract.mappings.filter(m=>m.metric!=='opening')},'G1',at,'synthetic'),{code:'UNMAPPED_DEVICE'});
  assert.throws(()=>normalizeGate(raw,{...contract,mappings:[...contract.mappings,contract.mappings[1]]},'G1',at,'synthetic'),{code:'UNMAPPED_DEVICE'});
  assert.throws(()=>normalizeGate(raw,contract,'G2',at,'synthetic'),{code:'UNMAPPED_DEVICE'});
  const empty=sample();empty.params.r_data=[];assert.deepEqual(normalizeGate(empty,contract,'G1',at,'synthetic'),[]);
  const down=sample();down.params.dir='down';assert.throws(()=>normalizeGate(down,contract,'G1',at,'synthetic'),{code:'INVALID_VENDOR_BODY'});
});

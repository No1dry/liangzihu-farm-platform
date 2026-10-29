import test from 'node:test';
import assert from 'node:assert/strict';
import {toTrendPoints} from '../../src/app/(platform)/farm-overview/detail-data';

const row=(id:string,over:Partial<Parameters<typeof toTrendPoints>[0][number]>={})=>({id,sampled_at:'2026-10-29T10:00:00Z',value:6.1,unit:'mg/L',quality:'valid',conflicted:false,canonical:true,...over});

test('F07 趋势映射：正典有效值保留，冲突/非正典/单位不符不连成有效曲线',()=>{
  const points=toTrendPoints([
    row('a'),
    row('b',{quality:'invalid'}),
    row('c',{conflicted:true}),
    row('d',{canonical:false}),
    row('e',{unit:'°C'}),
    row('f',{value:null}),
    row('g',{sampled_at:''}),
  ],'mg/L');
  assert.deepEqual(points.map(p=>p.id),['a','b','c','d','e','f'],'无采样时间的行丢弃');
  assert.deepEqual(points[0],{id:'a',time:Date.parse('2026-10-29T10:00:00Z'),value:6.1,valid:true});
  assert.equal(points[1].valid,false,'质量无效标记待核');
  assert.equal(points[2].valid,false,'冲突标记待核');
  assert.equal(points[3].value,null,'非正典不取值');
  assert.equal(points[4].value,null,'单位不符不取值');
  assert.equal(points[5].value,null,'空值保持空值不补零');
});

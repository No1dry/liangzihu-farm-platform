import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBusinessClass,tabsFor,resolveActiveTab} from '../../src/app/(platform)/farm-overview/detail-classes';

test('详情框架业务类型分发：正式对象按 kind，设施回退通用，演示 symbol 不构成正式身份',()=>{
  assert.equal(resolveBusinessClass({kind:'field'},false),'field');
  assert.equal(resolveBusinessClass({kind:'pond'},false),'pond');
  assert.equal(resolveBusinessClass({kind:'farm'},false),'farm');
  assert.equal(resolveBusinessClass({kind:'mobile'},false),'mobile');
  assert.equal(resolveBusinessClass({kind:'mobile'},true),'mobile');
  // 真实模式：任何 facility（即使带演示 symbol/名称暗示）都回退通用设施
  assert.equal(resolveBusinessClass({kind:'facility'},false),'generic');
  assert.equal(resolveBusinessClass({kind:'facility',symbol:'gate'},false),'generic');
  assert.equal(resolveBusinessClass({kind:'facility',symbol:'pump'},false),'generic');
  // 未覆盖类型（如 channel）同样回退通用设施概要
  assert.equal(resolveBusinessClass({kind:'channel'},false),'generic');
  // 演示模式：symbol 仅驱动演示骨架
  assert.equal(resolveBusinessClass({kind:'facility',symbol:'gate'},true),'gate');
  assert.equal(resolveBusinessClass({kind:'facility',symbol:'pump'},true),'pump_station');
  assert.equal(resolveBusinessClass({kind:'facility'},true),'generic');
});

test('详情框架三标签：首标签基本信息、末标签相关记录、中标签按业务类配置',()=>{
  assert.deepEqual(tabsFor('field').map(t=>t.label),['基本信息','农事生产','相关记录']);
  assert.deepEqual(tabsFor('pond').map(t=>t.label),['基本信息','水体监测','相关记录']);
  assert.deepEqual(tabsFor('gate').map(t=>t.label),['基本信息','运行信息','相关记录']);
  assert.deepEqual(tabsFor('pump_station').map(t=>t.label),['基本信息','运行信息','相关记录']);
  assert.deepEqual(tabsFor('generic').map(t=>t.label),['基本信息','关联设备','相关记录']);
  assert.deepEqual(tabsFor('farm').map(t=>t.label),['基本信息','相关记录']);
  assert.deepEqual(tabsFor('mobile').map(t=>t.label),['基本信息','相关记录']);
});

test('详情框架标签合法性：当前标签对新业务类失效时回退基本信息',()=>{
  assert.equal(resolveActiveTab('production','field'),'production');
  assert.equal(resolveActiveTab('production','pond'),'basic');
  assert.equal(resolveActiveTab('operation','gate'),'operation');
  assert.equal(resolveActiveTab('operation','generic'),'basic');
  assert.equal(resolveActiveTab('records','farm'),'records');
});

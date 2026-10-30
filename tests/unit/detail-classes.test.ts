import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBusinessClass,tabsFor,resolveActiveTab,nextTabOnSelection,recordFiltersFor,scopeBadge} from '../../src/app/(platform)/farm-overview/detail-classes';

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

test('F02 跨对象切换标签规则：首次不重置、同类保留、跨类回基本信息',()=>{
  // 首次建立选择（含会话恢复）：保留当前标签
  assert.equal(nextTabOnSelection(null,'field','records'),'records');
  // 同类 A→B：保留适用标签
  assert.equal(nextTabOnSelection('field','field','production'),'production');
  assert.equal(nextTabOnSelection('gate','gate','operation'),'operation');
  // 跨类：回基本信息（含 gate↔pump 同 kind 不同业务类）
  assert.equal(nextTabOnSelection('field','pond','production'),'basic');
  assert.equal(nextTabOnSelection('gate','pump_station','operation'),'basic');
  assert.equal(nextTabOnSelection('field','generic','production'),'basic');
  // 进出片区/机动设备视为跨类
  assert.equal(nextTabOnSelection('region','field','records'),'basic');
  assert.equal(nextTabOnSelection('field','region','production'),'basic');
  // 同类但标签失效时回退合法标签
  assert.equal(nextTabOnSelection('generic','generic','production'),'basic');
  // 选择清空：不重置
  assert.equal(nextTabOnSelection('field',null,'records'),'records');
});

test('R02-B 记录筛选类别按业务类配置：塘口养殖、农田农事、水闸泵站操作',()=>{
 assert.deepEqual(recordFiltersFor('field').map(f=>f.label),['全部','农事','巡检','告警']);
 assert.deepEqual(recordFiltersFor('pond').map(f=>f.label),['全部','养殖','巡检','告警','维护']);
 assert.deepEqual(recordFiltersFor('gate').map(f=>f.label),['全部','操作','巡检','告警','维护']);
 assert.deepEqual(recordFiltersFor('pump_station').map(f=>f.label),['全部','操作','巡检','告警','维护']);
});

test('R02-B 空间状态徽标：农田塘口用范围、设施用位置，不从几何推断核实',()=>{
 assert.deepEqual(scopeBadge('field',{geometry:null,boundary_status:'unknown'}),{text:'范围未登记',status:'待登记'});
 assert.deepEqual(scopeBadge('pond',{geometry:{},boundary_status:'draft'}),{text:'范围待核对',status:'草稿'});
 assert.deepEqual(scopeBadge('gate',{geometry:{},boundary_status:'draft'}),{text:'位置待核对',status:'草稿'});
 assert.deepEqual(scopeBadge('pump_station',{geometry:{},boundary_status:'verified'}),{text:'位置已核实',status:'已核实'});
 assert.deepEqual(scopeBadge('generic',{geometry:null,boundary_status:'unknown'}),{text:'位置未登记',status:'待登记'});
 assert.deepEqual(scopeBadge('field',{geometry:{},boundary_status:'verified'}),{text:'范围已核实',status:'已核实'});
});

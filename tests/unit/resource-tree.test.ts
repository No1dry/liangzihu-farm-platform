import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTreeData, filterTreeData, findNodeByKey, getDefaultExpandedKeys } from '../../src/app/(platform)/farm-overview/resource-tree-helpers';

const farm = { id: 'farm-1', name: '梁子湖农场' };
const regionA = { id: 'reg-a', farmId: farm.id, name: '甲村', version: 1, archivedAt: null, links: [{ objectId: 'obj-1' }] };
const regionB = { id: 'reg-b', farmId: farm.id, name: '乙村', version: 1, archivedAt: null, links: [{ objectId: 'obj-2' }] };
const archivedRegion = { id: 'reg-arch', farmId: farm.id, name: '归档村', version: 1, archivedAt: '2026-10-16T00:00:00Z', links: [] };
const field1 = { id: 'obj-1', farm_id: farm.id, name: '甲村东片田', code: 'F-01', kind: 'field', version: 1, boundary_status: 'draft', geometry: null };
const pond1 = { id: 'obj-2', farm_id: farm.id, name: '乙村塘 A', code: 'P-01', kind: 'pond', version: 1, boundary_status: 'verified', geometry: null };
const unassignedFacility = { id: 'obj-3', farm_id: farm.id, name: '未归类闸', code: 'FAC-01', kind: 'facility', version: 1, boundary_status: 'draft', geometry: null };

test('buildTreeData 真实模式按农场→村庄→对象组织，过滤已归档村庄与机动设备', () => {
  const tree = buildTreeData({
    mode: 'real',
    items: [field1, pond1, unassignedFacility],
    regions: [regionA, regionB, archivedRegion],
    farms: [farm],
  });
  assert.equal(tree.length, 1);
  const root = tree[0];
  assert.equal(root.key, `farm:${farm.id}`);
  assert.equal(root.children?.length, 3);
  const regionKeys = root.children?.map(n => n.key);
  assert.ok(regionKeys?.includes(`region:${regionA.id}`));
  assert.ok(regionKeys?.includes(`region:${regionB.id}`));
  assert.ok(regionKeys?.includes(`unassigned:${farm.id}`));
  assert.ok(!regionKeys?.includes(`region:${archivedRegion.id}`));

  const nodeA = root.children?.find(n => n.key === `region:${regionA.id}`);
  assert.equal(nodeA?.children?.length, 1);
  assert.equal(nodeA?.children?.[0].key, field1.id);

  const unassigned = root.children?.find(n => n.key === `unassigned:${farm.id}`);
  assert.equal(unassigned?.children?.length, 1);
  assert.equal(unassigned?.children?.[0].key, unassignedFacility.id);
});

test('buildTreeData 演示模式使用 fixture 构造同款结构', () => {
  const demoRegion = { id: 'demo-reg', farmId: 'demo-farm', name: '沙湾', version: 1, archivedAt: null as string | null, links: [{ objectId: 'demo-obj' }] };
  const demoItem = { id: 'demo-obj', farmId: 'demo-farm', name: '演示田', code: 'D-01', kind: 'field', version: 1, boundary_status: 'draft', geometry: null };
  const tree = buildTreeData({
    mode: 'demo',
    items: [],
    regions: [],
    farms: [],
    demoRegions: [demoRegion],
    demoItems: [demoItem],
  });
  assert.equal(tree.length, 1);
  assert.equal(tree[0].key, `farm:${demoRegion.farmId}`);
  assert.equal(tree[0].children?.[0].key, `region:${demoRegion.id}`);
  assert.equal(tree[0].children?.[0].children?.[0].key, demoItem.id);
});

test('filterTreeData 命中保留父路径并返回临时展开键', () => {
  const tree = buildTreeData({
    mode: 'real',
    items: [field1, pond1, unassignedFacility],
    regions: [regionA, regionB],
    farms: [farm],
  });
  const result = filterTreeData(tree, '甲村东片');
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].key, `farm:${farm.id}`);
  assert.equal(result.nodes[0].children?.length, 1);
  assert.equal(result.nodes[0].children?.[0].key, `region:${regionA.id}`);
  assert.equal(result.nodes[0].children?.[0].children?.[0].key, field1.id);
  assert.ok(result.expandedKeys.has(`farm:${farm.id}`));
  assert.ok(result.expandedKeys.has(`region:${regionA.id}`));
});

test('filterTreeData 空查询返回原树', () => {
  const tree = buildTreeData({ mode: 'real', items: [field1], regions: [regionA], farms: [farm] });
  const result = filterTreeData(tree, '  ');
  assert.equal(result.nodes, tree);
  assert.equal(result.expandedKeys.size, 0);
});

test('getDefaultExpandedKeys 展开所有农场与村庄节点', () => {
  const tree = buildTreeData({ mode: 'real', items: [field1, pond1], regions: [regionA, regionB], farms: [farm] });
  const keys = getDefaultExpandedKeys(tree);
  assert.ok(keys.includes(`farm:${farm.id}`));
  assert.ok(keys.includes(`region:${regionA.id}`));
  assert.ok(keys.includes(`region:${regionB.id}`));
  assert.ok(!keys.includes(field1.id));
});

test('findNodeByKey 可跨层级查找对象节点', () => {
  const tree = buildTreeData({ mode: 'real', items: [field1], regions: [regionA], farms: [farm] });
  const found = findNodeByKey(tree, field1.id);
  assert.ok(found);
  assert.equal(found?.kind, 'object');
  assert.equal(found?.item?.id, field1.id);
});

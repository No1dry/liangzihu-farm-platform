import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { withDb } from '../support/db';
import { withApp } from '../support/app';
import { actorFixture, objectFixture, permit } from '../support/fixtures';

test('M2-C 资源树展开/定位/搜索/归档/回收站在桌面与手机可用', { timeout: 120_000 }, () => withDb(async pool => {
  const actor = await actorFixture(pool, 'owner');
  const farm = await objectFixture(pool, actor.id);
  await permit(pool, actor.id, farm, ['read', 'configure']);

  await pool.query("UPDATE objects SET code='M2C-FARM',name='M2C 测试农场',kind='farm' WHERE id=$1", [farm]);
  const fieldA = await objectFixture(pool, actor.id);
  const fieldB = await objectFixture(pool, actor.id);
  const unlocated = await objectFixture(pool, actor.id);
  const facility = await objectFixture(pool, actor.id);
  const fieldC = await objectFixture(pool, actor.id);
  const pondC = await objectFixture(pool, actor.id);

  await pool.query("UPDATE objects SET parent_id=$2,name='东片田',code='M2C-A',kind='field',boundary_status='verified',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.63 30.24,114.63 30.25,114.62 30.25,114.62 30.24))',4326) WHERE id=$1", [fieldA, farm]);
  await pool.query("UPDATE objects SET parent_id=$2,name='北片田',code='M2C-B',kind='field',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.64 30.26,114.65 30.26,114.65 30.27,114.64 30.27,114.64 30.26))',4326) WHERE id=$1", [fieldB, farm]);
  await pool.query("UPDATE objects SET parent_id=$2,name='未登记塘口',code='M2C-U',kind='pond',boundary_status='draft' WHERE id=$1", [unlocated, farm]);
  await pool.query("UPDATE objects SET parent_id=$2,name='1号闸',code='M2C-F',kind='facility',boundary_status='draft',boundary=ST_GeomFromText('POINT(114.625 30.245)',4326) WHERE id=$1", [facility, farm]);
  await pool.query("UPDATE objects SET parent_id=$2,name='丙片田',code='M2C-C1',kind='field',boundary_status='draft' WHERE id=$1", [fieldC, farm]);
  await pool.query("UPDATE objects SET parent_id=$2,name='丙塘口',code='M2C-C2',kind='pond',boundary_status='draft' WHERE id=$1", [pondC, farm]);

  for (const id of [fieldA, fieldB, unlocated, facility, fieldC, pondC]) await permit(pool, actor.id, id, ['read', 'configure']);

  const regionA = (await pool.query("INSERT INTO map_regions(farm_id,name,source,created_by) VALUES($1,'甲村','测试',$2) RETURNING id", [farm, actor.id])).rows[0].id;
  const regionB = (await pool.query("INSERT INTO map_regions(farm_id,name,source,created_by) VALUES($1,'乙村','测试',$2) RETURNING id", [farm, actor.id])).rows[0].id;
  const regionC = (await pool.query("INSERT INTO map_regions(farm_id,name,source,created_by) VALUES($1,'丙村','测试',$2) RETURNING id", [farm, actor.id])).rows[0].id;
  await pool.query('INSERT INTO map_region_links(region_id,object_id,source,created_by) VALUES($1,$2,$3,$4)', [regionA, fieldA, '测试', actor.id]);
  await pool.query('INSERT INTO map_region_links(region_id,object_id,source,created_by) VALUES($1,$2,$3,$4)', [regionA, unlocated, '测试', actor.id]);
  await pool.query('INSERT INTO map_region_links(region_id,object_id,source,created_by) VALUES($1,$2,$3,$4)', [regionB, fieldB, '测试', actor.id]);
  await pool.query('INSERT INTO map_region_links(region_id,object_id,source,created_by) VALUES($1,$2,$3,$4)', [regionB, facility, '测试', actor.id]);
  await pool.query('INSERT INTO map_region_links(region_id,object_id,source,created_by) VALUES($1,$2,$3,$4)', [regionC, fieldC, '测试', actor.id]);
  await pool.query('INSERT INTO map_region_links(region_id,object_id,source,created_by) VALUES($1,$2,$3,$4)', [regionC, pondC, '测试', actor.id]);

  await withApp(pool, async app => {
    const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.accept());

    try {
      await context.addCookies([{ name: 'agri_session', value: await app.authenticate(actor), url: app.origin }]);
      await page.goto(app.origin + '/farm-overview');
      await page.getByRole('heading', { name: '农场空间总览' }).waitFor();

      await page.getByRole('button', { name: '东片田', exact: true }).waitFor();
      await page.getByRole('button', { name: '北片田', exact: true }).waitFor();
      await page.getByRole('button', { name: '1号闸', exact: true }).waitFor();
      await page.getByRole('button', { name: '未登记塘口', exact: true }).waitFor();
      await page.getByRole('button', { name: '丙片田', exact: true }).waitFor();
      await page.getByRole('button', { name: '丙塘口', exact: true }).waitFor();
      await page.getByRole('button', { name: '甲村 操作菜单' }).waitFor();
      await page.getByRole('button', { name: '乙村 操作菜单' }).waitFor();
      await page.getByRole('button', { name: '丙村 操作菜单' }).waitFor();
      // 独立折叠/展开：乙村箭头只影响自身，甲/丙不受影响
      await page.locator('.rc-tree-treenode', { hasText: '乙村' }).locator('.rc-tree-switcher').click();
      await page.waitForTimeout(200);
      assert.equal(await page.getByRole('button', { name: '北片田', exact: true }).count(), 0, '折叠乙村应隐藏其子对象');
      assert.equal(await page.getByRole('button', { name: '东片田', exact: true }).count(), 1, '折叠乙村不应影响甲村对象');
      assert.equal(await page.getByRole('button', { name: '丙片田', exact: true }).count(), 1, '折叠乙村不应影响丙村对象');
      await page.locator('.rc-tree-treenode', { hasText: '乙村' }).locator('.rc-tree-switcher').click();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: '北片田', exact: true }).waitFor();

      await mkdir('docs/acceptance/m2c', { recursive: true });
      const map = page.getByRole('application', { name: /天地图.*已授权农业对象边界/ });
      const initialCenter = await map.getAttribute('data-view-center');
      await page.screenshot({ path: 'docs/acceptance/m2c/2026-10-18-M2C树形目录桌面.png', fullPage: true });

      const zoomBeforeObject = Number(await map.getAttribute('data-view-zoom'));
      await page.getByRole('button', { name: '东片田', exact: true }).click();
      await page.getByRole('complementary', { name: '对象详情' }).getByRole('heading', { name: '东片田' }).waitFor();
      await page.waitForTimeout(350);
      const afterObjectCenter = await map.getAttribute('data-view-center');
      assert.notEqual(afterObjectCenter, initialCenter, '点击对象后地图中心应移动');
      const zoomAfterObject = Number(await map.getAttribute('data-view-zoom'));
      assert(zoomAfterObject > zoomBeforeObject, '点击对象后应放大定位');

      await page.getByRole('button', { name: '关闭对象详情' }).click();
      await page.getByRole('button', { name: '定位村庄 甲村' }).click();
      await page.waitForTimeout(350);
      const afterRegionCenter = await map.getAttribute('data-view-center');
      assert.notEqual(afterRegionCenter, afterObjectCenter, '点击村庄后地图中心应移动到关联范围');

      const zoomAfterRegion = Number(await map.getAttribute('data-view-zoom'));
      await page.getByRole('button', { name: '北片田', exact: true }).click();
      await page.waitForTimeout(350);
      const zoomAfterSmallField = Number(await map.getAttribute('data-view-zoom'));
      assert(zoomAfterSmallField > zoomAfterRegion, '视野内小农田点击后应进一步放大');
      await page.getByRole('button', { name: '关闭对象详情' }).click();

      // 地图点击对象 → 树同步选中并打开详情（先定位回甲村确保东片田在视野内）
      await page.getByRole('button', { name: '定位村庄 甲村' }).click();
      await page.waitForTimeout(400);
      const boxB = await map.boundingBox(); assert(boxB);
      const centerB = (await map.getAttribute('data-view-center'))!.split(',').map(Number);
      const zoomB = Number(await map.getAttribute('data-view-zoom'));
      const resB = 156543.03392804097 / Math.pow(2, zoomB);
      const R2 = 6378137, D2R = Math.PI / 180;
      const mx = R2 * 114.621 * D2R, my = R2 * Math.log(Math.tan(Math.PI / 4 + 30.241 * D2R / 2));
      const px = boxB.width / 2 + (mx - centerB[0]) / resB, py = boxB.height / 2 - (my - centerB[1]) / resB;
      await page.mouse.click(boxB.x + px, boxB.y + py); await page.waitForTimeout(400);
      await page.getByRole('complementary', { name: '对象详情' }).getByRole('heading', { name: '东片田' }).waitFor();
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: '关闭对象详情' }).click();

      const centerBeforeUnlocated = await map.getAttribute('data-view-center');
      await page.getByRole('button', { name: '未登记塘口', exact: true }).click();
      await page.getByRole('complementary', { name: '对象详情' }).getByRole('heading', { name: '未登记塘口' }).waitFor();
      await page.getByRole('status').filter({ hasText: '尚未登记地图位置' }).waitFor();
      await page.waitForTimeout(350);
      assert.equal(await map.getAttribute('data-view-center'), centerBeforeUnlocated, '无边界对象点击不应移动视图');

      // 先折叠乙村，搜索时父级临时展开；清空后恢复折叠
      await page.locator('.rc-tree-treenode', { hasText: '乙村' }).locator('.rc-tree-switcher').click();
      await page.waitForTimeout(200);
      const search = page.getByRole('searchbox', { name: '搜索名称或编号' });
      await search.fill('北片田');
      await page.waitForTimeout(250);
      assert.equal(await page.getByRole('button', { name: '北片田', exact: true }).count(), 1, '搜索命中子节点应临时展开父村庄');
      assert.equal(await page.getByRole('button', { name: '东片田', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: '乙村 操作菜单' }).count(), 1, '搜索时父级村庄仍可见');
      await search.fill('');
      await page.waitForTimeout(250);
      assert.equal(await page.getByRole('button', { name: '北片田', exact: true }).count(), 0, '清空搜索后应恢复乙村折叠状态');
      await page.getByRole('button', { name: '东片田', exact: true }).waitFor();
      await page.locator('.rc-tree-treenode', { hasText: '乙村' }).locator('.rc-tree-switcher').click();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: '北片田', exact: true }).waitFor();

      // 更改所属村庄：两个村庄目录立即更新，关联历史保留
      await page.getByRole('button', { name: '北片田 操作菜单' }).click();
      await page.getByRole('menuitem', { name: '更改所属村庄' }).click();
      await page.getByLabel('新归属村庄').selectOption('丙村');
      await page.getByLabel('变更依据').fill('M2-C 改归属验收');
      await page.getByRole('button', { name: '保存归属' }).click();
      await page.waitForTimeout(500);
      assert.equal(await page.locator('.rc-tree-treenode', { hasText: '乙村' }).getByRole('button', { name: '北片田', exact: true }).count(), 0, '北片田应移出乙村');
      assert.equal(await page.locator('.rc-tree-treenode', { hasText: '丙村' }).getByRole('button', { name: '北片田', exact: true }).count(), 1, '北片田应出现在丙村');
      const regionLinks = (await pool.query('SELECT region_id,valid_to FROM map_region_links WHERE object_id=$1 ORDER BY valid_from', [fieldB])).rows;
      assert.equal(regionLinks.length, 2, '改归属应保留两条关联历史');
      assert.equal(regionLinks[0].region_id, regionB);
      assert.ok(regionLinks[0].valid_to, '原关联应已结束');
      assert.equal(regionLinks[1].region_id, regionC);
      assert.equal(regionLinks[1].valid_to, null, '新关联应为当前有效');

      // 归档村庄：历史保留、对象不连带；恢复后关联不自动恢复
      await page.getByRole('button', { name: '甲村 操作菜单' }).click();
      await page.getByRole('menuitem', { name: '移至回收站' }).click();
      await page.waitForTimeout(600);
      const archivedRegion = (await pool.query('SELECT archived_at FROM map_regions WHERE id=$1', [regionA])).rows[0];
      assert.ok(archivedRegion.archived_at, '村庄应已归档');
      const fieldAfterRegionArchive = (await pool.query('SELECT archived_at FROM objects WHERE id=$1', [fieldA])).rows[0];
      assert.equal(fieldAfterRegionArchive.archived_at, null, '归档村庄不得连带删除农田');
      const endedLinks = (await pool.query('SELECT count(*) AS n FROM map_region_links WHERE region_id=$1 AND valid_to IS NOT NULL', [regionA])).rows[0];
      assert.ok(Number(endedLinks.n) >= 1, '村庄关联历史应保留');
      assert.equal(await page.getByRole('button', { name: '定位村庄 甲村' }).count(), 0, '归档村庄应从正常目录消失');
      await page.getByRole('button', { name: '回收站' }).click();
      await page.getByRole('complementary', { name: '回收站' }).waitFor();
      await page.locator('li', { hasText: '甲村' }).getByRole('button', { name: '恢复' }).click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: '定位村庄 甲村' }).waitFor();
      const activeLinks = (await pool.query('SELECT count(*) AS n FROM map_region_links WHERE region_id=$1 AND valid_to IS NULL', [regionA])).rows[0];
      assert.equal(Number(activeLinks.n), 0, '恢复村庄不得自动恢复历史关联');

      // 无权限账号：无归档菜单项且归档 API 403
      const worker = await actorFixture(pool, 'worker');
      await permit(pool, worker.id, farm, ['read']);
      await permit(pool, worker.id, fieldB, ['read']);
      const workerContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
      await workerContext.addCookies([{ name: 'agri_session', value: await app.authenticate(worker), url: app.origin }]);
      const workerPage = await workerContext.newPage();
      await workerPage.goto(app.origin + '/farm-overview');
      await workerPage.getByRole('button', { name: '北片田', exact: true }).waitFor();
      await workerPage.getByRole('button', { name: '北片田 操作菜单' }).click();
      await workerPage.getByRole('menuitem', { name: '地图定位' }).waitFor();
      assert.equal(await workerPage.getByRole('menuitem', { name: '移至回收站' }).count(), 0, '无配置权不应出现归档菜单');
      const deny = await workerContext.request.post(app.origin + '/api/v1/objects/archive', { headers: { Origin: app.origin }, data: { id: fieldB, version: 1, archived: true, reason: '越权测试' } });
      assert.equal(deny.status(), 403);
      await workerContext.close();

      console.log('TREE-DEBUG:', (await page.locator('div[class*=treeWrap]').innerText()).split('\n').join('|'));
      console.log('MENU-BTN count:', await page.getByRole('button', { name: '东片田 操作菜单' }).count(), 'TITLE count:', await page.getByRole('button', { name: '东片田', exact: true }).count());
      await page.getByRole('button', { name: '东片田 操作菜单' }).click();
      await page.getByRole('menuitem', { name: '移至回收站' }).click();
      await page.waitForTimeout(500);
      assert.equal(await page.getByRole('button', { name: '东片田', exact: true }).count(), 0);

      await page.getByRole('button', { name: '回收站' }).click();
      await page.getByRole('complementary', { name: '回收站' }).waitFor();
      const restoreRow = page.locator('li', { hasText: '东片田' });
      await restoreRow.getByRole('button', { name: '恢复' }).click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: '东片田', exact: true }).waitFor();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: '☰ 对象目录' }).click();
      await page.getByRole('button', { name: '1号闸 操作菜单' }).click();
      await page.getByRole('menuitem', { name: '地图定位' }).waitFor();
      await page.getByRole('menuitem', { name: '更改所属村庄' }).waitFor();
      await page.screenshot({ path: 'docs/acceptance/m2c/2026-10-18-M2C节点菜单手机.png', fullPage: true });

      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}));

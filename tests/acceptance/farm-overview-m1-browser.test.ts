import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

test('M1 默认矢量底图、底图切换与持久化、类别显隐、图例与移动端',{timeout:150000},()=>withDb(async pool=>{
 const actor=await actorFixture(pool,'worker');
 const farm=await objectFixture(pool,actor.id),field=await objectFixture(pool,actor.id),pond=await objectFixture(pool,actor.id);
 await pool.query("UPDATE objects SET parent_id=$2,name='M1合成农田',code='M1-FIELD',kind='field',boundary_status='verified',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.64 30.24,114.64 30.26,114.62 30.26,114.62 30.24))',4326) WHERE id=$1",[field,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='M1合成塘口',code='M1-POND',kind='pond',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.66 30.24,114.68 30.24,114.68 30.26,114.66 30.26,114.66 30.24))',4326) WHERE id=$1",[pond,farm]);
 await permit(pool,actor.id,field,['read']);await permit(pool,actor.id,pond,['read']);
 await withApp(pool,async app=>{const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'}),page=await context.newPage(),errors:string[]=[],tileUrls:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const url=request.url();if(url.includes('tianditu.gov.cn'))tileUrls.push(url);});try{
  await context.addCookies([{name:'agri_session',value:await app.authenticate(actor),url:app.origin}]);
  await mkdir('docs/acceptance/m1',{recursive:true});
  await page.goto(app.origin+'/farm-overview');
  await page.getByRole('heading',{name:'农场空间总览'}).waitFor();
  await page.getByRole('button',{name:'M1合成农田',exact:true}).waitFor();
  const map=page.getByRole('application');
  await map.waitFor();
  assert.equal(await map.getAttribute('aria-label'),'天地图矢量底图及已授权农业对象边界');
  assert.equal(await map.getAttribute('data-basemap'),'vector','M1 默认底图应为天地图矢量');
  assert.equal(await map.getAttribute('data-annotations'),'true');
  assert.equal(await map.getAttribute('data-mode'),'real');
  const zoom=Number(await map.getAttribute('data-view-zoom'));assert(zoom>=10&&zoom<=18,'默认视图应落在梁子湖农业区缩放范围');
  await page.waitForTimeout(1500);
  assert(tileUrls.some(url=>url.includes('/vec_w/')),'默认应请求天地图矢量底图瓦片');
  assert(tileUrls.some(url=>url.includes('/cva_w/')),'默认应请求矢量注记瓦片');
  assert(tileUrls.every(url=>!url.includes('/img_w/')),'默认不应请求卫星影像瓦片');
  await page.screenshot({path:'docs/acceptance/m1/2026-10-14-M1矢量底图默认视图.png',fullPage:true});

  await page.getByRole('button',{name:'切换为卫星底图'}).click();
  await page.getByRole('application',{name:'天地图卫星影像及已授权农业对象边界'}).waitFor();
  assert.equal(await map.getAttribute('data-basemap'),'satellite');
  await page.waitForTimeout(1500);
  assert(tileUrls.some(url=>url.includes('/img_w/')),'切换后应请求卫星影像瓦片');
  assert(tileUrls.some(url=>url.includes('/cia_w/')),'切换后应请求影像注记瓦片');
  await page.screenshot({path:'docs/acceptance/m1/2026-10-14-M1卫星底图切换.png',fullPage:true});

  await page.reload();
  await page.getByRole('application',{name:'天地图卫星影像及已授权农业对象边界'}).waitFor();
  assert.equal(await map.getAttribute('data-basemap'),'satellite','刷新后应保持卫星底图选择');
  await page.getByRole('button',{name:'切换为矢量底图'}).click();
  await page.getByRole('application',{name:'天地图矢量底图及已授权农业对象边界'}).waitFor();

  await page.getByRole('button',{name:'图层'}).click();
  const panel=page.getByRole('dialog',{name:'地图图层设置'});
  await panel.waitFor();
  await panel.getByText('已核实边界').waitFor();
  await panel.getByText('边界草稿').waitFor();
  await page.screenshot({path:'docs/acceptance/m1/2026-10-14-M1图层面板与图例.png',fullPage:true});
  await panel.getByLabel('显示注记（矢量底图）').uncheck();
  assert.equal(await map.getAttribute('data-annotations'),'false','注记开关应可关闭');
  await panel.getByLabel('显示注记（矢量底图）').check();
  await panel.getByLabel('农田').uncheck();
  await panel.getByLabel('农田').check();
  await panel.getByRole('button',{name:'关闭图层设置'}).click();
  assert.equal(await page.getByRole('dialog',{name:'地图图层设置'}).count(),0);

  await page.getByRole('button',{name:'查看演示效果 ↗'}).click();
  await page.getByRole('application',{name:'天地图矢量底图及合成演示对象'}).waitFor();
  assert.equal(await map.getAttribute('data-mode'),'demo');
  await page.getByRole('button',{name:'沙湾东片水稻田',exact:true}).waitFor();
  await page.getByRole('button',{name:'图层'}).click();
  await page.getByRole('dialog',{name:'地图图层设置'}).getByText('演示区域（非测绘边界）').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog',{name:'地图图层设置'}).count(),0,'Esc 应关闭图层面板');
  await page.screenshot({path:'docs/acceptance/m1/2026-10-14-M1演示模式分类图标.png',fullPage:true});
  await page.getByRole('button',{name:'退出演示，返回真实数据'}).click();
  await page.getByRole('application',{name:'天地图矢量底图及已授权农业对象边界'}).waitFor();

  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'☰ 对象目录'}).click();
  await page.getByRole('searchbox',{name:'搜索名称或编号'}).waitFor();
  await page.getByRole('button',{name:'M1合成塘口',exact:true}).click();
  await page.getByRole('complementary',{name:'对象详情'}).getByRole('heading',{name:'M1合成塘口'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.waitForTimeout(350);
  await page.screenshot({path:'docs/acceptance/m1/2026-10-14-M1手机矢量底图与详情.png',fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}});
}));

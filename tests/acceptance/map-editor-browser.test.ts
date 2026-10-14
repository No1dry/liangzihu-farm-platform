import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';
import {transaction} from '../../src/db/pool';
import {saveObject} from '../../src/modules/registry/objects';

const R=6378137;
const DEG2RAD=Math.PI/180;
function toMercator(lonLat:[number,number]):[number,number]{
 const x=R*lonLat[0]*DEG2RAD;
 const y=R*Math.log(Math.tan(Math.PI/4+lonLat[1]*DEG2RAD/2));
 return [x,y];
}
function toPixel(lonLat:[number,number],center:[number,number],resolution:number,size:[number,number]):[number,number]{
 const m=toMercator(lonLat);
 return [size[0]/2+(m[0]-center[0])/resolution,size[1]/2-(m[1]-center[1])/resolution];
}

test('M2-A 地图编辑：绘制、修改、保存、版本冲突与权限闭环',{timeout:240000},()=>withDb(async pool=>{
 await mkdir('docs/acceptance/m2',{recursive:true});
 const owner=await actorFixture(pool,'owner'),owner2=await actorFixture(pool,'owner'),worker=await actorFixture(pool,'worker'),expert=await actorFixture(pool,'expert');
 const farm=await objectFixture(pool,owner.id);
 await permit(pool,owner.id,farm,['read','configure','review']);
 await permit(pool,owner2.id,farm,['read','configure','review']);
 await permit(pool,worker.id,farm,['read']);
 const field=await transaction(c=>saveObject(c,owner,{parentId:farm,code:'SYNTH-M2-FIELD',name:'合成编辑农田',kind:'field',source:'M2-A 浏览器验收合成资料'}),pool);
 await pool.query("UPDATE objects SET boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.64 30.24,114.64 30.26,114.62 30.26,114.62 30.24))',4326) WHERE id=$1",[field.id]);
 await permit(pool,owner.id,field.id,['read','configure','review']);
 await permit(pool,owner2.id,field.id,['read','configure','review']);
 await permit(pool,worker.id,field.id,['read']);
 const pond=await transaction(c=>saveObject(c,owner,{parentId:farm,code:'SYNTH-M2-POND',name:'合成编辑塘口',kind:'pond',source:'M2-A 浏览器验收合成资料'}),pool);
 await permit(pool,owner.id,pond.id,['read','configure']);
 await permit(pool,worker.id,pond.id,['read']);

 const maintainerNoReview=await actorFixture(pool,'maintainer');
 await permit(pool,maintainerNoReview.id,farm,['read','configure']);
 await permit(pool,maintainerNoReview.id,pond.id,['read','configure']);

 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const ownerContext=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await ownerContext.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await ownerContext.newPage();
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));

   await page.goto(app.origin+'/map-editor');
   await page.getByRole('heading',{name:'地图编辑'}).waitFor();
   await page.getByRole('button',{name:/合成编辑农田/}).waitFor();
   await page.screenshot({path:'docs/acceptance/m2/01-编辑器初始.png',fullPage:true});

   // 1. 选农田并拖动顶点保存
   await page.getByRole('button',{name:/合成编辑农田/}).click();
   await page.locator('[data-testid="boundary-form"]').waitFor();
   await page.waitForTimeout(500);
   const beforeWkt=(await pool.query("SELECT ST_AsText(boundary) AS w FROM objects WHERE id=$1",[field.id])).rows[0].w;
   const map=page.locator('[data-testid="map-editor-map"]');
   await map.waitFor();
   const box=await map.boundingBox();assert(box);
   const center=await map.evaluate(el=>{const c=(el as HTMLElement).dataset.viewCenter?.split(',').map(Number)??[0,0];return [c[0],c[1]] as [number,number];});
   const resolution=Number(await map.getAttribute('data-view-resolution'));
   const size:[number,number]=[box.width,box.height];
   const vertex=toPixel([114.64,30.26],center,resolution,size);
   const target=toPixel([114.645,30.265],center,resolution,size);
   await page.mouse.move(box.x+vertex[0],box.y+vertex[1]);await page.mouse.down();await page.waitForTimeout(80);
   await page.mouse.move(box.x+target[0],box.y+target[1]);await page.waitForTimeout(80);
   await page.mouse.up();await page.waitForTimeout(200);
   await page.locator('[data-testid="boundary-form"] textarea').fill('M2-A 拖动顶点修改测试');
   await page.locator('[data-testid="boundary-form"] button[type=submit]').click();
   await page.getByText(/已保存“合成编辑农田”/).waitFor();
   const afterWkt=(await pool.query("SELECT ST_AsText(boundary) AS w FROM objects WHERE id=$1",[field.id])).rows[0].w;
   assert.notEqual(afterWkt,beforeWkt,'拖动顶点后 DB 边界应变化');
   await page.screenshot({path:'docs/acceptance/m2/02-农田修改保存后.png',fullPage:true});

   // 2. 新建塘口并绘制多边形保存为草稿
   await page.getByRole('button',{name:/合成编辑塘口/}).click();
   await page.locator('[data-testid="boundary-form"]').waitFor();
   // 塘口暂无边界，视图仍停留在农田范围；先复位到梁子湖全区（zoom 12）再绘制
   await page.getByRole('button',{name:'复位视图'}).click();await page.waitForTimeout(600);
   const pondCenter=await map.evaluate(el=>{const c=(el as HTMLElement).dataset.viewCenter?.split(',').map(Number)??[0,0];return [c[0],c[1]] as [number,number];});
   const pondResolution=Number(await map.getAttribute('data-view-resolution'));
   const p1=toPixel([114.66,30.24],pondCenter,pondResolution,size),p2=toPixel([114.72,30.24],pondCenter,pondResolution,size),p3=toPixel([114.72,30.25],pondCenter,pondResolution,size),p4=toPixel([114.66,30.25],pondCenter,pondResolution,size);
   await page.mouse.click(box.x+p1[0],box.y+p1[1]);await page.waitForTimeout(80);
   await page.mouse.click(box.x+p2[0],box.y+p2[1]);await page.waitForTimeout(80);
   await page.mouse.click(box.x+p3[0],box.y+p3[1]);await page.waitForTimeout(80);
   await page.mouse.dblclick(box.x+p4[0],box.y+p4[1]);await page.waitForTimeout(200);
   await page.locator('[data-testid="boundary-form"] textarea').fill('M2-A 塘口绘制草稿测试');
   await page.locator('[data-testid="boundary-form"] button[type=submit]').click();
   await page.getByText(/已保存“合成编辑塘口”/).waitFor();
   const pondRow=(await pool.query("SELECT boundary_status,ST_AsText(boundary) AS w FROM objects WHERE id=$1",[pond.id])).rows[0];
   assert.equal(pondRow.boundary_status,'draft');assert.ok(pondRow.w);

   // 3. 刷新页面重新进入后边界一致
   await page.reload();
   await page.getByRole('button',{name:/合成编辑塘口/}).waitFor();
   await page.getByRole('button',{name:/合成编辑塘口/}).click();
   await page.locator('[data-testid="boundary-form"]').waitFor();
   const reopened=(await pool.query("SELECT ST_AsText(boundary) AS w FROM objects WHERE id=$1",[pond.id])).rows[0].w;
   assert.equal(reopened,pondRow.w);

   // 4. boundary_versions 历史保留：首次保存产生第 1 个版本（后续冲突流程再核对累计与保留）
   const versions=await pool.query('SELECT count(*) AS n FROM boundary_versions WHERE object_id=$1',[field.id]);
   assert.equal(Number(versions.rows[0].n),1,'农田首次保存后应有 1 个边界版本');

   // 5. 无 configure 账号：列表为空且直接 POST 403
   const workerContext=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await workerContext.addCookies([{name:'agri_session',value:await app.authenticate(worker),url:app.origin}]);
   const workerPage=await workerContext.newPage();
   await workerPage.goto(app.origin+'/map-editor');
   await workerPage.getByText('当前没有可编辑的农田或塘口').waitFor();
   const denied=await workerContext.request.post(app.origin+'/api/v1/map',{headers:{Origin:app.origin,'Content-Type':'application/json'},data:{objectId:field.id,version:2,sourceCrs:4326,geometry:{type:'Polygon',coordinates:[[[114.62,30.24],[114.63,30.24],[114.63,30.25],[114.62,30.25],[114.62,30.24]]]},status:'draft',source:'越权测试'}});
   assert.equal(denied.status(),403);

   // 6. 无 review 账号：UI 不出现已核实；强制 POST verified 403
   const wrContext=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await wrContext.addCookies([{name:'agri_session',value:await app.authenticate(maintainerNoReview),url:app.origin}]);
   const wrPage=await wrContext.newPage();
   await wrPage.goto(app.origin+'/map-editor');
   await wrPage.getByRole('button',{name:/合成编辑塘口/}).click();
   await wrPage.locator('[data-testid="boundary-form"]').waitFor();
   assert.equal(await wrPage.locator('[data-testid="boundary-form"] select option[value="verified"]').count(),0,'无 review 权限不应出现已核实选项');
   const forceVerified=await wrContext.request.post(app.origin+'/api/v1/map',{headers:{Origin:app.origin,'Content-Type':'application/json'},data:{objectId:pond.id,version:1,sourceCrs:4326,geometry:{type:'Polygon',coordinates:[[[114.70,30.24],[114.71,30.24],[114.71,30.25],[114.70,30.25],[114.70,30.24]]]},status:'verified',source:'越权审核测试'}});
   assert.equal(forceVerified.status(),403);

   // 7. 版本冲突：编辑中外部更新，保存 409，刷新后重试成功
   await page.goto(app.origin+'/map-editor');
   await page.getByRole('button',{name:/合成编辑农田/}).click();
   await page.locator('[data-testid="boundary-form"]').waitFor();
   await page.waitForTimeout(500);
   const conflictBox=await map.boundingBox();assert(conflictBox);
   const conflictCenter=await map.evaluate(el=>{const c=(el as HTMLElement).dataset.viewCenter?.split(',').map(Number)??[0,0];return [c[0],c[1]] as [number,number];});
   const conflictResolution=Number(await map.getAttribute('data-view-resolution'));
   const conflictSize:[number,number]=[conflictBox.width,conflictBox.height];
   const v2=toPixel([114.62,30.24],conflictCenter,conflictResolution,conflictSize);
   const t2=toPixel([114.615,30.235],conflictCenter,conflictResolution,conflictSize);
   await page.mouse.move(conflictBox.x+v2[0],conflictBox.y+v2[1]);await page.mouse.down();await page.waitForTimeout(80);
   await page.mouse.move(conflictBox.x+t2[0],conflictBox.y+t2[1]);await page.waitForTimeout(80);
   await page.mouse.up();await page.waitForTimeout(200);
   await page.locator('[data-testid="boundary-form"] textarea').fill('M2-A 冲突重试测试');
   // 外部会话更新版本
   await ownerContext.request.post(app.origin+'/api/v1/map',{headers:{Origin:app.origin,'Content-Type':'application/json'},data:{objectId:field.id,version:(await pool.query('SELECT version FROM objects WHERE id=$1',[field.id])).rows[0].version,sourceCrs:4326,geometry:{type:'Polygon',coordinates:[[[114.62,30.24],[114.64,30.24],[114.64,30.26],[114.62,30.26],[114.62,30.24]]]},status:'draft',source:'外部会话抢先更新'}});
   await page.locator('[data-testid="boundary-form"] button[type=submit]').click();
   await page.getByText(/边界版本已变化/).waitFor();
   const conflictTemp=(await pool.query("SELECT ST_AsText(boundary) AS w FROM objects WHERE id=$1",[field.id])).rows[0].w;
   await page.getByRole('button',{name:'刷新版本后重试'}).click();
   await page.getByText(/对象版本已刷新/).waitFor();
   await page.locator('[data-testid="boundary-form"] button[type=submit]').click();
   await page.getByText(/已保存“合成编辑农田”/).waitFor();
   const afterConflict=(await pool.query("SELECT ST_AsText(boundary) AS w FROM objects WHERE id=$1",[field.id])).rows[0].w;
   assert.notEqual(afterConflict,conflictTemp);
   // 4b. 历史版本累计保留：首次保存、外部抢先更新、冲突重试各产生一个版本，互不覆盖
   const history=await pool.query('SELECT object_version,ST_AsText(boundary) AS w FROM boundary_versions WHERE object_id=$1 ORDER BY object_version',[field.id]);
   assert.equal(history.rows.length,3,'冲突重试后农田应有 3 个历史边界版本');
   assert.deepEqual(history.rows.map(r=>r.object_version),[2,3,4],'历史版本号应连续保留');
   assert.notEqual(history.rows[0].w,history.rows[2].w,'历史边界不被新保存覆盖');

   // 8. 取消编辑后 DB 不变
   const cancelBefore=(await pool.query("SELECT ST_AsText(boundary) AS w FROM objects WHERE id=$1",[field.id])).rows[0].w;
   await page.getByRole('button',{name:/合成编辑农田/}).click();
   await page.locator('[data-testid="boundary-form"]').waitFor();
   await page.waitForTimeout(500);
   const cb=await map.boundingBox();assert(cb);
   const cc=await map.evaluate(el=>{const c=(el as HTMLElement).dataset.viewCenter?.split(',').map(Number)??[0,0];return [c[0],c[1]] as [number,number];});
   const cr=Number(await map.getAttribute('data-view-resolution'));
   const cs:[number,number]=[cb.width,cb.height];
   const v3=toPixel([114.615,30.235],cc,cr,cs);const t3=toPixel([114.60,30.22],cc,cr,cs);
   await page.mouse.move(cb.x+v3[0],cb.y+v3[1]);await page.mouse.down();await page.waitForTimeout(80);
   await page.mouse.move(cb.x+t3[0],cb.y+t3[1]);await page.waitForTimeout(80);
   await page.mouse.up();await page.waitForTimeout(200);
   await page.locator('[data-testid="boundary-form"] button[type=button]').filter({hasText:'取消'}).click();
   await page.waitForTimeout(200);
   const cancelAfter=(await pool.query("SELECT ST_AsText(boundary) AS w FROM objects WHERE id=$1",[field.id])).rows[0].w;
   assert.equal(cancelAfter,cancelBefore);

   // 9. 回归：相关路由仍 200
   for(const path of ['/farm-overview','/map-prototype','/terrain'])assert.equal((await ownerContext.request.get(app.origin+path)).status(),200,path);
   assert.deepEqual(errors,[]);
   await ownerContext.close();await workerContext.close();await wrContext.close();
  }finally{await browser.close();}
 });
}));

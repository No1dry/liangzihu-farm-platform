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
type Box={x:number;y:number;width:number;height:number};
async function viewState(map:any){const center=await map.evaluate((el:any)=>{const c=(el as HTMLElement).dataset.viewCenter?.split(',').map(Number)??[0,0];return [c[0],c[1]] as [number,number];});const resolution=Number(await map.getAttribute('data-view-resolution'));return {center,resolution};}
async function dragVertex(page:any,map:any,box:Box,from:[number,number],to:[number,number]){
 for(let attempt=0;attempt<3;attempt++){
  await page.waitForTimeout(550);
  let {center,resolution}=await viewState(map);
  let v=toPixel(from,center,resolution,[box.width,box.height]);
  const cx=box.width/2,cy=box.height/2;
  if(!(v[0]>60&&v[0]<box.width-380&&v[1]>90&&v[1]<box.height-230)){
   await page.mouse.move(box.x+cx,box.y+cy,{steps:4});await page.mouse.down();await page.waitForTimeout(100);
   await page.mouse.move(box.x+2*cx-v[0],box.y+2*cy-v[1],{steps:8});await page.mouse.up();await page.waitForTimeout(400);
   ({center,resolution}=await viewState(map));
   v=toPixel(from,center,resolution,[box.width,box.height]);
  }
  const before=await map.getAttribute('data-edit-geometry');
  const t=toPixel(to,center,resolution,[box.width,box.height]);
  await page.mouse.move(box.x+v[0],box.y+v[1],{steps:5});await page.mouse.down();await page.waitForTimeout(120);
  await page.mouse.move(box.x+t[0],box.y+t[1],{steps:12});await page.waitForTimeout(120);
  await page.mouse.up();await page.waitForTimeout(300);
  const after=await map.getAttribute('data-edit-geometry');
  if(after&&after!==before)return;
 }
 throw new Error('顶点拖动未改变编辑几何');
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
   const size:[number,number]=[box.width,box.height];
   await dragVertex(page,map,box,[114.64,30.26],[114.637,30.253]);
   await page.waitForTimeout(300);
   await page.screenshot({path:'docs/acceptance/m2/02-顶点拖动编辑中.png',fullPage:true});
   await page.locator('[data-testid="boundary-form"] textarea').fill('M2-A 拖动顶点修改测试');
   await page.locator('[data-testid="boundary-form"] button[type=submit]').click();
   await page.getByText(/已保存“合成编辑农田”/).waitFor();
   const afterWkt=(await pool.query("SELECT ST_AsText(boundary) AS w FROM objects WHERE id=$1",[field.id])).rows[0].w;
   assert.notEqual(afterWkt,beforeWkt,'拖动顶点后 DB 边界应变化');
   await page.screenshot({path:'docs/acceptance/m2/03-农田修改保存后.png',fullPage:true});

   // 2. 新建塘口并绘制多边形保存为草稿
   await page.getByRole('button',{name:/合成编辑塘口/}).click();
   await page.locator('[data-testid="boundary-form"]').waitFor();
   // 塘口暂无边界，视图仍停留在农田范围；先复位到梁子湖全区（zoom 12）再绘制
   await page.getByRole('button',{name:'复位视图'}).click();await page.waitForTimeout(600);
   const {center:pondCenter,resolution:pondResolution}=await viewState(map);
   const p1=toPixel([114.56,30.22],pondCenter,pondResolution,size),p2=toPixel([114.60,30.215],pondCenter,pondResolution,size),p3=toPixel([114.63,30.22],pondCenter,pondResolution,size),p4=toPixel([114.62,30.235],pondCenter,pondResolution,size),p5=toPixel([114.58,30.238],pondCenter,pondResolution,size),p6=toPixel([114.55,30.23],pondCenter,pondResolution,size);
   await page.mouse.click(box.x+p1[0],box.y+p1[1]);await page.waitForTimeout(80);
   await page.mouse.click(box.x+p2[0],box.y+p2[1]);await page.waitForTimeout(80);
   await page.mouse.click(box.x+p3[0],box.y+p3[1]);await page.waitForTimeout(80);
   await page.mouse.click(box.x+p4[0],box.y+p4[1]);await page.waitForTimeout(80);
   await page.mouse.click(box.x+p5[0],box.y+p5[1]);await page.waitForTimeout(80);
   await page.mouse.dblclick(box.x+p6[0],box.y+p6[1]);await page.waitForTimeout(500);
   await page.getByText('多边形绘制完成，填写依据后保存。').waitFor();
   await page.locator('[data-testid="boundary-form"] textarea').fill('M2-A 塘口绘制草稿测试');
   await page.locator('[data-testid="boundary-form"] button[type=submit]').click();
   await page.getByText(/已保存“合成编辑塘口”/).waitFor();
   await page.screenshot({path:'docs/acceptance/m2/04-塘口草稿保存后.png',fullPage:true});
   const pondRow=(await pool.query("SELECT boundary_status,ST_AsText(boundary) AS w FROM objects WHERE id=$1",[pond.id])).rows[0];
   assert.equal(pondRow.boundary_status,'draft');assert.ok(pondRow.w);

   // 3. 刷新页面重新进入后边界一致
   await page.reload();
   await page.getByRole('button',{name:/合成编辑塘口/}).waitFor();
   await page.getByRole('button',{name:/合成编辑塘口/}).click();
   await page.locator('[data-testid="boundary-form"]').waitFor();
   await page.screenshot({path:'docs/acceptance/m2/06-刷新后重新打开.png',fullPage:true});
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
   await dragVertex(page,map,conflictBox,[114.62,30.24],[114.623,30.243]);
   await page.locator('[data-testid="boundary-form"] textarea').fill('M2-A 冲突重试测试');
   // 外部会话更新版本
   await ownerContext.request.post(app.origin+'/api/v1/map',{headers:{Origin:app.origin,'Content-Type':'application/json'},data:{objectId:field.id,version:(await pool.query('SELECT version FROM objects WHERE id=$1',[field.id])).rows[0].version,sourceCrs:4326,geometry:{type:'Polygon',coordinates:[[[114.62,30.24],[114.64,30.24],[114.64,30.26],[114.62,30.26],[114.62,30.24]]]},status:'draft',source:'外部会话抢先更新'}});
   await page.locator('[data-testid="boundary-form"] button[type=submit]').click();
   await page.getByText(/边界版本已变化/).waitFor();
   await page.screenshot({path:'docs/acceptance/m2/05-版本冲突保留几何.png',fullPage:true});
   const conflictTemp=(await pool.query("SELECT ST_AsText(boundary) AS w FROM objects WHERE id=$1",[field.id])).rows[0].w;
   await page.getByRole('button',{name:'查看最新边界'}).click();
   await page.getByText(/对象版本已刷新/).waitFor();
   await page.getByRole('button',{name:'确认重新提交'}).click();
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
   await dragVertex(page,map,cb,[114.623,30.243],[114.626,30.246]);
   page.once('dialog',dialog=>void dialog.accept());
   await page.locator('[data-testid="boundary-form"] button[type=button]').filter({hasText:'取消'}).click();
   await page.getByText('已取消编辑，未保存任何边界。').waitFor();
   const cancelAfter=(await pool.query("SELECT ST_AsText(boundary) AS w FROM objects WHERE id=$1",[field.id])).rows[0].w;
   assert.equal(cancelAfter,cancelBefore);

   // 9. 回归：相关路由仍 200
   for(const path of ['/farm-overview','/map-prototype','/terrain'])assert.equal((await ownerContext.request.get(app.origin+path)).status(),200,path);
   assert.deepEqual(errors,[]);
   await ownerContext.close();await workerContext.close();await wrContext.close();
  }finally{await browser.close();}
 });
}));

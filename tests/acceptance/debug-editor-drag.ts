import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';
import {transaction} from '../../src/db/pool';
import {saveObject} from '../../src/modules/registry/objects';

// 聚焦诊断：编辑器选择对象后 Modify 顶点拖动的 pointer 事件链路
await withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id);
 await permit(pool,owner.id,farm,['read','configure','review']);
 const field=await transaction(c=>saveObject(c,owner,{parentId:farm,code:'SYNTH-DBG-FIELD',name:'调试农田',kind:'field',source:'debug'}),pool);
 await pool.query("UPDATE objects SET boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.64 30.24,114.64 30.26,114.62 30.26,114.62 30.24))',4326) WHERE id=$1",[field.id]);
 await permit(pool,owner.id,field.id,['read','configure','review']);
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage();
   page.on('pageerror',e=>console.log('PAGEERROR:',e.message));
   page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE-ERR:',m.text());});
   await page.goto(app.origin+'/map-editor');
   await page.getByRole('button',{name:/调试农田/}).click();
   await page.locator('[data-testid="boundary-form"]').waitFor();
   await page.waitForTimeout(900);
   const map=page.locator('[data-testid="map-editor-map"]');
   const box=await map.boundingBox();
   console.log('box:',JSON.stringify(box));
   console.log('viewCenter:',await map.getAttribute('data-view-center'));
   console.log('viewResolution:',await map.getAttribute('data-view-resolution'));
   console.log('editGeometry set:',(await map.getAttribute('data-edit-geometry'))?.slice(0,80));
   // 顶点像素（NE 顶点）
   const center=(await map.getAttribute('data-view-center'))!.split(',').map(Number) as [number,number];
   const resolution=Number(await map.getAttribute('data-view-resolution'));
   const R=6378137,D2R=Math.PI/180;
   const mx=(lon:number)=>R*lon*D2R,my=(lat:number)=>R*Math.log(Math.tan(Math.PI/4+lat*D2R/2));
   const vx=box!.width/2+(mx(114.64)-center[0])/resolution,vy=box!.height/2-(my(30.26)-center[1])/resolution;
   console.log('vertexPx:',vx,vy,'abs:',box!.x+vx,box!.y+vy);
   console.log('elementFromPoint:',await page.evaluate(([x,y])=>{const el=document.elementFromPoint(x,y);return el?(el.tagName+'.'+String((el as HTMLElement).className?.baseVal??(el as HTMLElement).className)):'none';},[box!.x+vx,box!.y+vy]));
   await page.mouse.move(box!.x+vx,box!.y+vy,{steps:5});
   await page.waitForTimeout(150);
   await page.mouse.down();await page.waitForTimeout(150);
   console.log('lastPointer after down:',await map.getAttribute('data-last-pointer'));
   await page.mouse.move(box!.x+vx-30,box!.y+vy+30,{steps:10});await page.waitForTimeout(150);
   await page.mouse.up();await page.waitForTimeout(400);
   console.log('editGeometry after:',(await map.getAttribute('data-edit-geometry'))?.slice(0,80));
   console.log('message:',await page.locator('p[role="status"]').allTextContents());
  }finally{await browser.close();}
 });
});

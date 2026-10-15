import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';
import {transaction} from '../../src/db/pool';
import {saveObject} from '../../src/modules/registry/objects';

await withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id);
 await permit(pool,owner.id,farm,['read','configure','review']);
 const field=await transaction(c=>saveObject(c,owner,{parentId:farm,code:'SYNTH-DBG-F3',name:'调试农田',kind:'field',source:'debug'}),pool);
 await pool.query("UPDATE objects SET boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.64 30.24,114.64 30.26,114.62 30.26,114.62 30.24))',4326) WHERE id=$1",[field.id]);
 await permit(pool,owner.id,field.id,['read','configure','review']);
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage();
   page.on('pageerror',e=>console.log('PAGEERROR:',e.message));
   await page.goto(app.origin+'/map-editor');
   await page.getByRole('button',{name:/调试农田/}).click();
   await page.locator('[data-testid="boundary-form"]').waitFor();
   await page.waitForTimeout(550);
   const map=page.locator('[data-testid="map-editor-map"]');
   const box=(await map.boundingBox())!;
   const before=await map.getAttribute('data-edit-geometry');
   const center=(await map.getAttribute('data-view-center'))!.split(',').map(Number);
   const resolution=Number(await map.getAttribute('data-view-resolution'));
   const R=6378137,D2R=Math.PI/180;
   const vx=box.width/2+(R*114.62*D2R-center[0])/resolution,vy=box.height/2-(R*Math.log(Math.tan(Math.PI/4+30.26*D2R/2))-center[1])/resolution;
   console.log('NW vertexPx:',Math.round(vx),Math.round(vy),'abs:',Math.round(box.x+vx),Math.round(box.y+vy));
   console.log('hit-stack:',await page.evaluate(([x,y])=>document.elementsFromPoint(x,y).slice(0,4).map(el=>el.tagName+'.'+String((el as any).className?.baseVal??(el as any).className)).join(' | '),[box.x+vx,box.y+vy]));
   await page.mouse.move(box.x+vx,box.y+vy,{steps:5});await page.mouse.down();await page.waitForTimeout(120);
   console.log('lastPointer:',await map.getAttribute('data-last-pointer'));
   console.log('lastHit:',await map.getAttribute('data-last-hit'));
   console.log('modifyStarted(down后):',await map.getAttribute('data-modify-started'));
   const R2=6378137,D3=Math.PI/180;const tx=box.width/2+(R2*114.616*D3-center[0])/resolution,ty=box.height/2-(R2*Math.log(Math.tan(Math.PI/4+30.266*D3/2))-center[1])/resolution;await page.mouse.move(box.x+tx,box.y+ty,{steps:12});await page.waitForTimeout(120);
   await page.mouse.up();await page.waitForTimeout(400);
   console.log('modifyStarted:',await map.getAttribute('data-modify-started'));
   console.log('changed:',before!==(await map.getAttribute('data-edit-geometry')));
  }finally{await browser.close();}
 });
});

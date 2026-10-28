import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

test('CAD 竣工图参考图层叠加、独立开关、卫星底图与点击信息卡',{timeout:120000},()=>withDb(async pool=>{
 const owner=await actorFixture(pool,'owner'),farm=await objectFixture(pool,owner.id);
 await permit(pool,owner.id,farm,['read','configure']);
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage(),writes:string[]=[],pageErrors:string[]=[];
   page.on('request',request=>{if(request.url().includes('/api/v1/')&&!['GET','HEAD'].includes(request.method()))writes.push(`${request.method()} ${request.url()}`);});
   page.on('pageerror',error=>pageErrors.push(error.message));
   await mkdir('docs/acceptance/cad-demo',{recursive:true});
   await page.goto(app.origin+'/farm-overview?demo=1');
   await page.getByRole('button',{name:'竣工图范围'}).click();
   await page.waitForTimeout(1800);
   const map=page.getByRole('application',{name:/合成演示对象及真实 CAD 参考/});
   assert(Number(await map.getAttribute('data-view-zoom'))>12,'定位至竣工图范围后应放大显示');
   await page.screenshot({path:'docs/acceptance/cad-demo/01-overall-vector.png'});
   await page.getByRole('button',{name:'切换为卫星底图'}).click();
   await page.waitForTimeout(1800);
   await page.screenshot({path:'docs/acceptance/cad-demo/02-satellite-detail.png'});
   await page.mouse.click(1002,386);
   const card=page.getByRole('complementary',{name:'竣工图参考详情'});
   await card.getByText('面积',{exact:true}).waitFor();
   await card.getByText('来源于竣工图，尚未核实为正式农业资产').waitFor();
   await page.screenshot({path:'docs/acceptance/cad-demo/03-click-land-card.png'});
   await page.getByRole('button',{name:'图层'}).click();
   const roadToggle=page.getByLabel('生产道路');
   await roadToggle.uncheck();
   assert.equal(await roadToggle.isChecked(),false);
   await roadToggle.check();
   assert.equal(await roadToggle.isChecked(),true);
   assert.deepEqual(writes,[],'CAD 图层浏览不得调用正式写接口');
   assert.deepEqual(pageErrors,[],'CAD 图层浏览不得出现页面脚本错误');
  }finally{await browser.close();}
 });
}));

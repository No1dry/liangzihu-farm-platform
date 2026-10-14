import test from 'node:test';
import assert from 'node:assert/strict';
import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import Point from 'ol/geom/Point.js';
import {CATEGORY_ORDER,CATEGORY_LABELS,colorForKind,iconLabel,iconSvg,objectStyles,selectedStyles,demoStyles} from '../../src/app/(platform)/farm-overview/map-symbols';

function feature(kind:string,boundary_status:string,geometryType:'Polygon'|'Point',symbol?:string){
 const geometry=geometryType==='Polygon'?new Polygon([[[0,0],[10,0],[10,10],[0,10],[0,0]]]):new Point([5,5]);
 const f=new Feature({geometry});f.set('kind',kind);f.set('status',boundary_status);if(symbol)f.set('symbol',symbol);return f;
}

test('分类配置与图标生成',()=>{
 assert.deepEqual(CATEGORY_ORDER,['field','pond','channel','facility','mobile']);
 assert.equal(CATEGORY_LABELS.field,'农田');
 assert.equal(CATEGORY_LABELS.facility,'固定设施');
 assert.equal(iconLabel('gate','facility'),'闸');
 assert.equal(iconLabel(undefined,'facility'),'设施');
 assert.equal(iconLabel(undefined,'mobile'),'机');
 assert.equal(iconLabel('drone','mobile'),'飞');
 const svg=iconSvg('田','#4b7045');
 assert(svg.includes('田'));
 assert(svg.includes('#4b7045'));
 assert(svg.includes('circle'));
});

test('按 kind 返回色表',()=>{
 assert.equal(colorForKind('field').stroke,'#4b7045');
 assert.equal(colorForKind('pond').stroke,'#2c7aa4');
 assert.equal(colorForKind('channel').stroke,'#3f8f8a');
 assert.equal(colorForKind('facility').icon,'#c76d1e');
 assert.equal(colorForKind('mobile').icon,'#8e4da8');
});

test('真实图层样式按类别与边界状态',()=>{
 const visible=Object.fromEntries(CATEGORY_ORDER.map(k=>[k,true]));
 const field=feature('field','verified','Polygon');
 const styles=objectStyles(field,14,visible);assert.ok(styles);assert.equal(styles.length,2);
 assert.equal(styles[0].getStroke()?.getColor(),'#fff');
 assert.equal(styles[1].getStroke()?.getColor(),'#4b7045');
 assert.equal(styles[1].getFill()?.getColor(),'rgba(75,112,45,.24)');
 assert.equal(styles[1].getStroke()?.getLineDash(),null);
 const draft=feature('pond','draft','Polygon');
 const draftStyles=objectStyles(draft,14,visible);assert.ok(draftStyles);
 assert.deepEqual(draftStyles[1].getStroke()?.getLineDash(),[8,5]);
 assert.equal(draftStyles[1].getStroke()?.getColor(),'#2c7aa4');
 const channel=feature('channel','verified','Polygon');
 assert.equal(objectStyles(channel,14,visible)?.[1].getStroke()?.getColor(),'#3f8f8a');
 const hidden={...visible,field:false};
 assert.equal(objectStyles(field,14,hidden),undefined);
 const facility=feature('facility','verified','Point','pump');
 const pointStyles=objectStyles(facility,14,visible);assert.ok(pointStyles);assert.equal(pointStyles.length,1);
 assert.equal(objectStyles(feature('facility','verified','Point','gate'),12,visible),undefined,'设施在 zoom<13 隐藏');
});

test('选中样式高亮',()=>{
 const point=feature('mobile','draft','Point','drone');
 const s=selectedStyles(point);assert.equal(s.length,1);
 const area=feature('field','draft','Polygon');
 const sa=selectedStyles(area);assert.equal(sa.length,2);
 assert.equal(sa[0].getStroke()?.getColor(),'#fff');
});

test('演示图层保持蓝色虚线面并复用图标',()=>{
 const visible=Object.fromEntries(CATEGORY_ORDER.map(k=>[k,true]));
 const area=feature('field','draft','Polygon','field');
 const ds=demoStyles(area,visible,false);assert.ok(ds);assert.equal(ds.length,2);
 assert.equal(ds[0].getStroke()?.getColor(),'#1b7095');
 assert.deepEqual(ds[0].getStroke()?.getLineDash(),[8,6]);
 const point=feature('mobile','draft','Point','drone');
 const dp=demoStyles(point,visible,false);assert.ok(dp);assert.equal(dp.length,1);
});

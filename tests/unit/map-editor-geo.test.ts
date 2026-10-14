import test from 'node:test';
import assert from 'node:assert/strict';
import {lonLatToMercator,mercatorToPixel,lonLatToPixel} from '../../src/app/(platform)/map-editor/geo-helpers';

const R=6378137;

test('经纬度转 Web Mercator',()=>{
 const [x,y]=lonLatToMercator([114.635,30.25]);
 assert.ok(Math.abs(x-R*114.635*Math.PI/180)<1e-3);
 assert.ok(Math.abs(y-R*Math.log(Math.tan(Math.PI/4+30.25*Math.PI/360)))<1e-3);
});

test('Mercator 转像素偏移',()=>{
 const center:[number,number]=[0,0];
 const size:[number,number]=[800,600];
 const res=1000;
 assert.deepEqual(mercatorToPixel([0,0],center,res,size),[400,300]);
 assert.deepEqual(mercatorToPixel([res*100,res*100],center,res,size),[500,200]);
});

test('经纬度到像素需经过 Mercator 非线性',()=>{
 const center=lonLatToMercator([114.635,30.25]);
 const size:[number,number]=[900,700];
 const res=500;
 const p=lonLatToPixel([114.645,30.255],center,res,size);
 assert.ok(p[0]>450&&p[1]<350,'东经更大应偏右，北纬更大应偏上');
});

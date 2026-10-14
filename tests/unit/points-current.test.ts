import test from 'node:test';import assert from 'node:assert/strict';import {readableCurrent} from '../../src/modules/telemetry/queries';
const ids=['obj-a','obj-b'];
test('当前值可读：绑定已核实且对象在授权范围、当前值属于同一绑定',()=>{
 const binding={objectId:'obj-a',bindingId:'b1',verified:true},current={objectId:'obj-a',bindingId:'b1'};
 assert.equal(readableCurrent(ids,binding,false,current),true);
});
test('当前值不可读：绑定未核实、对象越权、绑定冲突或当前值不属于当前绑定',()=>{
 const binding={objectId:'obj-a',bindingId:'b1',verified:true},current={objectId:'obj-a',bindingId:'b1'};
 assert.equal(readableCurrent(ids,{...binding,verified:false},false,current),false);
 assert.equal(readableCurrent(ids,{...binding,objectId:'obj-x'},false,{...current,objectId:'obj-x'}),false);
 assert.equal(readableCurrent(ids,binding,true,current),false);
 assert.equal(readableCurrent(ids,binding,false,{...current,bindingId:'b0'}),false);
 assert.equal(readableCurrent(ids,binding,false,{...current,objectId:'obj-x'}),false);
 assert.equal(readableCurrent(ids,binding,false,null),false);
 assert.equal(readableCurrent(ids,null,false,current),false);
});

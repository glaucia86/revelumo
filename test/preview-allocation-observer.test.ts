import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {install}=require('../evidence/issue-56/observer.cjs');
test('counter observes actual typed-array construction without retaining or changing pixels',()=>{
 const c=vm.createContext({});vm.runInContext(`(${install.toString()})()`,c);
 const r=vm.runInContext(`(()=>{let a=new Uint8ClampedArray([1,2,3,4]);let b=new Uint8ClampedArray(a);b[0]=9;return {a:[...a],b:[...b],stats:JSON.parse(JSON.stringify(globalThis.labAllocationCounts))}})()`,c);
 assert.deepEqual(JSON.parse(JSON.stringify(r)),{a:[1,2,3,4],b:[9,2,3,4],stats:{typedArrays:2,typedBytes:8,readbacks:0,readbackBytes:0}});
});
test('transfer detaches real storage; the counter neither pools nor retains it',()=>{
 const c=vm.createContext({structuredClone});vm.runInContext(`(${install.toString()})()`,c);
 assert.equal(vm.runInContext(`(()=>{let a=new Uint8ClampedArray(16);structuredClone(a.buffer,{transfer:[a.buffer]});return a.byteLength})()`,c),0);
 assert.equal(c.labAllocationCounts.typedBytes,16);
});
test('snapshot reports final allocations at send without changing the message',()=>{
 const messages=[],snapshots=[];const c=vm.createContext({postMessage:m=>messages.push(m),labEmit:s=>snapshots.push(JSON.parse(s))});
 vm.runInContext(`(${install.toString()})()`,c);vm.runInContext(`new Uint8ClampedArray(12);postMessage({op:'pixels',buffer:'sentinel'})`,c);
 assert.equal(messages[0].buffer,'sentinel');assert.equal(snapshots.length,1);assert.equal(snapshots[0].counts.typedBytes,12);
});

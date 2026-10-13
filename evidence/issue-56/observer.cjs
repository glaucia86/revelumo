exports.install=function install(){
 const counts=globalThis.labAllocationCounts={typedArrays:0,typedBytes:0,readbacks:0,readbackBytes:0};
 const Native=globalThis.Uint8ClampedArray;
 globalThis.Uint8ClampedArray=new Proxy(Native,{construct(target,args,newTarget){const value=Reflect.construct(target,args,newTarget);counts.typedArrays++;counts.typedBytes+=value.byteLength;return value;}});
 if(globalThis.labEmit&&globalThis.postMessage){const send=globalThis.postMessage;globalThis.postMessage=function(message,...args){globalThis.labEmit(JSON.stringify({op:message.op,counts:{...counts}}));return Reflect.apply(send,this,[message,...args]);};}
 if(globalThis.OffscreenCanvasRenderingContext2D){const proto=OffscreenCanvasRenderingContext2D.prototype,read=proto.getImageData;proto.getImageData=function(...args){const value=Reflect.apply(read,this,args);counts.readbacks++;counts.readbackBytes+=value.data.byteLength;return value;};}
};

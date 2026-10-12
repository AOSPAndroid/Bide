// Halve an ONNX model's size by storing large float32 weights as float16, with
// a Cast back to float32 in the graph, so computation stays float32. For LaMa
// the fills are identical (max difference 0 on 0-255) at the same speed.
import onnxProto from 'onnx-proto';
const {onnx}=onnxProto;

// float32 -> float16 bits, round to nearest even (as numpy's astype).
const f32=new Float32Array(1),u32=new Uint32Array(f32.buffer);
export function toHalf(value){
 f32[0]=value;const x=u32[0],sign=(x>>>16)&0x8000,exp=(x>>>23)&0xff,mant=x&0x7fffff;
 if(exp===0xff)return sign|0x7c00|(mant?0x200:0);
 const e=exp-127+15;
 if(e>=0x1f)return sign|0x7c00;
 if(e<=0){if(e<-10)return sign;const m=(mant|0x800000)>>>0,shift=14-e,half=m>>>shift,rem=m&((1<<shift)-1),mid=1<<(shift-1);return sign|(half+(rem>mid||(rem===mid&&(half&1))?1:0));}
 const half=(e<<10)|(mant>>>13),rem=mant&0x1fff;
 return sign|(half+(rem>0x1000||(rem===0x1000&&(half&1))?1:0));
}

export function weightsToFloat16(bytes,minElements=1024){
 const model=onnx.ModelProto.decode(bytes),graph=model.graph,casts=[];let converted=0;
 graph.initializer=graph.initializer.map(init=>{
  const count=init.dims.reduce((a,d)=>a*Number(d),1);
  if(init.dataType!==onnx.TensorProto.DataType.FLOAT||count<minElements)return init;
  const source=init.rawData?.length?new Float32Array(init.rawData.buffer.slice(init.rawData.byteOffset,init.rawData.byteOffset+init.rawData.byteLength)):Float32Array.from(init.floatData);
  const half=new Uint16Array(source.length);for(let i=0;i<source.length;i++)half[i]=toHalf(source[i]);
  casts.push(onnx.NodeProto.create({opType:'Cast',input:[init.name+'_fp16'],output:[init.name],name:init.name+'_cast',attribute:[onnx.AttributeProto.create({name:'to',type:onnx.AttributeProto.AttributeType.INT,i:onnx.TensorProto.DataType.FLOAT})]}));
  converted++;
  return onnx.TensorProto.create({name:init.name+'_fp16',dims:init.dims,dataType:onnx.TensorProto.DataType.FLOAT16,rawData:new Uint8Array(half.buffer)});
 });
 graph.node=[...casts,...graph.node];
 return {bytes:onnx.ModelProto.encode(model).finish(),converted};
}

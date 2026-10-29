import { AppError } from '../../platform/error';
import { time } from '../../platform/validation';
import type { ReadingInput } from '../../modules/telemetry/types';
import type { GateContract } from './contract';
function unixSeconds(value:unknown):string|null {
  if(value===undefined||value===null||value==='')return null;
  const numeric=typeof value==='number'?value:typeof value==='string'&&/^\d{1,12}$/.test(value.trim())?Number(value):NaN;
  if(!Number.isFinite(numeric))return null;
  const date=new Date(numeric*1000);return Number.isFinite(date.getTime())?date.toISOString():null;
}
export function gateDeviceFromTopic(topic:string,contract:GateContract):string {
  if(!topic.startsWith(contract.topicPrefix))throw new AppError(422,'GATE_TOPIC','上报主题不符已登记契约');
  const external=topic.slice(contract.topicPrefix.length);
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(external))throw new AppError(422,'GATE_TOPIC','上报主题不符已登记契约');
  return external;
}
export function normalizeGate(raw:unknown,contract:GateContract,externalDeviceId:string,receivedAt:string,mode:'real'|'synthetic'='real'):ReadingInput[]{
  time(receivedAt);
  if(!contract.reference||!contract.version||!contract.verified||(contract.synthetic&&mode!=='synthetic'))throw new AppError(503,'GATE_CONTRACT_NOT_READY','三诚闸门字段与真实样本尚未核实，真实接入未开放');
  const wrapper=raw&&typeof raw==='object'?(raw as Record<string,unknown>)[contract.wrapperKey]:undefined;
  if(!wrapper||typeof wrapper!=='object')throw new AppError(422,'INVALID_VENDOR_BODY','报文包装不符已登记契约');
  const body=wrapper as Record<string,unknown>;
  if(body[contract.directionKey]!==contract.expectedDirection)throw new AppError(422,'INVALID_VENDOR_BODY','报文方向不符已登记契约');
  const rows=body[contract.rowsKey];if(!Array.isArray(rows)||rows.length>1000)throw new AppError(422,'INVALID_VENDOR_BODY','报文记录列表不符已登记契约');
  let sampledAt:string|null=null;
  for(const key of contract.sampledAtKeys){sampledAt=unixSeconds(body[key]);if(sampledAt)break;}
  const identity=contract.identityKeys.map(key=>body[key]).filter((v):v is string=>typeof v==='string'&&v!=='');
  const sourceRecordId=identity.length?identity.join('/'):null;
  const result:ReadingInput[]=[];
  for(const row of rows){
    if(!row||typeof row!=='object')continue;
    const record=row as Record<string,unknown>;
    const name=record[contract.nameKey];if(typeof name!=='string')continue;
    const m=contract.metrics.find(x=>x.sourceName===name);if(!m)continue;
    if(!Number.isFinite(m.scale)||!Number.isFinite(m.offset))throw new AppError(422,'INVALID_CONVERSION','单位换算参数未经核实');
    const candidates=contract.mappings.filter(x=>x.externalDeviceId===externalDeviceId&&x.metric===m.metric);if(candidates.length!==1)throw new AppError(422,'UNMAPPED_DEVICE','设备/指标映射缺失或不唯一；多通道须按真实契约拆分，不能选第一项');const mapping=candidates[0];
    const rawValue=record[contract.valueKey];
    const reasons:string[]=[];let quality:ReadingInput['quality']='valid';
    if(record[contract.errorKey]!==undefined&&record[contract.errorKey]!=='0'){quality='invalid';reasons.push('vendor_field_error');}
    const numeric=typeof rawValue==='number'?rawValue:typeof rawValue==='string'&&rawValue.trim()!==''?Number(rawValue):NaN;
    let value=Number.isFinite(numeric)?numeric*m.scale+m.offset:null;
    if(value===null||!Number.isFinite(value)){value=null;quality='invalid';reasons.push('invalid_number');}
    if(quality==='invalid')value=null;
    if(!sampledAt){if(quality==='valid')quality='suspect';reasons.push('unknown_sample_time');}
    result.push({sourceId:contract.sourceId,sourceRecordId,externalDeviceId,pointId:mapping.pointId,metric:m.metric,
      sampledAt,reportedAt:null,receivedAt,sequence:null,
      rawValue:typeof rawValue==='number'||typeof rawValue==='string'?rawValue:null,value,unit:m.unit,quality,reasons,origin:'live',rawRef:'',mappingVersion:mapping.bindingId??''});
  }
  return result;
}

// 统一详情框架的业务类型分发与标签配置（纯函数，供组件与单测复用）。
// 分发只依据正式对象 kind；水闸/泵站细类须由后端可信档案提供（F01 尚无该接口），
// 真实模式一律回退通用设施；演示模式的 symbol 仅用于演示骨架，不构成正式业务身份。
export type BusinessClass='farm'|'field'|'pond'|'gate'|'pump_station'|'mobile'|'generic';
export type DetailTabId='basic'|'production'|'monitoring'|'operation'|'devices'|'records';
export type RecordFilter='all'|'operation'|'inspection'|'alert'|'maintenance'|'farm_work'|'aquaculture';

export type ClassifiedItem={kind:string;symbol?:string|null;facility_subtype?:string|null;subtype_verified?:boolean|null};

export function resolveBusinessClass(item:ClassifiedItem,demo:boolean):BusinessClass{
  if(item.kind==='facility'){
    if(demo){
      if(item.symbol==='gate')return 'gate';
      if(item.symbol==='pump')return 'pump_station';
      return 'generic';
    }
    // 真实模式仅采信后端已核实的子类字段（F05）；未提供或未核实回退通用设施。
    if(item.subtype_verified===true){
      if(item.facility_subtype==='gate')return 'gate';
      if(item.facility_subtype==='pump_station')return 'pump_station';
    }
    return 'generic';
  }
  if(item.kind==='farm'||item.kind==='field'||item.kind==='pond'||item.kind==='mobile')return item.kind;
  return 'generic';
}

export const classLabels:Record<BusinessClass,string>={farm:'农场',field:'农田',pond:'塘口',gate:'水闸',pump_station:'泵站',mobile:'机动设备',generic:'固定设施'};

// 三标签：首标签固定「基本信息」，末标签固定「相关记录」，中标签按业务类配置。
export const middleTabs:Record<BusinessClass,{id:DetailTabId;label:string}|null>={
  farm:null,
  field:{id:'production',label:'农事生产'},
  pond:{id:'monitoring',label:'水体监测'},
  gate:{id:'operation',label:'运行信息'},
  pump_station:{id:'operation',label:'运行信息'},
  mobile:null,
  generic:{id:'devices',label:'关联设备'},
};

export function tabsFor(cls:BusinessClass):{id:DetailTabId;label:string}[]{
  const middle=middleTabs[cls];
  return [{id:'basic',label:'基本信息'},...(middle?[middle]:[]),{id:'records',label:'相关记录'}];
}

// R02-B：相关记录筛选类别按业务类配置（V1 各类规定，不再统一复用「操作」）。
export function recordFiltersFor(cls:BusinessClass|'region'|'mobile'):{id:RecordFilter;label:string}[]{
  const tail={inspection:{id:'inspection' as const,label:'巡检'},alert:{id:'alert' as const,label:'告警'},maintenance:{id:'maintenance' as const,label:'维护'}};
  const all={id:'all' as const,label:'全部'};
  if(cls==='field')return[all,{id:'farm_work',label:'农事'},tail.inspection,tail.alert];
  if(cls==='pond')return[all,{id:'aquaculture',label:'养殖'},tail.inspection,tail.alert,tail.maintenance];
  return[all,{id:'operation',label:'操作'},tail.inspection,tail.alert,tail.maintenance];
}

// R02-B：空间状态徽标——农田/塘口用「范围」，固定设施用「位置」；仅按 boundary_status 三态，不从几何推断。
export function scopeBadge(cls:BusinessClass,item:{geometry:unknown;boundary_status:string}):{text:string;status:string}{
  const label=cls==='gate'||cls==='pump_station'||cls==='generic'?'位置':'范围';
  if(!item.geometry)return{text:`${label}未登记`,status:'待登记'};
  if(item.boundary_status==='verified')return{text:`${label}已核实`,status:'已核实'};
  return{text:`${label}待核对`,status:'草稿'};
}

// 同类切换保留标签、跨类重置的规则在 F02 完善；此处保证当前标签在新对象上一定合法。
export function resolveActiveTab(current:DetailTabId,cls:BusinessClass):DetailTabId{
  return tabsFor(cls).some(tab=>tab.id===current)?current:'basic';
}

export type SelectionClass=BusinessClass|'region'|null;

// F02 跨对象切换规则：首次建立选择（含会话恢复）不重置；同类切换保留当前标签；跨类（含 gate↔pump、含进出片区/设备）回「基本信息」。
export function nextTabOnSelection(prev:SelectionClass,next:SelectionClass,current:DetailTabId):DetailTabId{
  if(next===null)return current;
  if(prev===null)return current;
  if(prev===next)return next==='region'?current:resolveActiveTab(current,next);
  return 'basic';
}

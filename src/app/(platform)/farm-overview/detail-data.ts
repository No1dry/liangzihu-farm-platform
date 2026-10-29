// F03 只读展示适配层（纯函数，供组件与单测复用）。
// 请求状态（loading/ready/partial/error/denied）与事实状态（unconfigured/pending/trusted/stale/suspect/conflict）严格分离：
// 读成功不代表数据可信；0 是有效值，不等于缺失；空数组只代表可信空查询。
export type SectionRequestState='loading'|'ready'|'partial'|'error'|'denied';
export type FactState='unconfigured'|'pending'|'trusted'|'stale'|'suspect'|'conflict';

export type ApiPoint={id:string;name:string;code:string;metric:string;unit:string};
export type ApiCurrentValue={value:number|null;unit:string|null;quality:string|null;sampledAt:string|null;reasons:string[]|null};
export type ApiCurrentRow={pointId:string;current:ApiCurrentValue|null};
export type ApiAlert={id:string;title:string;state:string;severity:string};

export type PointView={id:string;name:string;code:string;metric:string;unit:string;fact:FactState;value:number|null;valueUnit:string|null;sampledAt:string|null;reason:string};
export type AlertView={id:string;title:string;severity:string;state:'open'|'recovered';current:boolean};

// 单测点当前值的事实判定。maxAgeMs 缺失时不擅自判定过期（时效口径属后端接口缺口，见实施报告）。
export function classifyCurrent(current:ApiCurrentValue|null|undefined,opts:{maxAgeMs?:number|null;now?:number}={}):{fact:FactState;value:number|null;valueUnit:string|null;sampledAt:string|null;reason:string}{
  const none={value:null,valueUnit:null,sampledAt:null};
  if(current===undefined)return {...none,fact:'pending' as const,reason:'当前值接口未返回该测点'};
  if(current===null)return {...none,fact:'pending' as const,reason:'暂无可信当前值（绑定未核实、存在冲突或暂无上报）'};
  const sampledAt=current.sampledAt??null;
  if(current.quality==='invalid')return {...none,sampledAt,fact:'suspect' as const,reason:`测值质量无效${current.reasons?.length?`（${current.reasons.join('、')}）`:''}，不作为当前值`};
  if(current.quality==='suspect')return {...none,sampledAt,fact:'suspect' as const,reason:`测值质量存疑${current.reasons?.length?`（${current.reasons.join('、')}）`:''}，不作为当前值`};
  if(current.value===null||current.value===undefined)return {...none,sampledAt,fact:'pending' as const,reason:'当前值缺失'};
  if(opts.maxAgeMs&&sampledAt){const age=(opts.now??Date.now())-Date.parse(sampledAt);if(age>opts.maxAgeMs)return {...none,sampledAt,fact:'stale' as const,reason:'数据过期，不作为当前值'};}
  return {fact:'trusted' as const,value:current.value,valueUnit:current.unit,sampledAt,reason:''};
}

// 组装「指标→测点」展示行；currentRows 为 null 表示当前值接口读取失败（局部失败不拖垮测点清单）。
export function buildPointViews(points:ApiPoint[],currentRows:ApiCurrentRow[]|null,opts:{maxAgeMs?:number|null;now?:number}={}):PointView[]{
  const byId=new Map((currentRows??[]).map(row=>[row.pointId,row.current]));
  return points.map(point=>{
    if(currentRows===null)return {...point,fact:'pending' as const,value:null,valueUnit:null,sampledAt:null,reason:'当前值读取失败，可重试'};
    const judged=classifyCurrent(byId.get(point.id),opts);
    return {...point,...judged};
  });
}

export function groupByMetric(views:PointView[]):{metric:string;points:PointView[]}[]{
  const order:string[]=[];const map=new Map<string,PointView[]>();
  for(const view of views){if(!map.has(view.metric)){map.set(view.metric,[]);order.push(view.metric);}map.get(view.metric)!.push(view);}
  return order.map(metric=>({metric,points:map.get(metric)!}));
}

// 两个数据源（对象测点清单 / 批量当前值）的分区请求状态合成；任一 403 视为无权限。
export type SourceStatus='loading'|'ok'|'fail'|'denied';
export function sectionState(a:SourceStatus,b:SourceStatus):SectionRequestState{
  if(a==='denied'||b==='denied')return 'denied';
  if(a==='loading'||b==='loading')return 'loading';
  if(a==='ok'&&b==='ok')return 'ready';
  if(a==='fail'&&b==='fail')return 'error';
  return 'partial';
}

// 接口已过滤 state<>'closed'；open 才是当前告警，recovered 只作历史。
export function mapAlerts(rows:ApiAlert[]):AlertView[]{
  return rows.map(row=>({id:row.id,title:row.title,severity:row.severity,state:row.state==='open'?'open' as const:'recovered' as const,current:row.state==='open'}));
}

export const factLabels:Record<FactState,string>={unconfigured:'未配置',pending:'待核实',trusted:'可信',stale:'已过期',suspect:'质量存疑',conflict:'存在冲突'};

// F04 生产批次适配：取当前对象最新未结束且未被更正的批次；verified=false 只作待核实展示。
export type ApiBatch={id:string;object_id:string;code:string;species:string;variety:string|null;stage:string;source:string;verified:boolean;started_at:string;ended_at:string|null;supersedes_id:string|null};
export function currentBatch(rows:ApiBatch[],objectId:string):{batch:ApiBatch|null;state:'trusted'|'pending'|'none';reason:string}{
  const superseded=new Set(rows.map(row=>row.supersedes_id).filter((id):id is string=>!!id));
  const active=rows.filter(row=>row.object_id===objectId&&!row.ended_at&&!superseded.has(row.id));
  if(!active.length)return{batch:null,state:'none',reason:'暂无生产批次登记'};
  const latest=active[0];
  if(!latest.verified)return{batch:latest,state:'pending',reason:'生产批次已登记，尚未核实'};
  return{batch:latest,state:'trusted',reason:''};
}

// F04 塘口摘要：最多取两个可信水体指标，逐点展示，不合并不平均。
export function pickTrustedIndicators(views:PointView[],limit=2):PointView[]{
  return views.filter(view=>view.fact==='trusted').slice(0,limit);
}

// F05 设施业务子类：仅采信后端已核实的子类字段；未知/未核实一律回退（不名称猜测）。
export function trustedSubtype(subtype:string|null|undefined,verified:boolean|null|undefined):'gate'|'pump_station'|null{
  if(verified!==true)return null;
  if(subtype==='gate')return 'gate';
  if(subtype==='pump_station')return 'pump_station';
  return null;
}

// F05 水闸实际开度摘要：仅取 metric='opening' 的可信值；多个可信开度测点且无代表点时不合成；set_opening 永不参与。
export function selectOpeningView(views:PointView[]):{kind:'none'|'single'|'multiple';view:PointView|null}{
  const opening=views.filter(view=>view.metric==='opening'&&view.fact==='trusted');
  if(opening.length===0)return{kind:'none',view:null};
  if(opening.length===1)return{kind:'single',view:opening[0]};
  return{kind:'multiple',view:null};
}

// F05 水闸运行信息排序：实际开度第一、设置开度第二，其余保持登记顺序。
export function orderGateMetrics(views:PointView[]):PointView[]{
  const rank=(metric:string)=>metric==='opening'?0:metric==='set_opening'?1:2;
  return views.map((view,index)=>({view,index})).sort((a,b)=>rank(a.view.metric)-rank(b.view.metric)||a.index-b.index).map(row=>row.view);
}

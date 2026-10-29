'use client';
import Link from 'next/link';
import {useMemo} from 'react';
import {demoAlerts,demoTasks} from './demo-fixture';
import KindIcon from './kind-icon';
import {resolveBusinessClass,resolveActiveTab,tabsFor,classLabels,type BusinessClass,type DetailTabId,type RecordFilter} from './detail-classes';
import {groupByMetric,factLabels,type PointView,type SectionRequestState} from './detail-data';
import {useObjectDetail} from './use-object-detail';
import styles from './farm-overview.module.css';

type Item={id:string;farm_id?:string;farmId?:string;symbol?:string;name:string;code:string;kind:string;version:number;boundary_status:string;geometry:unknown;object_source?:string;object_recorded_at?:string;boundary_source?:string|null;boundary_recorded_at?:string|null;regionId?:string;detail?:string;status?:string;metric?:string;sampledAt?:string};
type Region={id:string;farmId:string;name:string;links:{objectId:string}[]};
type Mobile={binding_id:string;object_id:string;machine_name:string;terminal_name:string;valid_until:string};
type Summary={object_id:string;open_alerts:number;record_count:number;point_count:number};
const recordFilters:{id:RecordFilter;label:string}[]=[{id:'all',label:'全部'},{id:'operation',label:'操作'},{id:'inspection',label:'巡检'},{id:'alert',label:'告警'},{id:'maintenance',label:'维护'}];
function Facts({rows}:{rows:{value:string|number;label:string}[]}){return <div className={styles.detailFacts}>{rows.map(row=><div key={row.label}><strong>{row.value}</strong><span>{row.label}</span></div>)}</div>;}
function time(value?:string|null){return value?new Date(value).toLocaleString('zh-CN'):'未提供';}

// 统一右侧详情框架（F01）：身份标题 + 业务摘要插槽 + 三标签 + 真实完整档案入口。
// 只做展示分发；缺少后端可信数据时显示明确空态，不伪造数值。
export default function DetailPanel({mode,item,region,mobile,items,regions,summaries,mobileDevices,canConfigure,tab,recordFilter,onTab,onRecordFilter,onClose,onExitDemo,onManageRegion,onSaveReturn,onChangeRegion}:{mode:'real'|'demo';item:Item|null;region:Region|null;mobile:Mobile|null;items:Item[];regions:Region[];summaries:Summary[];mobileDevices:Mobile[];canConfigure:boolean;tab:DetailTabId;recordFilter:RecordFilter;onTab:(tab:DetailTabId)=>void;onRecordFilter:(filter:RecordFilter)=>void;onClose:()=>void;onExitDemo:()=>void;onManageRegion:()=>void;onSaveReturn:()=>void;onChangeRegion?:(item:Item)=>void}){
 const cls:BusinessClass|null=item?resolveBusinessClass(item,mode==='demo'):null;
 const tabs=useMemo(()=>{if(region||mobile)return[{id:'basic' as const,label:'基本信息'},{id:'records' as const,label:'相关记录'}];return cls?tabsFor(cls):[];},[cls,region,mobile]);
 const activeTab=cls?resolveActiveTab(tab,cls):'basic';
 const demo=mode==='demo';
 // F03：真实对象的测点/告警按需读取；演示对象不请求正式接口。
 const detail=useObjectDetail(item&&!demo?item.id:null,true);
 if(!item&&!region&&!mobile)return null;
 const title=item?.name??region?.name??mobile?.machine_name??'';
 const kindLabel=region?'片区':mobile?'机动设备':cls?classLabels[cls]:'农业对象';
 const regionForItem=item&&regions.find(row=>row.links.some(link=>link.objectId===item.id));
 const summary=item?summaries.find(row=>row.object_id===item.id):undefined;
 const regionRows=region?items.filter(row=>region.links.some(link=>link.objectId===row.id)):[];
 const farmId=item?.kind==='farm'?item.id:null;
 const ownerFarmId=item?item.farm_id??item.farmId??(item.kind==='farm'?item.id:null):region?.farmId??null;
 const ownerFarm=ownerFarmId?items.find(row=>row.id===ownerFarmId)??null:null;
 const farmItems=farmId?items.filter(row=>(row.farm_id??row.farmId??(row.kind==='farm'?row.id:null))===farmId):[];
 const farmItemIds=new Set(farmItems.map(row=>row.id));
 const farmAlerts=demo?demoAlerts.filter(row=>farmItemIds.has(row.objectId)):[];
 const farmFacts=[{label:'片区',value:regions.filter(row=>row.farmId===farmId).length},{label:'农田',value:farmItems.filter(row=>row.kind==='field').length},{label:'塘口',value:farmItems.filter(row=>row.kind==='pond').length},{label:'固定设施',value:farmItems.filter(row=>row.kind==='facility').length},{label:'机动设备',value:demo?farmItems.filter(row=>row.kind==='mobile').length:mobileDevices.filter(row=>farmItemIds.has(row.object_id)).length}];
 const regionFacts=[{label:'农田',value:regionRows.filter(row=>row.kind==='field').length},{label:'塘口',value:regionRows.filter(row=>row.kind==='pond').length},{label:'固定设施',value:regionRows.filter(row=>row.kind==='facility').length}];
 const boundaryStatus=item?.geometry?(item.boundary_status==='verified'?'已核实':'草稿，尚未核实'):'边界待登记';
 const demoRecords=demo?[...demoAlerts.filter(row=>row.objectId===item?.id).map(row=>({id:row.id,cat:'alert' as const,text:row.text+' · 演示提醒'})),...demoTasks.filter(row=>row.regionId===(region?.id??item?.regionId)).map(row=>({id:row.id,cat:'inspection' as const,text:row.text}))]:[];
 const shownRecords=demoRecords.filter(row=>recordFilter==='all'||row.cat===recordFilter);

 const summarySlot=(()=>{
  if(region)return <><Facts rows={regionFacts}/><p className={styles.drawerHint}>共关联 {regionRows.length} 个可见农业对象；按关联对象边界定位，片区本身没有正式测绘边界。</p></>;
  if(mobile)return <><p className={styles.businessLead}>机具与定位终端：{mobile.terminal_name}</p><p className={styles.metric}>位置未知 · 无实时定位数据</p><p className={styles.detailContext}>绑定有效期至 {new Date(mobile.valid_until).toLocaleDateString('zh-CN')}；绑定归属不等于当前位置。</p></>;
  if(!item||!cls)return null;
  if(cls==='farm')return <><Facts rows={farmFacts}/>{demo?<div className={styles.attention}>关注事项 · {farmAlerts.length} 条演示提醒{farmAlerts[0]&&<><br/>{farmAlerts[0].text}</>}</div>:<p className={styles.drawerHint}>本农场已授权对象中有 {summaries.filter(row=>farmItemIds.has(row.object_id)).reduce((n,row)=>n+row.open_alerts,0)} 条未关闭告警；仅统计已有授权概要。</p>}</>;
  if(demo)return <><p className={styles.businessLead}>{item.detail}</p>{item.metric&&<p className={styles.metric}>{item.metric}</p>}{item.sampledAt&&<p className={styles.detailContext}>演示采样时间：{time(item.sampledAt)} · 非现场遥测</p>}{item.status&&cls!=='field'&&cls!=='pond'&&<p className={styles.detailContext}>{item.status} · 演示状态</p>}</>;
  if(cls==='field'||cls==='pond')return <><Facts rows={[{label:'农事记录',value:summary?.record_count??0},{label:'关联测点',value:summary?.point_count??0}]}/></>;
  return <Facts rows={[{label:'关联测点',value:summary?.point_count??0}]}/>;
 })();

 // F03 测量分区：按「指标→测点」展示，局部失败隔离与重试，不重置地图。
 const measurementSection=(title:string)=>{
  const {measurementState,pointViews,retry}=detail;
  if(measurementState==='loading')return <p className={styles.drawerHint}>正在读取测点与当前值…</p>;
  if(measurementState==='denied')return <p className={styles.drawerHint}>当前账号无权读取该对象的测点资料。</p>;
  if(measurementState==='error')return <p className={styles.drawerHint}>测点资料读取失败。<button type="button" onClick={retry}>重试</button></p>;
  if(!pointViews.length)return <p className={styles.drawerHint}>暂无已登记的关联测点；{title}不展示任何推断数值。</p>;
  return <>
   {measurementState==='partial'&&<p className={styles.drawerHint}>部分数据读取失败，当前值可能不完整。<button type="button" onClick={retry}>重试</button></p>}
   {groupByMetric(pointViews).map(group=><section key={group.metric} className={styles.detailSection}><h3>{group.metric}</h3><dl className={styles.detailList}>{group.points.map(point=><div key={point.id}><dt>{point.name}</dt><dd>{point.fact==='trusted'?<>{point.value} {point.valueUnit??point.unit}{point.sampledAt&&<><br/><small>采样 {time(point.sampledAt)}</small></>}</>:<span className={styles.factReason} data-fact={point.fact}>{point.reason}</span>}</dd></div>)}</dl></section>)}
  </>;
 };

 const middleTabBody=(()=>{
  if(!item||!cls)return null;
  if(activeTab==='production')return <div className={styles.detailTabBody}><p className={styles.businessLead}>{demo?item.detail??'演示生产资料':'暂无可信作物或生长阶段资料；进入原农事模块核对。'}</p>{!demo&&<p className={styles.detailContext}>{summary?`农事记录 ${summary.record_count} · 关联测点 ${summary.point_count}`:'暂无关联记录'}</p>}<p className={styles.drawerHint}>经核实的地块面积口径与生产阶段由后续任务（F04）接入；当前不展示推断数值。</p></div>;
  if(activeTab==='monitoring')return <div className={styles.detailTabBody}>{demo?<><p className={styles.businessLead}>{item.detail??'演示水体资料'}</p>{item.metric&&<p className={styles.metric}>{item.metric}</p>}</>:measurementSection('水体监测')}{!demo&&<p className={styles.drawerHint}>同指标多测点不会自动合并或平均；没有可信当前值时不显示数值。</p>}</div>;
  if(activeTab==='operation')return <div className={styles.detailTabBody}>{demo?<><p className={styles.businessLead}>{item.detail}</p><p className={styles.metric}>{item.status} · 演示状态</p></>:cls==='gate'?<><p className={styles.businessLead}>实际开度：暂无已核实的代表开度测点。</p><p className={styles.detailContext}>数据上报：上报状态待确认。</p><p className={styles.drawerHint}>水闸子类身份、代表测点与上报周期须经登记核实（后端接口依赖）；未经核实不显示开度数值。本页面只读，不提供控制操作。</p></>:<><p className={styles.businessLead}>泵组运行概况：暂无已核实的机组档案。</p><p className={styles.detailContext}>数据上报：上报状态待确认。</p><p className={styles.drawerHint}>泵站子类与机组身份须经登记核实（后端接口依赖）；未确认的设备不计入机组，运行/停止/未知不做猜测。本页面只读，不提供控制操作。</p></>}</div>;
  if(activeTab==='devices')return <div className={styles.detailTabBody}>{item.kind==='facility'&&<p className={styles.detailContext}>设施对象与实体设备须分别登记；设备详情进入设备台账核对。</p>}{measurementSection('关联设备')}{item.kind==='facility'&&<Link href="/devices">查看关联设备 ↗</Link>}{canConfigure&&item.kind==='facility'&&<Link href="/devices#register">登记关联实体设备 ↗</Link>}</div>;
  return null;
 })();

 return <aside className={styles.drawer} aria-label="对象详情" aria-live="polite">
  <div className={styles.drawerTop}><div className={styles.detailHeading}><KindIcon kind={cls==='gate'||cls==='pump_station'?'facility':item?.kind??(region?'region':undefined)} className={styles.detailKindIcon}/><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="关闭对象详情" title="收起右侧详情栏">×</button></div>
  <div className={styles.detailBadges}><span className={styles.kind}>{kindLabel}{demo?' · 演示':''}</span>{item&&<span className={styles.statusBadge} data-status={item.geometry?(item.boundary_status==='verified'?'已核实':'草稿'):'待登记'}>{item.geometry?(item.boundary_status==='verified'?'已核实':'草稿'):'待登记'}</span>}{cls==='generic'&&item?.kind==='facility'&&!demo&&<span className={styles.statusBadge} data-status="待登记">子类未核实</span>}</div>
  <p className={styles.detailContext}>{demo?'合成示例 · 非真实现场':region?'经营分组，不代表行政村边界':item&&regionForItem?`所属 ${regionForItem.name}`:mobile?'绑定归属来自原农机业务':cls==='generic'&&item?.kind==='facility'?'设施业务子类尚未核实，按通用设施概要显示':'仅当前账号获授权资料'}</p>
  {summarySlot}
  <div className={styles.detailTabs} role="tablist" aria-label="对象资料分区">
   {tabs.map(row=><button key={row.id} type="button" role="tab" aria-selected={activeTab===row.id} className={activeTab===row.id?styles.activeTab:''} onClick={()=>onTab(row.id)}>{row.label}</button>)}
  </div>
  {activeTab==='basic'&&<div className={styles.detailTabBody}>
   {(item||region)&&<section className={styles.detailSection}><div className={styles.detailSectionHeader}><h3>基本信息</h3>{!demo&&item&&item.kind!=='farm'&&<Link href={`/objects/${item.id}`} onClick={onSaveReturn}>编辑</Link>}</div><dl className={styles.detailList}>{item&&<div><dt>对象编号</dt><dd>{item.code}</dd></div>}{ownerFarm&&<div><dt>所属农场</dt><dd>{ownerFarm.name}</dd></div>}{regionForItem&&<div><dt>所属村庄</dt><dd>{regionForItem.name}</dd></div>}<div><dt>对象名称</dt><dd>{title}</dd></div>{item&&<div><dt>边界状态</dt><dd>{demo?'演示区域（非测绘边界）':boundaryStatus}</dd></div>}{item&&<div><dt>登记依据</dt><dd>{item.boundary_source??item.object_source??'未提供'}</dd></div>}</dl></section>}
   {mobile&&<section className={styles.detailSection}><h3>绑定信息</h3><p className={styles.businessLead}>机具与定位终端：{mobile.terminal_name}</p><p className={styles.detailContext}>绑定有效期至 {time(mobile.valid_until)}；绑定归属不等于当前位置。</p></section>}
   {item&&<section className={styles.detailSection}><h3>档案元数据</h3><dl className={styles.detailList}><div><dt>版本</dt><dd>{item.version}</dd></div><div><dt>资料来源</dt><dd>{item.boundary_source??item.object_source??'未提供'}</dd></div><div><dt>记录时间</dt><dd>{time(item.boundary_recorded_at??item.object_recorded_at)}</dd></div><div><dt>资料范围</dt><dd>{demo?'只读合成演示，不写入业务库':'仅当前账号获授权内容'}</dd></div></dl></section>}
  </div>}
  {middleTabBody}
  {activeTab==='records'&&<div className={styles.detailTabBody}>
   <div className={styles.recordFilters} role="group" aria-label="记录类别筛选">{recordFilters.map(row=><button key={row.id} type="button" className={recordFilter===row.id?styles.activeFilter:''} aria-pressed={recordFilter===row.id} onClick={()=>onRecordFilter(row.id)}>{row.label}</button>)}</div>
   {demo?(shownRecords.length?shownRecords.map(row=><p key={row.id} className={styles.drawerHint}>{row.text}</p>):<p className={styles.drawerHint}>该类别暂无演示记录。</p>):(()=>{
    const {alertState,alertViews,retry}=detail;
    if(alertState==='loading')return <p className={styles.drawerHint}>正在读取相关记录…</p>;
    if(alertState==='denied')return <p className={styles.drawerHint}>当前账号无权读取该对象的相关记录。</p>;
    if(alertState==='error')return <p className={styles.drawerHint}>相关记录读取失败。<button type="button" onClick={retry}>重试</button></p>;
    if(recordFilter!=='all'&&recordFilter!=='alert')return <p className={styles.drawerHint}>「{recordFilters.find(row=>row.id===recordFilter)?.label}」类别的按对象聚合接口尚未提供（F06 后端依赖）；暂不展示推断记录。</p>;
    if(!alertViews.length)return <p className={styles.drawerHint}>该类别暂无相关记录。</p>;
    return <>{alertViews.map(row=><div key={row.id} className={styles.recordItem}><strong>{row.title}</strong><span>{row.severity} · {row.current?'当前告警':'已恢复'}</span></div>)}<p className={styles.drawerHint}>操作、巡检与维护类别及事件时间字段的聚合接口待提供（F06）；已恢复告警仅作历史展示。</p></>;
   })()}
  </div>}
  <div className={styles.drawerActions}>{demo?<button type="button" onClick={onExitDemo}>退出演示，管理真实资料 ↗</button>:<>{item?.kind==='farm'&&<Link href="/objects">查看全部对象 ↗</Link>}{region&&canConfigure&&<button type="button" onClick={onManageRegion}>管理村庄与关联 ↗</button>}{item&&item.kind!=='farm'&&<Link href={`/objects/${item.id}`} onClick={onSaveReturn}>查看完整档案 ↗</Link>}{item&&['field','pond'].includes(item.kind)&&<Link href={`/map-editor?object=${item.id}`} onClick={onSaveReturn}>{item.geometry?'编辑边界':'登记边界'}</Link>}{item&&item.kind!=='farm'&&item.kind!=='mobile'&&<details className={styles.moreActions}><summary>更多</summary><div className={styles.drawerLinks}>{canConfigure&&item&&onChangeRegion&&<button type="button" onClick={()=>onChangeRegion(item)}>更改所属村庄</button>}{item?.kind==='field'&&<Link href="/records">查看农事记录 ↗</Link>}{item?.kind==='pond'&&<Link href="/alerts">查看告警与测点 ↗</Link>}{item?.kind==='facility'&&<Link href="/devices">查看关联设备 ↗</Link>}{canConfigure&&item?.kind==='facility'&&<Link href="/devices#register">登记关联实体设备 ↗</Link>}</div></details>}{mobile&&<Link href="/machinery">打开农机业务 ↗</Link>}</>}</div>
 </aside>;
}

'use client';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {demoAlerts,demoTasks} from './demo-fixture';
import KindIcon from './kind-icon';
import {resolveBusinessClass,resolveActiveTab,tabsFor,classLabels,type BusinessClass,type DetailTabId,type RecordFilter} from './detail-classes';
import {groupByMetric,factLabels,currentBatch,pickTrustedIndicators,selectOpeningView,orderGateMetrics,currentAlerts,type PointView,type SectionRequestState} from './detail-data';
import {boundaryAreaSqm,formatArea} from './detail-area';
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
 // F06：记录展开属业务局部交互，一次一条，切换对象即清空（同类保留标签的规则在 F02 已落实）。
 const [expandedRecordId,setExpandedRecordId]=useState<string|null>(null);
 useEffect(()=>{setExpandedRecordId(null);},[item?.id]);
 const openAlerts=currentAlerts(detail.alertViews);
 const locateAlert=(id:string)=>{onTab('records');onRecordFilter('alert');setExpandedRecordId(id);};
 // F06 顶部当前告警条：仅在可信查询成功且确有 open 事件时出现；读取失败明确「无法确认」，不冒充无告警。
 const alertSlot=<>{detail.alertState==='ready'?openAlerts.length>0&&<div className={styles.attention}>当前告警 {openAlerts.length} 条：{openAlerts[0].title} <button type="button" onClick={()=>locateAlert(openAlerts[0].id)}>查看</button></div>:detail.alertState==='error'?<p className={styles.drawerHint}>当前重要告警状态无法确认（读取失败）。<button type="button" onClick={detail.retry}>重试</button></p>:null}</>;
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
  if(cls==='field'||cls==='pond'){
   // F04：管理范围面积（登记边界计算）与生产批次/当前养殖、至多两个可信水体指标。
   const area=formatArea(boundaryAreaSqm(item.geometry));
   const batch=currentBatch(detail.batches,item.id);
   const indicators=cls==='pond'?pickTrustedIndicators(detail.pointViews,2):[];
   return <>
    {area&&<p className={styles.metric}>管理范围面积 {area.mu}<small>（{area.sqm}）</small></p>}
    {area&&<p className={styles.detailContext}>{item.boundary_status==='verified'?'按已核实登记边界计算':'按草稿边界计算，尚未核实'}；与 CAD 竣工图施工参考面积是不同口径。</p>}
    {detail.batchState==='loading'?<p className={styles.drawerHint}>正在读取生产批次…</p>:detail.batchState==='denied'?<p className={styles.drawerHint}>当前账号无权读取生产批次。</p>:detail.batchState==='error'?<p className={styles.drawerHint}>生产批次读取失败。<button type="button" onClick={detail.retry}>重试</button></p>:batch.state==='trusted'&&batch.batch?<p className={styles.businessLead}>{cls==='field'?'当前生产':'当前养殖'}：{batch.batch.species}{batch.batch.variety?`（${batch.batch.variety}）`:''} · {batch.batch.stage}</p>:batch.state==='pending'&&batch.batch?<p className={styles.drawerHint}>{batch.reason}：{batch.batch.species} · {batch.batch.stage}；暂不作为可信生产信息。</p>:<p className={styles.drawerHint}>暂无生产批次登记。</p>}
    {cls==='pond'&&indicators.length>0&&<p className={styles.metric}>{indicators.map(point=>`${point.name} ${point.value} ${point.valueUnit??point.unit}`).join(' · ')}</p>}
    {alertSlot}
    <Facts rows={[{label:'农事记录',value:summary?.record_count??0},{label:'关联测点',value:summary?.point_count??0}]}/>
   </>;
  }
  if(cls==='gate'){
   // F05 水闸摘要：实际开度只取可信 opening；多测点无代表不合成；set_opening 不出现在摘要。
   const opening=selectOpeningView(detail.pointViews);
   return <>
    {detail.measurementState==='loading'?<p className={styles.drawerHint}>正在读取测点与当前值…</p>:opening.kind==='single'&&opening.view?<p className={styles.metric}>实际开度 {opening.view.value} {opening.view.valueUnit??'%'}{opening.view.sampledAt&&<><br/><small>采样 {time(opening.view.sampledAt)}</small></>}</p>:opening.kind==='multiple'?<p className={styles.drawerHint}>存在多个可信开度测点且未指定代表测点，请到「运行信息」逐项查看，此处不合成数值。</p>:<p className={styles.drawerHint}>实际开度：暂无已核实的代表开度测点。</p>}
    <p className={styles.detailContext}>数据上报：上报状态待确认（测点时效参数未随接口下发，缺口已登记）。</p>
    {detail.alertState==='ready'?(openAlerts.length>0?alertSlot:<p className={styles.detailContext}>当前重要告警：暂无（仅表示本次可信查询无 open 事件，不代表设备正常）。</p>):alertSlot}
    <Facts rows={[{label:'关联测点',value:summary?.point_count??0}]}/>
   </>;
  }
  if(cls==='pump_station')return <><p className={styles.drawerHint}>泵组运行概况：暂无已核实的机组档案；未确认的设备不计入机组，运行/停止/未知不做猜测。</p><p className={styles.detailContext}>数据上报：上报状态待确认（测点时效参数未随接口下发，缺口已登记）。</p>{detail.alertState==='ready'?(openAlerts.length>0?alertSlot:<p className={styles.detailContext}>当前重要告警：暂无（仅表示本次可信查询无 open 事件，不代表设备正常）。</p>):alertSlot}<Facts rows={[{label:'关联测点',value:summary?.point_count??0}]}/></>;
  return <Facts rows={[{label:'关联测点',value:summary?.point_count??0}]}/>;
 })();

 // F03 测量分区：按「指标→测点」展示，局部失败隔离与重试，不重置地图。
 const measurementSection=(title:string,ordered?:PointView[])=>{
  const {measurementState,pointViews,retry}=detail;
  const views=ordered??pointViews;
  if(measurementState==='loading')return <p className={styles.drawerHint}>正在读取测点与当前值…</p>;
  if(measurementState==='denied')return <p className={styles.drawerHint}>当前账号无权读取该对象的测点资料。</p>;
  if(measurementState==='error')return <p className={styles.drawerHint}>测点资料读取失败。<button type="button" onClick={retry}>重试</button></p>;
  if(!views.length)return <p className={styles.drawerHint}>暂无已登记的关联测点；{title}不展示任何推断数值。</p>;
  return <>
   {measurementState==='partial'&&<p className={styles.drawerHint}>部分数据读取失败，当前值可能不完整。<button type="button" onClick={retry}>重试</button></p>}
   {groupByMetric(views).map(group=><section key={group.metric} className={styles.detailSection}><h3>{group.metric}</h3><dl className={styles.detailList}>{group.points.map(point=><div key={point.id}><dt>{point.name}</dt><dd>{point.fact==='trusted'?<>{point.value} {point.valueUnit??point.unit}{point.sampledAt&&<><br/><small>采样 {time(point.sampledAt)}</small></>}</>:<span className={styles.factReason} data-fact={point.fact}>{point.reason}</span>}</dd></div>)}</dl></section>)}
  </>;
 };

 const middleTabBody=(()=>{
  if(!item||!cls)return null;
  if(activeTab==='production'){
   if(demo)return <div className={styles.detailTabBody}><p className={styles.businessLead}>{item.detail??'演示生产资料'}</p></div>;
   const batch=currentBatch(detail.batches,item.id);
   return <div className={styles.detailTabBody}>
    {detail.batchState==='loading'?<p className={styles.drawerHint}>正在读取生产批次…</p>:detail.batchState==='denied'?<p className={styles.drawerHint}>当前账号无权读取生产批次。</p>:detail.batchState==='error'?<p className={styles.drawerHint}>生产批次读取失败。<button type="button" onClick={detail.retry}>重试</button></p>:batch.state==='trusted'&&batch.batch?<dl className={styles.detailList}><div><dt>当前作物</dt><dd>{batch.batch.species}{batch.batch.variety?`（${batch.batch.variety}）`:''}</dd></div><div><dt>生长阶段</dt><dd>{batch.batch.stage}</dd></div><div><dt>批次编号</dt><dd>{batch.batch.code}</dd></div><div><dt>开始时间</dt><dd>{time(batch.batch.started_at)}</dd></div><div><dt>登记来源</dt><dd>{batch.batch.source}</dd></div></dl>:batch.state==='pending'&&batch.batch?<p className={styles.drawerHint}>{batch.reason}：{batch.batch.species} · {batch.batch.stage}；暂不作为可信生产信息。</p>:<p className={styles.drawerHint}>暂无生产批次登记；不展示推断的作物或阶段。</p>}
    <p className={styles.detailContext}>{summary?`农事记录 ${summary.record_count} · 关联测点 ${summary.point_count}`:'暂无关联记录'}</p>
   </div>;
  }
  if(activeTab==='monitoring')return <div className={styles.detailTabBody}>{demo?<><p className={styles.businessLead}>{item.detail??'演示水体资料'}</p>{item.metric&&<p className={styles.metric}>{item.metric}</p>}</>:measurementSection('水体监测')}{!demo&&<p className={styles.drawerHint}>同指标多测点不会自动合并或平均；没有可信当前值时不显示数值。</p>}</div>;
  if(activeTab==='operation'){
   if(demo)return <div className={styles.detailTabBody}><p className={styles.businessLead}>{item.detail}</p><p className={styles.metric}>{item.status} · 演示状态</p></div>;
   if(cls==='gate')return <div className={styles.detailTabBody}>
    {measurementSection('运行信息',orderGateMetrics(detail.pointViews))}
    {detail.pointViews.some(point=>point.metric==='set_opening')&&<p className={styles.detailContext}>设置开度为设备上报的设置值，不代表本平台下发指令；未安装、未配置的指标不生成卡片。</p>}
    <p className={styles.drawerHint}>本页面只读，不提供控制操作。</p>
   </div>;
   return <div className={styles.detailTabBody}>
    <p className={styles.businessLead}>机组：暂无已核实的机组档案。</p>
    <p className={styles.drawerHint}>泵站机组身份与运行反馈契约待后端落地（接口依赖已登记）；网关、控制器不计入机组，无证据状态保持未知。</p>
    <section className={styles.detailSection}><h3>站级监测</h3>{measurementSection('站级监测')}</section>
    <p className={styles.drawerHint}>本页面只读，不提供控制操作。</p>
   </div>;
  }
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
    return <>{alertViews.map(row=><div key={row.id} className={styles.recordItem}>
     <button type="button" className={styles.recordItemButton} aria-expanded={expandedRecordId===row.id} onClick={()=>setExpandedRecordId(expandedRecordId===row.id?null:row.id)}><strong>{row.title}</strong><span>{row.severity} · {row.current?'当前告警':'已恢复'}</span></button>
     {expandedRecordId===row.id&&<div className={styles.recordDetail}><dl className={styles.detailList}><div><dt>类别</dt><dd>告警</dd></div><div><dt>业务状态</dt><dd>{row.current?'当前（open）':'已恢复（recovered）'}</dd></div><div><dt>严重程度</dt><dd>{row.severity}</dd></div><div><dt>事件编号</dt><dd>{row.id.slice(0,8)}…</dd></div><div><dt>事件时间</dt><dd>接口暂未提供（缺口已登记）</dd></div></dl><Link href={`/alerts/${row.id}`}>查看完整告警 ↗</Link></div>}
    </div>)}<p className={styles.drawerHint}>操作、巡检与维护类别及事件时间字段的聚合接口待提供（F06 后端依赖）；已恢复告警仅作历史展示；每条记录可展开查看来源与完整业务入口，一次仅展开一条。</p></>;
   })()}
  </div>}
  <div className={styles.drawerActions}>{demo?<button type="button" onClick={onExitDemo}>退出演示，管理真实资料 ↗</button>:<>{item?.kind==='farm'&&<Link href="/objects">查看全部对象 ↗</Link>}{region&&canConfigure&&<button type="button" onClick={onManageRegion}>管理村庄与关联 ↗</button>}{item&&item.kind!=='farm'&&<Link href={`/objects/${item.id}`} onClick={onSaveReturn}>查看完整档案 ↗</Link>}{item&&['field','pond'].includes(item.kind)&&<Link href={`/map-editor?object=${item.id}`} onClick={onSaveReturn}>{item.geometry?'编辑边界':'登记边界'}</Link>}{item&&item.kind!=='farm'&&item.kind!=='mobile'&&<details className={styles.moreActions}><summary>更多</summary><div className={styles.drawerLinks}>{canConfigure&&item&&onChangeRegion&&<button type="button" onClick={()=>onChangeRegion(item)}>更改所属村庄</button>}{item?.kind==='field'&&<Link href="/records">查看农事记录 ↗</Link>}{item?.kind==='pond'&&<Link href="/alerts">查看告警与测点 ↗</Link>}{item?.kind==='facility'&&<Link href="/devices">查看关联设备 ↗</Link>}{canConfigure&&item?.kind==='facility'&&<Link href="/devices#register">登记关联实体设备 ↗</Link>}</div></details>}{mobile&&<Link href="/machinery">打开农机业务 ↗</Link>}</>}</div>
 </aside>;
}

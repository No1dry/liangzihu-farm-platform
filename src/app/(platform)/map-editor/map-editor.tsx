'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import {fromLonLat} from 'ol/proj.js';
import {useApi} from '@/components/platform/use-api';
import {tiandituWmtsUrls,validBrowserKey} from '@/modules/map-prototype/tianditu';
import {CATEGORY_ORDER,objectStyles} from '../farm-overview/map-symbols';
import LayerPanel from '../farm-overview/layer-panel';
import styles from './map-editor.module.css';

type Geometry={type:string;coordinates:unknown};
type FarmObject={id:string;name:string;code:string;kind:string;version:number;boundary_status:string;boundary_source?:string|null;geometry:Geometry|null};
type MapData={items:FarmObject[];regions:unknown[];summaries:unknown[];mobileDevices:unknown[]};
type Me={actor:{role:string};scopes:{action:string;objectIds:string[]}[]};
const key=process.env.NEXT_PUBLIC_TIANDITU_KEY?.trim()??'';
const FARM_HOME_4326:[number,number]=[114.635,30.25];
const defaultVisibility:Record<string,boolean>=Object.fromEntries(CATEGORY_ORDER.map(k=>[k,true]));
const editStyle=new Style({stroke:new Stroke({color:'#f2bd62',width:3,lineDash:[8,5]}),fill:new Fill({color:'rgba(184,130,48,.22)'}),image:new CircleStyle({radius:6,fill:new Fill({color:'#f2bd62'}),stroke:new Stroke({color:'#fff',width:2})})});
const statusText:Record<string,string>={verified:'已核实',draft:'边界草稿',unknown:'待登记边界'};

export default function MapEditor(){
 const [basemap,setBasemap]=useState<'vector'|'satellite'>('vector');
 const [annotationsVisible,setAnnotationsVisible]=useState(true);
 const [layerPanelOpen,setLayerPanelOpen]=useState(false);
 const [objectPanelOpen,setObjectPanelOpen]=useState(false);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [editorState,setEditorState]=useState<'idle'|'drawing'|'modifying'>('idle');
 const [status,setStatus]=useState<'draft'|'verified'>('draft');
 const [source,setSource]=useState('');
 const [message,setMessage]=useState('');
 const [saving,setSaving]=useState(false);
 const [needsRefresh,setNeedsRefresh]=useState(false);
 const [search,setSearch]=useState('');
 const [returnToOverview,setReturnToOverview]=useState(false);
 const [savedReturn,setSavedReturn]=useState(false);
 const [refreshedAfterConflict,setRefreshedAfterConflict]=useState(false);
 const composingRef=useRef(false);
 const savingRef=useRef(false);
 const editorStateRef=useRef(editorState);editorStateRef.current=editorState;
 const layerPanelOpenRef=useRef(layerPanelOpen);layerPanelOpenRef.current=layerPanelOpen;
 const target=useRef<HTMLDivElement>(null),mapRef=useRef<Map|null>(null),baseLayerRef=useRef<TileLayer<XYZ>|null>(null),annoLayerRef=useRef<TileLayer<XYZ>|null>(null),referenceSourceRef=useRef<VectorSource<Feature>|null>(null),editSourceRef=useRef<VectorSource<Feature>|null>(null),drawRef=useRef<Draw|null>(null),modifyRef=useRef<Modify|null>(null),currentBasemapRef=useRef(basemap);
 const initialObjectId=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('object'):null;
 const initialSelectedRef=useRef(false);
 const overview=useApi<MapData>('/api/v1/farm-overview');
 const configure=useApi<{items:{id:string;kind:string;archived_at:string|null}[]}>('/api/v1/objects?action=configure&limit=200');
 const me=useApi<Me>('/api/v1/me');
 const editableObjects=useMemo(()=>{if(!overview.data||!configure.data)return [];const ids=new Set(configure.data.items.filter(i=>!i.archived_at&&(i.kind==='field'||i.kind==='pond')).map(i=>i.id));return overview.data.items.filter(i=>ids.has(i.id));},[overview.data,configure.data]);
 const selected=editableObjects.find(o=>o.id===selectedId)??null;
 const canReviewSelected=!!(selected&&me.data?.scopes.some(s=>s.action==='review'&&s.objectIds.includes(selected.id)));
 const loading=overview.loading||configure.loading||me.loading;
 const error=overview.error||configure.error||me.error;
 const filtered=useMemo(()=>editableObjects.filter(o=>(o.name+' '+o.code).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),[editableObjects,search]);

 const clearInteractions=()=>{const map=mapRef.current;if(drawRef.current){map?.removeInteraction(drawRef.current);drawRef.current=null;}if(modifyRef.current){map?.removeInteraction(modifyRef.current);modifyRef.current=null;}editSourceRef.current?.clear();};
 const fitObject=(object:FarmObject)=>{const map=mapRef.current,source=referenceSourceRef.current;if(!map||!source||!object.geometry)return;const features=source.getFeatures().filter(f=>f.get('objectId')===object.id);if(!features.length)return;const extent=features[0].getGeometry()?.getExtent();if(extent)map.getView().fit(extent,{padding:[80,80,80,80],maxZoom:16,duration:350});};
 const hasUnsavedChanges=()=>editorStateRef.current!=='idle'&&(editSourceRef.current?.getFeatures().length??0)>0;
 const confirmDiscard=()=>!hasUnsavedChanges()||window.confirm('有未保存的边界修改，确定放弃？');
 const startDrawing=()=>{clearInteractions();const map=mapRef.current,source=editSourceRef.current;if(!map||!source)return;setEditorState('drawing');const draw=new Draw({source,type:'Polygon'});drawRef.current=draw;map.addInteraction(draw);draw.on('drawend',()=>{draw.setActive(false);setMessage('多边形绘制完成，填写依据后保存。');});setMessage('在地图上逐点绘制边界，双击结束。');};
 const startModifying=(object:FarmObject)=>{clearInteractions();const map=mapRef.current,source=editSourceRef.current;if(!map||!source||!object.geometry)return startDrawing();try{const features=new GeoJSON().readFeatures(object.geometry,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});for(const f of features){f.set('objectId',object.id);source.addFeature(f);}const modify=new Modify({source});modifyRef.current=modify;map.addInteraction(modify);setEditorState('modifying');setMessage('拖动顶点修改边界，填写依据后保存。');}catch{setMessage('现有边界无法解析，请重新绘制。');startDrawing();}};
 const selectObject=(object:FarmObject)=>{if(!confirmDiscard())return;setSelectedId(object.id);setStatus('draft');setSource('');setNeedsRefresh(false);setRefreshedAfterConflict(false);setSavedReturn(false);setObjectPanelOpen(false);if(object.geometry)startModifying(object);else startDrawing();window.requestAnimationFrame(()=>fitObject(object));};
 const redraw=()=>{if(!selected||!confirmDiscard())return;clearInteractions();startDrawing();};
 const cancelEdit=()=>{if(!confirmDiscard())return;clearInteractions();setEditorState('idle');setNeedsRefresh(false);setRefreshedAfterConflict(false);setSavedReturn(false);setMessage('已取消编辑，未保存任何边界。');};
 const refreshData=async()=>{setMessage('正在刷新对象版本…');await Promise.all([overview.reload(),configure.reload()]);setRefreshedAfterConflict(true);setMessage('对象版本已刷新，参考层已显示当前正式边界；确认后请重新提交。');};
 const onSave=async()=>{if(savingRef.current||composingRef.current||!selected||editorStateRef.current==='idle')return;const features=editSourceRef.current?.getFeatures()??[];if(features.length!==1){setMessage('请绘制或保留恰好一个边界多边形。');return;}const geometry=features[0].getGeometry();if(!geometry){setMessage('请先绘制或选择要保存的边界。');return;}if(!source.trim()){setMessage('请填写来源和确认依据。');return;}if(needsRefresh&&!refreshedAfterConflict){setMessage('请先查看最新边界，确认后再重新提交。');return;}savingRef.current=true;setSaving(true);setMessage('');try{const encoded=new GeoJSON().writeGeometryObject(geometry,{featureProjection:'EPSG:3857',dataProjection:'EPSG:4326'}) as Geometry;const body={objectId:selected.id,version:selected.version,sourceCrs:4326,geometry:encoded,status,source:source.trim()};const res=await fetch('/api/v1/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin'});const data=await res.json().catch(()=>null);if(!res.ok){const msg=data?.message??'请稍后重试。';if(res.status===409){setNeedsRefresh(true);setRefreshedAfterConflict(false);setMessage(`边界版本已变化（他人可能已更新）。已为你保留未提交几何，请先查看最新边界，确认后再重新提交。`);}else if(res.status===403){setMessage(`权限不足：${msg} 请确认当前账号仍拥有该对象的配置/审核权。`);}else if(res.status===400||res.status===422){setMessage(`边界数据校验失败：${msg} 请检查几何是否闭合、无自交。`);}else{setMessage(`保存失败（${res.status}）：${msg}`);}return;}setMessage('边界已保存，正在刷新数据…');await Promise.all([overview.reload(),configure.reload()]);clearInteractions();setEditorState('idle');setSource('');setNeedsRefresh(false);setRefreshedAfterConflict(false);setSavedReturn(true);setMessage(`已保存“${selected.name}”的边界，版本已更新。`);}catch{setMessage('网络不可用，未提交边界；临时几何与表单已保留，请恢复网络后重试。');}finally{savingRef.current=false;setSaving(false);}};

 useEffect(()=>{if(!validBrowserKey(key)||!target.current||mapRef.current)return;const imagery=new XYZ({urls:tiandituWmtsUrls(basemap==='vector'?'vec':'img',key),maxZoom:18,attributions:'© 国家地理信息公共服务平台 天地图'});imagery.on('tileloaderror',()=>setMessage('部分底图瓦片加载失败，请检查网络。'));const annotations=new XYZ({urls:tiandituWmtsUrls(basemap==='vector'?'cva':'cia',key),maxZoom:18});annotations.on('tileloaderror',()=>setMessage('部分注记瓦片加载失败。'));const referenceSource=new VectorSource<Feature>(),editSource=new VectorSource<Feature>();referenceSourceRef.current=referenceSource;editSourceRef.current=editSource;const refLayer=new VectorLayer({source:referenceSource,style:feature=>objectStyles(feature as Feature,mapRef.current?.getView().getZoom()??12,defaultVisibility)});const editLayer=new VectorLayer({source:editSource,style:()=>editStyle});const baseLayer=new TileLayer({source:imagery}),annoLayer=new TileLayer({source:annotations,visible:annotationsVisible});baseLayerRef.current=baseLayer;annoLayerRef.current=annoLayer;currentBasemapRef.current=basemap;const view=new View({center:fromLonLat(FARM_HOME_4326),zoom:12,minZoom:2,maxZoom:18});const map=new Map({target:target.current,layers:[baseLayer,annoLayer,refLayer,editLayer],view});mapRef.current=map;const el=target.current;el.dataset.viewCenter=view.getCenter()?.join(',')??'';el.dataset.viewResolution=String(view.getResolution()??'');el.dataset.basemap=basemap;const update=()=>{if(!el)return;el.dataset.viewCenter=view.getCenter()?.join(',')??'';el.dataset.viewResolution=String(view.getResolution()??'');};view.on('change:center',update);view.on('change:resolution',update);const observer=new ResizeObserver(()=>map.updateSize());observer.observe(target.current);return()=>{observer.disconnect();clearInteractions();map.setTarget(undefined);mapRef.current=null;baseLayerRef.current=null;annoLayerRef.current=null;referenceSourceRef.current=null;editSourceRef.current=null;};},[]);
 useEffect(()=>{const map=mapRef.current,base=baseLayerRef.current,anno=annoLayerRef.current,el=target.current;if(!map||!base||!anno)return;if(basemap!==currentBasemapRef.current){currentBasemapRef.current=basemap;const imagery=new XYZ({urls:tiandituWmtsUrls(basemap==='vector'?'vec':'img',key),maxZoom:18,attributions:'© 国家地理信息公共服务平台 天地图'});const annotations=new XYZ({urls:tiandituWmtsUrls(basemap==='vector'?'cva':'cia',key),maxZoom:18});base.setSource(imagery);anno.setSource(annotations);}anno.setVisible(annotationsVisible);if(el)el.dataset.basemap=basemap;},[basemap,annotationsVisible]);
 useEffect(()=>{const source=referenceSourceRef.current,map=mapRef.current;if(!source||!map||!overview.data)return;source.clear();const format=new GeoJSON();for(const item of overview.data.items){if(!item.geometry)continue;try{const features=format.readFeatures(item.geometry,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});for(const f of features){f.set('objectId',item.id);f.set('status',item.boundary_status);f.set('kind',item.kind);f.set('symbol',item.kind);source.addFeature(f);}}catch{/* 无效几何不绘制 */}}},[overview.data]);
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key!=='Escape'||event.isComposing||composingRef.current)return;if(layerPanelOpenRef.current){setLayerPanelOpen(false);return;}if(editorStateRef.current!=='idle')cancelEdit();};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 useEffect(()=>{if(initialSelectedRef.current||!initialObjectId||!editableObjects.length)return;const object=editableObjects.find(o=>o.id===initialObjectId);if(object){initialSelectedRef.current=true;selectObject(object);}},[initialObjectId,editableObjects]);
 useEffect(()=>{if(typeof window==='undefined')return;const params=new URLSearchParams(window.location.search);setReturnToOverview(params.get('from')==='farm-overview');},[]);
 useEffect(()=>{const onBeforeUnload=(e:BeforeUnloadEvent)=>{if(hasUnsavedChanges()){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',onBeforeUnload);return()=>window.removeEventListener('beforeunload',onBeforeUnload);},[]);

 const mapLabel=`地图编辑器 · ${basemap==='vector'?'矢量底图':'卫星底图'}`;
 return <section className={styles.page} aria-label="地图编辑器">
  <div className={styles.heading}><div><span className={styles.eyebrow}>MAP EDITOR · M2-A</span><h1>地图编辑</h1><p>在地图上绘制或修改农田、塘口边界，保存为正式边界版本。</p></div><div className={styles.headingActions}><Link href="/farm-overview">返回农场总览 ↗</Link><Link href="/objects">去对象台账新建 ↗</Link></div></div>
  {loading&&<p className={styles.loading} role="status">正在读取可编辑对象与权限…</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  <div className={`${styles.workspace} ${objectPanelOpen?styles.workspaceObjectOpen:''}`}>
   <aside className={`${styles.objectPanel} ${objectPanelOpen?styles.objectPanelOpen:''}`} aria-label="可编辑对象列表">
    <div className={styles.objectPanelHeader}><strong>可编辑对象</strong><button type="button" className={styles.mobileClose} onClick={()=>setObjectPanelOpen(false)} aria-label="关闭对象列表">×</button></div>
    <label className={styles.searchLabel}>搜索<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="名称或编号"/></label>
    {editableObjects.length===0&&<p className={styles.emptyNotice}>当前没有可编辑的农田或塘口。<br/>需要对象级“配置”权限才能在地图编辑器中登记边界。</p>}
    <ul className={styles.objectList}>{filtered.map(o=><li key={o.id}><button type="button" className={selectedId===o.id?styles.activeItem:styles.item} onClick={()=>selectObject(o)} aria-current={selectedId===o.id?'true':undefined}><span className={styles.itemName}>{o.name}</span><span className={styles.itemMeta}>{o.code} · {statusText[o.boundary_status]??o.boundary_status} · 版本 {o.version}</span></button></li>)}</ul>
   </aside>
   <div className={styles.mapShell}>
    <div className={styles.mapToolbar}><button type="button" className={styles.mobileObjectButton} onClick={()=>setObjectPanelOpen(true)}>☰ 选择对象</button><button type="button" className={styles.basemapButton} data-basemap={basemap} aria-label={basemap==='vector'?'切换为卫星底图':'切换为矢量底图'} onClick={()=>setBasemap(basemap==='vector'?'satellite':'vector')}>底图：{basemap==='vector'?'矢量':'卫星'}</button><button type="button" className={styles.layerButton} aria-expanded={layerPanelOpen} aria-controls="map-editor-layer-panel" onClick={()=>setLayerPanelOpen(v=>!v)}>图层</button>{selected&&editorState!=='idle'&&<><button type="button" onClick={redraw}>重新绘制</button><button type="button" onClick={cancelEdit}>取消编辑</button></>}<button type="button" onClick={()=>{const view=mapRef.current?.getView();if(view)view.animate({center:fromLonLat(FARM_HOME_4326),zoom:12,duration:300});}}>复位视图</button></div>
    {layerPanelOpen&&<div id="map-editor-layer-panel" className={styles.layerPanelWrap}><LayerPanel mode="real" basemap={basemap} setBasemap={setBasemap} annotationsVisible={annotationsVisible} setAnnotationsVisible={setAnnotationsVisible} visibility={defaultVisibility} setVisibility={()=>{}} onClose={()=>setLayerPanelOpen(false)} showCategories={false}/></div>}
    {validBrowserKey(key)?<div ref={target} className={styles.map} data-testid="map-editor-map" data-view-center="" data-view-resolution="" data-basemap={basemap} aria-label={mapLabel} role="application"/>:<div className={styles.mapFallback} role="status">当前环境未配置有效天地图 Key，无法加载地图影像。</div>}
    {(message||(savedReturn&&returnToOverview))&&<div className={styles.globalStack}>{message&&<p className={styles.globalMessage} role="status">{message}</p>}{savedReturn&&returnToOverview&&<p className={styles.globalMessage}><Link href="/farm-overview">返回农场总览 ↗</Link></p>}</div>}
    {editorState!=='idle'&&selected&&<form className={styles.editForm} data-testid="boundary-form" onSubmit={event=>{event.preventDefault();void onSave();}} onCompositionStart={()=>{composingRef.current=true;}} onCompositionEnd={()=>{composingRef.current=false;}}>
     <div className={styles.editFormHeader}><strong>{selected.name}</strong><span>{selected.code} · 版本 {selected.version}</span></div>
     <label>边界状态<select value={status} onChange={e=>setStatus(e.target.value as 'draft'|'verified')} disabled={!canReviewSelected}>{canReviewSelected?<><option value="draft">草稿</option><option value="verified">已核实</option></>:<><option value="draft">草稿</option></>}</select>{!canReviewSelected&&<small>当前账号无该对象的 review 权限，只能保存为草稿。</small>}</label>
     <label>来源和确认依据<textarea value={source} onChange={e=>setSource(e.target.value)} maxLength={2000} rows={4} placeholder="登记依据、确认人、测量方式等必填，≤2000 字" required/></label>
     <div className={styles.editActions}><button type="submit" disabled={saving||(needsRefresh&&!refreshedAfterConflict)}>{saving?'保存中…':'保存边界'}</button><button type="button" disabled={saving} onClick={cancelEdit}>取消</button>{needsRefresh&&!refreshedAfterConflict&&<button type="button" disabled={saving} onClick={()=>void refreshData()}>查看最新边界</button>}{needsRefresh&&refreshedAfterConflict&&<button type="button" disabled={saving} onClick={()=>void onSave()}>确认重新提交</button>}</div>
    </form>}
   </div>
  </div>
 </section>;
}

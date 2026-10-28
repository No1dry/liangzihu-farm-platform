'use client';

import {useEffect,useRef} from 'react';
import {CATEGORY_LABELS,CATEGORY_ORDER,demoLegend,realLegend} from './map-symbols';
import type {CadCategory} from './cad-reference-card';
import styles from './farm-overview.module.css';

const CAD_LABELS:Record<CadCategory,string>={land:'土地平整范围',road:'生产道路',canal:'农渠与排水沟'};
const CAD_COLORS:Record<CadCategory,string>={land:'#4b9e4b',road:'#e6a23c',canal:'#2f7cc7'};

type LayerPanelProps={mode:'real'|'demo';basemap:'vector'|'satellite';setBasemap:(b:'vector'|'satellite')=>void;annotationsVisible:boolean;setAnnotationsVisible:(v:boolean)=>void;visibility:Record<string,boolean>;setVisibility:(kind:string,visible:boolean)=>void;onClose:()=>void;showCategories?:boolean;cadVisibility?:Record<CadCategory,boolean>;setCadVisibility?:(cat:CadCategory,visible:boolean)=>void;};

export default function LayerPanel({mode,basemap,setBasemap,annotationsVisible,setAnnotationsVisible,visibility,setVisibility,onClose,showCategories=true,cadVisibility,setCadVisibility}:LayerPanelProps){
 const panelRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);},[onClose]);
 const basemapLabel=basemap==='vector'?'矢量底图':'卫星底图';
 const legend=mode==='demo'?demoLegend:realLegend;
 const cadAvailable=!!cadVisibility&&!!setCadVisibility;
 return <div ref={panelRef} className={styles.layerPanel} role="dialog" aria-modal="false" aria-label="地图图层设置"><div className={styles.layerPanelHeader}><strong>图层</strong><button type="button" onClick={onClose} aria-label="关闭图层设置">×</button></div>
  <fieldset className={styles.layerSection}><legend>底图</legend><label><input type="radio" name="basemap" value="vector" checked={basemap==='vector'} onChange={()=>setBasemap('vector')}/> 矢量底图</label><label><input type="radio" name="basemap" value="satellite" checked={basemap==='satellite'} onChange={()=>setBasemap('satellite')}/> 卫星底图</label></fieldset>
  <div className={styles.layerSection}><label className={styles.layerToggle}><input type="checkbox" checked={annotationsVisible} onChange={event=>setAnnotationsVisible(event.target.checked)}/> 显示注记（{basemapLabel}）</label></div>
  {showCategories&&<fieldset className={styles.layerSection}><legend>业务类别</legend>{CATEGORY_ORDER.map(kind=><label key={kind} className={styles.layerToggle}><input type="checkbox" checked={visibility[kind]!==false} onChange={event=>setVisibility(kind,event.target.checked)}/> {CATEGORY_LABELS[kind]}</label>)}</fieldset>}
  {cadAvailable&&<fieldset className={styles.layerSection}><legend>竣工图参考（真实 CAD，未建档）</legend><p className={styles.cadLegendNote}>真实 CAD 参考、非正式农业资产</p>{(['land','road','canal'] as CadCategory[]).map(cat=><label key={cat} className={styles.layerToggle}><input type="checkbox" checked={cadVisibility![cat]!==false} onChange={event=>setCadVisibility!(cat,event.target.checked)}/> <i className={styles.legendSolid} style={{'--legend-color':CAD_COLORS[cat]} as React.CSSProperties}/> {CAD_LABELS[cat]}</label>)}</fieldset>}
  <div className={styles.layerSection}><strong className={styles.legendTitle}>图例</strong><div className={styles.legendList}>{legend.map(item=><span key={item.key} className={styles.legendItem}><i className={item.dashed?styles.legendDashed:styles.legendSolid} style={{'--legend-color':item.color} as React.CSSProperties}/> {item.label}</span>)}</div></div>
 </div>;
}

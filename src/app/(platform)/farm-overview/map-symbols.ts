import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import Icon from 'ol/style/Icon.js';
import type Feature from 'ol/Feature.js';
import type {FeatureLike} from 'ol/Feature.js';
import type Polygon from 'ol/geom/Polygon.js';

export type ObjectKind='field'|'pond'|'channel'|'facility'|'mobile';
export type BoundaryStatus='verified'|'draft'|'unknown';

export const CATEGORY_ORDER:ObjectKind[]=['field','pond','channel','facility','mobile'];
export const CATEGORY_LABELS:Record<ObjectKind,string>={field:'农田',pond:'塘口',channel:'渠道',facility:'固定设施',mobile:'机动设备'};

export const SYMBOL_LABELS:Record<string,string>={field:'田',pond:'塘',gate:'闸',pump:'泵',monitor:'测',drone:'飞',harvester:'机'};

const COLORS:Record<ObjectKind,{fill:string;stroke:string;icon:string;width:number}>={
 field:{fill:'rgba(75,112,45,.24)',stroke:'#4b7045',icon:'#5d822b',width:2.5},
 pond:{fill:'rgba(44,122,164,.22)',stroke:'#2c7aa4',icon:'#167ca4',width:2.5},
 channel:{fill:'rgba(63,143,138,0)',stroke:'#3f8f8a',icon:'#2f8a84',width:3},
 facility:{fill:'rgba(199,109,30,0)',stroke:'#c76d1e',icon:'#c76d1e',width:2.5},
 mobile:{fill:'rgba(142,77,168,0)',stroke:'#8e4da8',icon:'#8e4da8',width:2.5},
};

export function colorForKind(kind:string){return COLORS[kind as ObjectKind]??COLORS.field;}

export function iconLabel(symbol?:string|null,kind?:string|null):string{
 return SYMBOL_LABELS[symbol??'']??(kind==='facility'?'设施':kind==='mobile'?'机':SYMBOL_LABELS[kind??'']??'●');
}

export function iconSvg(label:string,color:string,selected=false):string{
 const size=selected?46:40,r=selected?20:17,sw=selected?4:3,font=selected?21:19,y=selected?29:26;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${color}" stroke="white" stroke-width="${sw}"/><text x="${size/2}" y="${y}" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="${font}">${label}</text></svg>`;
}

// 设施图形图标：水闸/泵站/蓄水池用图案代替文字圆点；编号前缀映射仅是展示层约定，待设施子类字段落地后替换。
const PICTOGRAMS:Record<string,{color:string;body:string}>={
 gate:{color:'#2f6fb2',body:'<rect x="12" y="11" width="16" height="3.5" rx="1"/><rect x="13.5" y="14.5" width="3" height="13"/><rect x="23.5" y="14.5" width="3" height="13"/><rect x="17.5" y="16" width="5" height="8"/><path d="M11 29.5q2.2-2 4.5 0t4.5 0t4.5 0t4.5 0" fill="none" stroke="#fff" stroke-width="1.6"/>'},
 pump:{color:'#8e4da8',body:'<circle cx="20" cy="20" r="8" fill="none" stroke="#fff" stroke-width="2"/><path d="M20 20V13.5M20 20l5.8 3.4M20 20l-5.8 3.4" stroke="#fff" stroke-width="2" fill="none"/><circle cx="20" cy="20" r="1.8"/>'},
 storage:{color:'#0f8b8d',body:'<path d="M12 15h16v8.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 12 23.5z" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M14.5 20q1.4-1.4 2.8 0t2.9 0t2.9 0t2.9 0" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M14.5 23.5q1.4-1.4 2.8 0t2.9 0t2.9 0t2.9 0" fill="none" stroke="#fff" stroke-width="1.5"/>'},
};
const CODE_SYMBOLS:Record<string,string>={SZ:'gate',BZ:'pump',XSC:'storage'};
export function facilitySymbolFromCode(code?:string|null):string|undefined{
 const match=code?.match(/-(SZ|BZ|XSC)\d{2}$/);
 return match?CODE_SYMBOLS[match[1]]:undefined;
}

export function pictogramSvg(symbol:string,selected=false):string|null{
 const pic=PICTOGRAMS[symbol];
 if(!pic)return null;
 const size=selected?46:40,r=selected?20:17,sw=selected?4:3,scale=size/40;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${pic.color}" stroke="white" stroke-width="${sw}"/><g fill="#fff" transform="translate(${(size-40)/2},${(size-40)/2}) scale(${scale})">${pic.body}</g></svg>`;
}

function geometryForIcon(feature:FeatureLike){
 const geometry=(feature as Feature).getGeometry();
 return geometry?.getType()==='Polygon'?(geometry as Polygon).getInteriorPoint():geometry;
}

export function iconStyle(label:string,color:string,selected=false):Style{
 return new Style({image:new Icon({src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(iconSvg(label,color,selected)),anchor:[.5,.5],scale:selected?1:.85}),geometry:geometryForIcon});
}

// 点位图标：水闸/泵站/蓄水池用图形图标，其余沿用文字圆点。
function pointIcon(feature:Feature,color:string,selected=false):Style{
 const symbol=feature.get('symbol') as string|undefined;
 const pictogram=symbol?pictogramSvg(symbol,selected):null;
 const src=pictogram??iconSvg(iconLabel(symbol,feature.get('kind') as string|undefined),color,selected);
 return new Style({image:new Icon({src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(src),anchor:[.5,.5],scale:selected?1:.85}),geometry:geometryForIcon});
}

export function objectStyles(feature:Feature,zoom:number,visible:Record<string,boolean>):Style[]|undefined{
 const kind=feature.get('kind') as string;
 if(visible[kind]===false)return undefined;
 if(kind==='facility'&&zoom<13)return undefined;
 const status=feature.get('status') as BoundaryStatus|string|undefined;
 const draft=(status??'draft')!=='verified';
 const colors=colorForKind(kind);
 const geometry=feature.getGeometry();
 if(!geometry)return undefined;
 if(geometry.getType()==='Point')return [pointIcon(feature,colors.icon)];
 const lineDash=draft?[8,5]:undefined;
 return [new Style({stroke:new Stroke({color:'#fff',width:colors.width+3})}),new Style({stroke:new Stroke({color:colors.stroke,width:colors.width,lineDash}),fill:new Fill({color:colors.fill})})];
}

export function selectedStyles(feature:Feature):Style[]{
 const kind=feature.get('kind') as string;
 const colors=colorForKind(kind);
 const geometry=feature.getGeometry();
 if(geometry?.getType()==='Point')return [pointIcon(feature,colors.icon,true)];
 return [new Style({stroke:new Stroke({color:'#fff',width:6}),fill:new Fill({color:'rgba(146,195,49,.42)'})}),new Style({stroke:new Stroke({color:colors.stroke,width:3})})];
}

const demoAreaStyle=new Style({stroke:new Stroke({color:'#1b7095',width:3,lineDash:[8,6]}),fill:new Fill({color:'rgba(48,142,177,.21)'})});
const demoSelectedAreaStyle=new Style({stroke:new Stroke({color:'#fff',width:4,lineDash:[8,5]}),fill:new Fill({color:'rgba(52,160,190,.4)'})});

export function demoStyles(feature:Feature,visible:Record<string,boolean>,selected:boolean):Style[]|undefined{
 const kind=feature.get('kind') as string;
 if(visible[kind]===false)return undefined;
 const colors=colorForKind(kind);
 const geometry=feature.getGeometry();
 if(!geometry)return undefined;
 const label=iconLabel(feature.get('symbol') as string|undefined,kind);
 if(geometry.getType()==='Point')return [pointIcon(feature,colors.icon,selected)];
 return [selected?demoSelectedAreaStyle:demoAreaStyle,pointIcon(feature,colors.icon,selected)];
}

export const realLegend=[
 {key:'field',label:'农田',color:COLORS.field.stroke},
 {key:'pond',label:'塘口',color:COLORS.pond.stroke},
 {key:'channel',label:'渠道',color:COLORS.channel.stroke},
 {key:'facility',label:'固定设施',color:COLORS.facility.stroke},
 {key:'mobile',label:'机动设备',color:COLORS.mobile.stroke},
 {key:'verified',label:'已核实边界',color:'#4b7045',dashed:false},
 {key:'draft',label:'边界草稿',color:'#4b7045',dashed:true},
];

export const demoLegend=[
 {key:'demo-area',label:'演示区域（非测绘边界）',color:'#1b7095',dashed:true},
 {key:'demo-point',label:'演示设备位置并非 GPS',color:'#8e4da8',dashed:false},
];

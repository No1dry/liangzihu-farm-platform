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

function geometryForIcon(feature:FeatureLike){
 const geometry=(feature as Feature).getGeometry();
 return geometry?.getType()==='Polygon'?(geometry as Polygon).getInteriorPoint():geometry;
}

export function iconStyle(label:string,color:string,selected=false):Style{
 return new Style({image:new Icon({src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(iconSvg(label,color,selected)),anchor:[.5,.5],scale:selected?1:.85}),geometry:geometryForIcon});
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
 if(geometry.getType()==='Point')return [iconStyle(iconLabel(feature.get('symbol') as string|undefined,kind),colors.icon)];
 const lineDash=draft?[8,5]:undefined;
 return [new Style({stroke:new Stroke({color:'#fff',width:colors.width+3})}),new Style({stroke:new Stroke({color:colors.stroke,width:colors.width,lineDash}),fill:new Fill({color:colors.fill})})];
}

export function selectedStyles(feature:Feature):Style[]{
 const kind=feature.get('kind') as string;
 const colors=colorForKind(kind);
 const geometry=feature.getGeometry();
 if(geometry?.getType()==='Point')return [iconStyle(iconLabel(feature.get('symbol') as string|undefined,kind),colors.icon,true)];
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
 if(geometry.getType()==='Point')return [iconStyle(label,colors.icon,selected)];
 return [selected?demoSelectedAreaStyle:demoAreaStyle,iconStyle(label,colors.icon,selected)];
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

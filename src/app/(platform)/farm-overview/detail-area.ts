// F04 面积口径：由对象已登记边界（EPSG:4326 GeoJSON）按椭球面计算管理范围面积。
// 与 CAD 竣工图施工参考面积严格分开：这里只用正式对象的登记边界，不引用 CAD 图层数据。
import {getArea} from 'ol/sphere.js';
import GeoJSON from 'ol/format/GeoJSON.js';

export function boundaryAreaSqm(geometry:unknown):number|null{
  if(!geometry||typeof geometry!=='object')return null;
  try{
    const geom=new GeoJSON().readGeometry(geometry as Parameters<GeoJSON['readGeometry']>[0],{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});
    if(!geom)return null;
    const area=getArea(geom,{projection:'EPSG:3857'});
    return Number.isFinite(area)&&area>0?area:null;
  }catch{return null;}
}

// 亩为主、㎡为辅；大数值收敛小数位，避免把计算精度伪装成测绘精度。
export function formatArea(sqm:number|null):{mu:string;sqm:string}|null{
  if(sqm===null||!(sqm>0))return null;
  const mu=sqm/666.6667;
  return{
    mu:`${mu>=100?Math.round(mu):mu.toFixed(1)} 亩`,
    sqm:sqm>=10000?`约 ${(sqm/10000).toFixed(1)} 万㎡`:`约 ${Math.round(sqm)} ㎡`,
  };
}

// R01 面积口径：CAD 竣工图施工范围只能标「竣工图施工参考面积」，不得称管理范围；
// 只有登记边界（已核实或草稿）的对象才显示管理范围面积并随核实状态注明。
export function areaPresentation(item:{code:string;boundary_status:string}):{label:string;note:string}{
  if(item.code.startsWith('CAD-'))return{label:'竣工图施工参考面积',note:'来自 CAD 竣工图施工范围，尚未核实为正式管理范围边界'};
  if(item.boundary_status==='verified')return{label:'管理范围面积',note:'按已核实登记边界计算'};
  return{label:'管理范围面积',note:'按草稿边界计算，尚未核实；与 CAD 竣工图施工参考面积是不同口径'};
}

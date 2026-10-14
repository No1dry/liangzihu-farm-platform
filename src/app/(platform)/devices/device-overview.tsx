'use client';
import {useEffect} from 'react';
import {useApi} from '@/components/platform/use-api';
import styles from './devices.module.css';
type Device={id:string;name:string;kind:string;model:string|null;external_id:string;verified:boolean;parent_device_id:string|null;object_name:string};
type Point={id:string;code:string;name:string;device_id:string;metric:string;unit:string};
type Current={pointId:string;current:{value:number|null;unit:string|null;quality:string|null;sampledAt:string|null;reasons:string[]|null}|null};
const qualityLabel:Record<string,string>={valid:'有效',suspect:'可疑',invalid:'无效'};
const qualityDot:Record<string,string>={valid:styles.dotValid,suspect:styles.dotSuspect,invalid:styles.dotInvalid};
export default function DeviceOverview({refreshKey=0}:{refreshKey?:number}){
 const devices=useApi<{items:Device[]}>('/api/v1/devices?limit=200'),points=useApi<Point[]>('/api/v1/points'),current=useApi<Current[]>('/api/v1/points/current');
 useEffect(()=>{if(refreshKey>0){void devices.reload();void points.reload();void current.reload();}},[refreshKey,devices.reload,points.reload,current.reload]);
 const error=devices.error||points.error||current.error;
 if(error)return <div className={`empty-state ${styles.overviewError}`}><p className="form-error" role="alert">{error}</p><button className="secondary" onClick={()=>{void devices.reload();void points.reload();void current.reload();}}>重试读取</button></div>;
 if(devices.loading||points.loading||current.loading)return <p className="loading-state" role="status">正在加载…</p>;
 const list=(devices.data?.items??[]).filter(d=>d.kind==='physical'),byDevice=new Map<string,Point[]>();
 for(const p of points.data??[])byDevice.set(p.device_id,[...byDevice.get(p.device_id)??[],p]);
 const currentByPoint=new Map((current.data??[]).map(c=>[c.pointId,c.current]));
 if(!list.length)return <p className="empty-state">当前没有已授权的物理设备。可由管理员在上方登记区建档并授权。</p>;
 return <div className={styles.cards}>{list.map(d=>{const devicePoints=byDevice.get(d.id)??[];return <article key={d.id} className={styles.card}>
  <div className={styles.cardHead}><div><h3>{d.name}</h3><p className={styles.meta}>{[d.model,`厂家编号 ${d.external_id}`].filter(Boolean).join(' · ')}</p></div><span className={`${styles.badge} ${d.verified?styles.badgeOk:''}`}>{d.verified?'已核实':'待核实'}</span></div>
  {devicePoints.length?<div className={`table-wrap ${styles.points}`}><table><thead><tr><th scope="col">名称</th><th scope="col">最新值</th><th scope="col">质量</th><th scope="col">采样时间</th><th scope="col">历史</th></tr></thead><tbody>{devicePoints.map(p=>{const c=currentByPoint.get(p.id)??null,q=c?.quality??'';return <tr key={p.id}>
   <td data-label="名称">{p.name}</td>
   <td data-label="最新值" className={styles.value}>{c&&c.value!==null?`${c.value} ${c.unit??p.unit}`:'暂无数据'}</td>
   <td data-label="质量">{q?<><span className={`${styles.dot} ${qualityDot[q]??styles.dotNone}`}/>{qualityLabel[q]??q}</>:<><span className={`${styles.dot} ${styles.dotNone}`}/>暂无数据</>}</td>
   <td data-label="采样时间">{c?.sampledAt?new Date(c.sampledAt).toLocaleString('zh-CN'):'—'}</td>
   <td data-label="历史"><a className={styles.history} href={'/points/'+encodeURIComponent(p.id)}>查看历史</a></td>
  </tr>;})}</tbody></table></div>:<p className="hint">该设备尚未登记测点。</p>}
 </article>;})}</div>;
}

'use client';

// F03 详情只读数据钩子：测点清单 + 批量当前值两个数据源合成一个测量分区，
// 告警随对象接口返回。请求带对象作用域：切换对象后旧响应直接丢弃，不污染新对象。
// R01 补丁：返回状态与 objectId 严格绑定（bindStateToObject），切换瞬间的首次渲染不会展示旧对象数据。
import {useCallback,useEffect,useRef,useState} from 'react';
import {buildPointViews,mapAlerts,sectionState,type AlertView,type ApiAlert,type ApiBatch,type ApiCurrentRow,type ApiPoint,type PointView,type SectionRequestState,type SourceStatus} from './detail-data';

type DetailState={objectId:string|null;points:ApiPoint[];current:ApiCurrentRow[]|null;alerts:ApiAlert[];batches:ApiBatch[];pointsSource:SourceStatus;currentSource:SourceStatus;alertsSource:SourceStatus;batchSource:SourceStatus;version:number};
const idle:DetailState={objectId:null,points:[],current:null,alerts:[],batches:[],pointsSource:'loading',currentSource:'loading',alertsSource:'loading',batchSource:'loading',version:0};

// 纯函数：仅当状态属于当前对象时才放行展示，否则返回空数据 + 加载态。
export function bindStateToObject(state:DetailState,objectId:string|null):DetailState{
  if(state.objectId===objectId)return state;
  return {...state,points:[],current:null,alerts:[],batches:[],pointsSource:'loading',currentSource:'loading',alertsSource:'loading',batchSource:'loading'};
}

async function fetchJson(url:string):Promise<{ok:boolean;denied:boolean;data:unknown}>{
  try{
    const res=await fetch(url,{headers:{'Accept':'application/json'}});
    if(res.status===403||res.status===401)return{ok:false,denied:true,data:null};
    if(!res.ok)return{ok:false,denied:false,data:null};
    return{ok:true,denied:false,data:await res.json()};
  }catch{return{ok:false,denied:false,data:null};}
}

export function useObjectDetail(objectId:string|null,enabled:boolean){
  const [state,setState]=useState<DetailState>(idle);
  const requestRef=useRef(0);

  const load=useCallback(async(id:string,version:number)=>{
    const requestId=++requestRef.current;
    // R01：新对象加载期间清空旧对象的测点/批次/告警，避免残留展示。
    setState({objectId:id,points:[],current:null,alerts:[],batches:[],pointsSource:'loading',currentSource:'loading',alertsSource:'loading',batchSource:'loading',version});
    const [detail,current,batches]=await Promise.all([
      fetchJson(`/api/v1/objects/${id}`),
      fetchJson('/api/v1/points/current'),
      fetchJson('/api/v1/batches'),
    ]);
    if(requestRef.current!==requestId)return; // 对象已切换，丢弃旧响应
    const detailOk=detail.ok&&!detail.denied,currentOk=current.ok&&!current.denied,batchOk=batches.ok&&!batches.denied;
    const detailData=(detail.data??{}) as {points?:ApiPoint[];alerts?:ApiAlert[]};
    setState({
      objectId:id,
      points:detailOk&&Array.isArray(detailData.points)?detailData.points:[],
      current:currentOk&&Array.isArray(current.data)?current.data as ApiCurrentRow[]:null,
      alerts:detailOk&&Array.isArray(detailData.alerts)?detailData.alerts:[],
      batches:batchOk&&Array.isArray(batches.data)?batches.data as ApiBatch[]:[],
      pointsSource:detail.denied?'denied':detailOk?'ok':'fail',
      currentSource:current.denied?'denied':currentOk?'ok':'fail',
      alertsSource:detail.denied?'denied':detailOk?'ok':'fail',
      batchSource:batches.denied?'denied':batchOk?'ok':'fail',
      version,
    });
  },[]);

  useEffect(()=>{
    if(!objectId||!enabled){requestRef.current++;setState(prev=>({...prev,objectId:null}));return;}
    void load(objectId,requestRef.current+1);
  },[objectId,enabled,load]);

  const retry=useCallback(()=>{if(objectId&&enabled)void load(objectId,requestRef.current+1);},[objectId,enabled,load]);

  const bound=enabled?bindStateToObject(state,objectId):bindStateToObject(state,null);
  const measurementState=sectionState(bound.pointsSource,bound.currentSource);
  const alertState:SectionRequestState=bound.alertsSource==='loading'?'loading':bound.alertsSource==='denied'?'denied':bound.alertsSource==='ok'?'ready':'error';
  const batchState:SectionRequestState=bound.batchSource==='loading'?'loading':bound.batchSource==='denied'?'denied':bound.batchSource==='ok'?'ready':'error';
  const pointViews=buildPointViews(bound.points,bound.current);
  const alertViews=mapAlerts(bound.alerts);
  const batches=bound.batches;
  return {measurementState,pointViews,alertState,alertViews,batchState,batches,retry};
}

export type {PointView,AlertView,SectionRequestState,DetailState};

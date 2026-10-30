'use client';

// F03 详情只读数据钩子：测点清单 + 批量当前值两个数据源合成一个测量分区，
// 告警随对象接口返回。请求带对象作用域：切换对象后旧响应直接丢弃，不污染新对象。
import {useCallback,useEffect,useRef,useState} from 'react';
import {buildPointViews,mapAlerts,sectionState,type AlertView,type ApiAlert,type ApiBatch,type ApiCurrentRow,type ApiPoint,type PointView,type SectionRequestState,type SourceStatus} from './detail-data';

type DetailState={points:ApiPoint[];current:ApiCurrentRow[]|null;alerts:ApiAlert[];batches:ApiBatch[];pointsSource:SourceStatus;currentSource:SourceStatus;alertsSource:SourceStatus;batchSource:SourceStatus;version:number};
const idle:DetailState={points:[],current:null,alerts:[],batches:[],pointsSource:'loading',currentSource:'loading',alertsSource:'loading',batchSource:'loading',version:0};

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
    setState({points:[],current:null,alerts:[],batches:[],pointsSource:'loading',currentSource:'loading',alertsSource:'loading',batchSource:'loading',version});
    const [detail,current,batches]=await Promise.all([
      fetchJson(`/api/v1/objects/${id}`),
      fetchJson('/api/v1/points/current'),
      fetchJson('/api/v1/batches'),
    ]);
    if(requestRef.current!==requestId)return; // 对象已切换，丢弃旧响应
    const detailOk=detail.ok&&!detail.denied,currentOk=current.ok&&!current.denied,batchOk=batches.ok&&!batches.denied;
    const detailData=(detail.data??{}) as {points?:ApiPoint[];alerts?:ApiAlert[]};
    setState({
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
    if(!objectId||!enabled){requestRef.current++;setState(idle);return;}
    void load(objectId,requestRef.current+1);
  },[objectId,enabled,load]);

  const retry=useCallback(()=>{if(objectId&&enabled)void load(objectId,requestRef.current+1);},[objectId,enabled,load]);

  const measurementState=sectionState(state.pointsSource,state.currentSource);
  const alertState:SectionRequestState=state.alertsSource==='loading'?'loading':state.alertsSource==='denied'?'denied':state.alertsSource==='ok'?'ready':'error';
  const batchState:SectionRequestState=state.batchSource==='loading'?'loading':state.batchSource==='denied'?'denied':state.batchSource==='ok'?'ready':'error';
  const pointViews=buildPointViews(state.points,state.current);
  const alertViews=mapAlerts(state.alerts);
  const batches=state.batches;
  return {measurementState,pointViews,alertState,alertViews,batchState,batches,retry};
}

export type {PointView,AlertView,SectionRequestState};

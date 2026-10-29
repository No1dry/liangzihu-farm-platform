'use client';

// F07 单测点历史趋势钩子：24h/7d 窗口按需读取，请求带测点+窗口作用域，旧响应不污染新展开。
import {useCallback,useEffect,useRef,useState} from 'react';
import {toTrendPoints,type ReadingRow,type TrendPoint} from './detail-data';

export type TrendWindow='24h'|'7d';
type HistoryPayload={point?:{unit?:string;maxGapMs?:number|null;timingSource?:string|null};items?:ReadingRow[]};
export type TrendState={status:'idle'|'loading'|'ready'|'error'|'denied'|'empty';points:TrendPoint[];unit:string;maxGapMs:number|null};

const idleState:TrendState={status:'idle',points:[],unit:'',maxGapMs:null};
const windowMs:Record<TrendWindow,number>={'24h':86400_000,'7d':7*86400_000};

export function usePointHistory(pointId:string|null,win:TrendWindow){
  const [state,setState]=useState<TrendState>(idleState);
  const requestRef=useRef(0);

  const load=useCallback(async(id:string,window:TrendWindow)=>{
    const requestId=++requestRef.current;
    setState(prev=>({...prev,status:'loading'}));
    const to=new Date(),from=new Date(to.getTime()-windowMs[window]);
    try{
      const res=await fetch(`/api/v1/points/${id}/readings?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&limit=500`,{headers:{'Accept':'application/json'}});
      if(requestRef.current!==requestId)return;
      if(res.status===401||res.status===403||res.status===404){setState({...idleState,status:'denied'});return;}
      if(!res.ok){setState({...idleState,status:'error'});return;}
      const data=await res.json() as HistoryPayload;
      const unit=data.point?.unit??'',rows=Array.isArray(data.items)?data.items:[];
      setState({status:rows.length?'ready':'empty',points:toTrendPoints(rows,unit),unit,maxGapMs:data.point?.maxGapMs??null});
    }catch{if(requestRef.current===requestId)setState({...idleState,status:'error'});}
  },[]);

  useEffect(()=>{
    if(!pointId){requestRef.current++;setState(idleState);return;}
    void load(pointId,win);
  },[pointId,win,load]);

  const retry=useCallback(()=>{if(pointId)void load(pointId,win);},[pointId,win,load]);
  return {...state,retry};
}

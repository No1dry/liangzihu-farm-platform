'use client';

import { useEffect,useMemo,useRef,useState, type FormEvent } from 'react';
import RegionManagement from './region-management';
import { useApi } from '@/components/platform/use-api';
import styles from './farm-overview.module.css';

type Region={id:string;farmId:string;name:string;version:number;archivedAt:string|null;links:{objectId:string}[]};
type ConfigItem={id:string;name:string;code:string;kind:string;version:number;archived_at:string|null};
type View='new-village'|'new-object'|'change-region'|'region-maintenance'|'recycle-bin';
type SavedResult={view:View;id:string;drawNow?:boolean};

const kindLabels:Record<string,string>={field:'农田',pond:'塘口',facility:'固定设施'};

const pinyinMap:Record<string,string>={
  隔:'ge',离:'li',沙:'sha',湾:'wan',长:'chang',岭:'ling',湖:'hu',东:'dong',
  梁:'liang',子:'zi',智:'zhi',慧:'hui',农:'nong',业:'ye',空:'kong',间:'jian',
  管:'guan',理:'li',平:'ping',台:'tai',合:'he',成:'cheng',测:'ce',试:'shi',
  验:'yan',收:'shou',新:'xin',增:'zeng',村:'cun',庄:'zhuang',田:'tian',塘:'tang',
  口:'kou',设:'she',施:'shi',水:'shui',闸:'zha',泵:'beng',机:'ji',动:'dong',
  备:'bei',大:'da',小:'xiao',南:'nan',北:'bei',西:'xi',中:'zhong',上:'shang',
  下:'xia',左:'zuo',右:'you',内:'nei',外:'wai',前:'qian',后:'hou',边:'bian',
  区:'qu',片:'pian',组:'zu',队:'dui',园:'yuan',林:'lin',草:'cao',木:'mu',
  山:'shan',河:'he',江:'jiang',海:'hai',沟:'gou',渠:'qu',堰:'yan',坝:'ba',
  堤:'di',库:'ku',池:'chi',井:'jing',泉:'quan',洞:'dong',房:'fang',屋:'wu',
  楼:'lou',棚:'peng',舍:'she',圈:'juan',栏:'lan',网:'wang',场:'chang',站:'zhan',
  点:'dian',位:'wei',部:'bu',局:'ju',处:'chu',室:'shi',科:'ke',系:'xi',班:'ban',
  排:'pai',连:'lian',营:'ying',团:'tuan',师:'shi',军:'jun',警:'jing',民:'min',
  公:'gong',司:'si',厂:'chang',店:'dian',铺:'pu',市:'shi',县:'xian',镇:'zhen',
  乡:'xiang',街:'jie',路:'lu',巷:'xiang',桥:'qiao',门:'men',户:'hu',姓:'xing',
  名:'ming',文:'wen',字:'zi',数:'shu',码:'ma',信:'xin',息:'xi',图:'tu',画:'hua',
  像:'xiang',影:'ying',声:'sheng',光:'guang',电:'dian',气:'qi',暖:'nuan',冷:'leng',
  热:'re',风:'feng',雨:'yu',雪:'xue',霜:'shuang',雾:'wu',云:'yun',雷:'lei',
  晴:'qing',阴:'yin',旱:'han',涝:'lao',演:'yan',示:'shi',范:'fan',综:'zong',
  观:'guan',察:'cha',调:'diao',研:'yan',统:'tong',计:'ji',分:'fen',析:'xi',
  报:'bao',表:'biao',单:'dan',据:'ju',录:'lu',档:'dang',案:'an',审:'shen',
  批:'pi',核:'he',准:'zhun',确:'que',认:'ren',证:'zheng',明:'ming',查:'cha',
  看:'kan',见:'jian',听:'ting',说:'shuo',读:'du',写:'xie',打:'da',印:'yin',
  发:'fa',送:'song',接:'jie',转:'zhuan',换:'huan',更:'geng',
  代:'dai',补:'bu',修:'xiu',改:'gai',删:'shan',添:'tian',
  加:'jia',减:'jian',乘:'cheng',等:'deng',于:'yu',约:'yue',
};

function pinyinPrefix(name:string):string{
  const first=name.trim().charAt(0);
  if(!first)return 'obj';
  if(pinyinMap[first])return pinyinMap[first];
  const latin=first.toLowerCase();
  if(/[a-z0-9]/.test(latin))return latin;
  return 'cun';
}

function suggestCode(name:string,existing:string[]):string{
  const prefix=pinyinPrefix(name);
  let n=1;
  while(existing.some(code=>code.toLowerCase()===`${prefix}-${n}`))n++;
  return `${prefix}-${n}`;
}

export default function ManagementDrawer({view,onClose,onSaved,regions,configurable,allConfigurable,defaultRegionId,objectId,objectFarmId,currentRegionId,mode,demoReadOnly,onSwitchMode}:{view:View|null;onClose:()=>void;onSaved:(result:SavedResult)=>void;regions:Region[];configurable:ConfigItem[];allConfigurable:ConfigItem[];defaultRegionId?:string;objectId?:string;objectFarmId?:string;currentRegionId?:string;mode:'real'|'demo';demoReadOnly?:boolean;onSwitchMode?:()=>void}){
  const farms=useMemo(()=>configurable.filter(i=>i.kind==='farm'&&!i.archived_at),[configurable]);
  const manageableRegionIds=useMemo(()=>new Set(regions.filter(r=>farms.some(f=>f.id===r.farmId)).map(r=>r.id)),[regions,farms]);
  const title=view==='new-village'?'新增村庄':view==='new-object'?'新增农业对象':view==='change-region'?'更改所属村庄':view==='recycle-bin'?'回收站':'维护村庄与关联';
  return <aside className={styles.managementDrawer} aria-label={title} aria-live="polite">
    <div className={styles.drawerTop}><span className={styles.eyebrow}>{mode==='demo'?'DEMO · READ-ONLY':'MANAGEMENT'}</span><button type="button" onClick={onClose} aria-label={`关闭${title}`}>×</button></div>
    <h2>{title}</h2>
    {mode==='demo'||demoReadOnly?<div className={styles.drawerHint}><p>当前是只读演示，新增与修改功能不可用。</p>{onSwitchMode&&<button type="button" onClick={onSwitchMode}>退出演示并登记真实资料 ↗</button>}</div>:view==='region-maintenance'?<RegionMaintenancePanel regions={regions} onSaved={()=>onSaved({view:'region-maintenance',id:''})} configurable={configurable}/>:view==='recycle-bin'?<RecycleBinPanel allConfigurable={allConfigurable} onSaved={()=>onSaved({view:'recycle-bin',id:''})}/>:<ManagementForm key={view+ (objectId??'') + (defaultRegionId??'')} view={view} regions={regions.filter(r=>manageableRegionIds.has(r.id))} farms={farms} configurable={configurable} defaultRegionId={defaultRegionId} objectId={objectId} objectFarmId={objectFarmId} currentRegionId={currentRegionId} onSaved={onSaved} onClose={onClose}/>}
  </aside>;
}

function RegionMaintenancePanel({regions,onSaved,configurable}:{regions:Region[];onSaved:()=>void;configurable:ConfigItem[]}){
  const [openSignal,setOpenSignal]=useState(0);
  return <><p className={styles.drawerHint}>在此维护村庄名称、归档、对象关联；关联历史会保留。</p>
    <RegionManagement regions={regions} onSaved={()=>{setOpenSignal(v=>v+1);onSaved();}} openSignal={openSignal}/>
    <p className={styles.drawerHint}>仅显示你有配置权的农场与对象。需要为其他农场授权，请去对象台账调整。</p>
  </>;
}

function ManagementForm({view,regions,farms,configurable,defaultRegionId,objectId,objectFarmId,currentRegionId,onSaved,onClose}:{view:View|null;regions:Region[];farms:ConfigItem[];configurable:ConfigItem[];defaultRegionId?:string;objectId?:string;objectFarmId?:string;currentRegionId?:string;onSaved:(result:SavedResult)=>void;onClose:()=>void}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [partialObjectId,setPartialObjectId]=useState<string|null>(null);
  const [partialDrawNow,setPartialDrawNow]=useState(false);
  const [codeDirty,setCodeDirty]=useState(false);

  const regionSelect=regions.filter(r=>!r.archivedAt);
  const objectFarm=farms.find(f=>f.id===objectFarmId);
  const sameFarmRegions=objectFarm?regions.filter(r=>r.farmId===objectFarm.id&&!r.archivedAt):regionSelect;

  const [villageFarmId,setVillageFarmId]=useState(farms[0]?.id??'');
  const [villageName,setVillageName]=useState('');
  const [villageSource,setVillageSource]=useState('');

  const [kind,setKind]=useState<'field'|'pond'|'facility'>('field');
  const [regionId,setRegionId]=useState(regionSelect.find(r=>r.id===defaultRegionId)?.id??(regionSelect[0]?.id??''));
  const [objectName,setObjectName]=useState('');
  const [code,setCode]=useState('');
  const [objectSource,setObjectSource]=useState('');
  const [boundaryChoice,setBoundaryChoice]=useState<'later'|'now'>('later');

  const [newRegionId,setNewRegionId]=useState(currentRegionId??'');
  const [changeSource,setChangeSource]=useState('');

  const existingCodes=useMemo(()=>configurable.filter(i=>!['farm'].includes(i.kind)).map(i=>i.code),[configurable]);

  useEffect(()=>{
    if(view==='new-object'&&!codeDirty){
      const region=regionSelect.find(r=>r.id===regionId);
      if(region)setCode(suggestCode(region.name,existingCodes));
    }
  },[regionId,regionSelect,existingCodes,view,codeDirty]);

  useEffect(()=>{if(view==='new-object'){const region=regionSelect.find(r=>r.id===regionId);if(region&&!codeDirty)setCode(suggestCode(region.name,existingCodes));}},[]);

  const resetAll=()=>{setVillageName('');setVillageSource('');setObjectName('');setCode('');setCodeDirty(false);setObjectSource('');setBoundaryChoice('later');setNewRegionId(currentRegionId??'');setChangeSource('');setPartialObjectId(null);setPartialDrawNow(false);setError('');setMessage('');};

  const handleSubmit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      if(view==='new-village'){
        const body={farmId:villageFarmId,name:villageName.trim(),source:villageSource.trim()};
        const res=await fetch('/api/v1/map-regions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const data=await res.json().catch(()=>null);
        if(!res.ok)throw new Error(data?.message??'村庄保存失败');
        resetAll();
        onSaved({view:'new-village',id:data.id});
      }else if(view==='new-object'){
        const region=regionSelect.find(r=>r.id===regionId);
        const parent=region?farms.find(f=>f.id===region.farmId):farms[0];
        if(!parent){throw new Error('未找到可配置的农场，无法创建对象');}
        const body={parentId:parent.id,kind,name:objectName.trim(),code:code.trim(),source:objectSource.trim()};
        const res=await fetch('/api/v1/objects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const data=await res.json().catch(()=>null);
        if(!res.ok){
          if(data?.code==='CODE_EXISTS')setError('对象编号已存在，请修改编号后重试');
          else setError(data?.message??'对象创建失败');
          return;
        }
        const createdId=data.id as string;
        if(region){
          const assignRes=await fetch('/api/v1/map-regions',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'assign',objectId:createdId,regionId:region.id,source:objectSource.trim()})});
          const assignData=await assignRes.json().catch(()=>null);
          if(!assignRes.ok){
            setPartialObjectId(createdId);
            setPartialDrawNow(boundaryChoice==='now');
            setError(`对象已创建，村庄关联未保存：${assignData?.message??'关联失败'}。可点击“重试关联”继续，或稍后在维护村庄与关联中处理。`);
            return;
          }
        }
        resetAll();
        onSaved({view:'new-object',id:createdId,drawNow:boundaryChoice==='now'});
      }else if(view==='change-region'){
        if(!objectId)throw new Error('未指定对象');
        const body={action:'assign',objectId,regionId:newRegionId||'',source:changeSource.trim()};
        const res=await fetch('/api/v1/map-regions',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const data=await res.json().catch(()=>null);
        if(!res.ok)throw new Error(data?.message??'归属更改失败');
        resetAll();
        onSaved({view:'change-region',id:objectId});
      }
    }catch(err){setError(err instanceof Error?err.message:'操作未完成');}finally{setBusy(false);}
  };

  const retryAssign=async()=>{
    if(!partialObjectId||busy)return;
    const region=regionSelect.find(r=>r.id===regionId);
    if(!region){setError('请选择要关联的村庄后重试');return;}
    setBusy(true);setError('');setMessage('');
    try{
      const res=await fetch('/api/v1/map-regions',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'assign',objectId:partialObjectId,regionId:region.id,source:objectSource.trim()||'关联重试'})});
      const data=await res.json().catch(()=>null);
      if(!res.ok){setError(`重试关联仍未成功：${data?.message??'未知错误'}`);return;}
      const drawNow=partialDrawNow;
      resetAll();
      onSaved({view:'new-object',id:partialObjectId,drawNow});
    }catch(err){setError(err instanceof Error?err.message:'重试失败');}finally{setBusy(false);}
  };

  if(view==='new-village')return <form className={styles.managementForm} aria-label="新增村庄" onSubmit={handleSubmit}>
    <label>所属农场<select value={villageFarmId} onChange={e=>setVillageFarmId(e.target.value)} required disabled={busy}>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    <label>村庄名称<input value={villageName} onChange={e=>setVillageName(e.target.value)} required maxLength={80} disabled={busy}/></label>
    <label>维护依据<input value={villageSource} onChange={e=>setVillageSource(e.target.value)} required maxLength={1000} disabled={busy} placeholder="为何新增该村庄的经营分组依据"/></label>
    <div className={styles.managementActions}><button type="submit" disabled={busy||!villageFarmId||!villageName.trim()||!villageSource.trim()}>{busy?'保存中…':'保存村庄'}</button><button type="button" disabled={busy} onClick={onClose}>取消</button></div>
    {error&&<p className={styles.formError} role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </form>;

  if(view==='new-object')return <form className={styles.managementForm} aria-label="新增农业对象" onSubmit={handleSubmit}>
    <label>类型<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)} required disabled={busy}><option value="field">农田</option><option value="pond">塘口</option><option value="facility">固定设施</option></select></label>
    <label>名称<input value={objectName} onChange={e=>setObjectName(e.target.value)} required maxLength={80} disabled={busy}/></label>
    <label>编号<input value={code} onChange={e=>{setCode(e.target.value);setCodeDirty(true);}} required maxLength={80} disabled={busy}/><small>建议值，可修改；编号全局唯一</small></label>
    <label>登记依据<input value={objectSource} onChange={e=>setObjectSource(e.target.value)} required maxLength={1000} disabled={busy} placeholder="对象登记与村庄关联共用依据"/></label>
    <label>所属村庄<select value={regionId} onChange={e=>setRegionId(e.target.value)} required disabled={busy}>{regionSelect.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    <fieldset className={styles.boundaryChoice} disabled={busy}><legend>边界登记</legend><label><input type="radio" value="later" checked={boundaryChoice==='later'} onChange={()=>setBoundaryChoice('later')}/> 稍后登记位置</label><label><input type="radio" value="now" checked={boundaryChoice==='now'} onChange={()=>setBoundaryChoice('now')}/> 现在绘制边界</label></fieldset>
    <div className={styles.managementActions}><button type="submit" disabled={busy||!regionId||!objectName.trim()||!code.trim()||!objectSource.trim()}>{busy?'保存中…':'保存对象'}</button><button type="button" disabled={busy} onClick={onClose}>取消</button>{partialObjectId&&<button type="button" disabled={busy} onClick={retryAssign}>重试关联</button>}</div>
    {error&&<p className={styles.formError} role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </form>;

  if(view==='change-region')return <form className={styles.managementForm} aria-label="更改所属村庄" onSubmit={handleSubmit}>
    <p className={styles.detailContext}>当前村庄：{regions.find(r=>r.id===currentRegionId)?.name??'未关联'}</p>
    <label>新归属村庄<select value={newRegionId} onChange={e=>setNewRegionId(e.target.value)} required disabled={busy}><option value="">取消关联（未分配）</option>{sameFarmRegions.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    <label>变更依据<input value={changeSource} onChange={e=>setChangeSource(e.target.value)} required maxLength={1000} disabled={busy}/></label>
    <div className={styles.managementActions}><button type="submit" disabled={busy||!changeSource.trim()}>{busy?'保存中…':'保存归属'}</button><button type="button" disabled={busy} onClick={onClose}>取消</button></div>
    {error&&<p className={styles.formError} role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </form>;

  return null;
}

function RecycleBinPanel({allConfigurable,onSaved}:{allConfigurable:ConfigItem[];onSaved:()=>void}){
  const {data:regionsData,reload:reloadRegions}=useApi<{items:Region[]}>('/api/v1/map-regions');
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState('');
  const archivedObjects=allConfigurable.filter(i=>i.archived_at&&['field','pond','facility'].includes(i.kind));
  const archivedRegions=(regionsData?.items??[]).filter(r=>r.archivedAt);
  const restore=async(item:ConfigItem|Region)=>{
    setBusy(item.id);setError('');
    try{
      if('farmId' in item){
        const region=item;
        const res=await fetch('/api/v1/map-regions',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'archive',id:region.id,version:region.version,archived:false,reason:'从回收站恢复'})});
        const data=await res.json().catch(()=>null);if(!res.ok)throw new Error(data?.message??'村庄恢复失败');
      }else{
        const obj=item;
        const res=await fetch('/api/v1/objects/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:obj.id,version:obj.version,archived:false,reason:'从回收站恢复'})});
        const data=await res.json().catch(()=>null);if(!res.ok)throw new Error(data?.message??'对象恢复失败');
      }
      await reloadRegions();onSaved();
    }catch(err){setError(err instanceof Error?err.message:'恢复失败');}finally{setBusy(null);}
  };
  return <div className={styles.recycleBin}>
    <p className={styles.drawerHint}>已归档的村庄和对象会保留历史与关联记录。恢复村庄不会自动恢复历史关联。</p>
    {error&&<p className={styles.formError} role="alert">{error}</p>}
    <section><h3>已归档对象</h3>{archivedObjects.length===0&&<p className={styles.drawerHint}>没有已归档对象</p>}<ul>{archivedObjects.map(o=><li key={o.id}><span>{kindLabels[o.kind]??o.kind} · {o.name} · {o.code}{o.archived_at&&<small> · 归档于 {new Date(o.archived_at).toLocaleDateString('zh-CN')}</small>}</span><button type="button" disabled={busy===o.id} onClick={()=>restore(o)}>{busy===o.id?'恢复中…':'恢复'}</button></li>)}</ul></section>
    <section><h3>已归档村庄</h3>{archivedRegions.length===0&&<p className={styles.drawerHint}>没有已归档村庄</p>}<ul>{archivedRegions.map(r=><li key={r.id}><span>{r.name}{r.archivedAt&&<small> · 归档于 {new Date(r.archivedAt).toLocaleDateString('zh-CN')}</small>}</span><button type="button" disabled={busy===r.id} onClick={()=>restore(r)}>{busy===r.id?'恢复中…':'恢复'}</button></li>)}</ul></section>
  </div>;
}

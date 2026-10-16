'use client';

import { useEffect,useMemo,useRef,useState } from 'react';
import type React from 'react';
import Tree from '@rc-component/tree';
import type { TreeProps } from '@rc-component/tree';
import '@rc-component/tree/assets/index.css';
import { buildTreeData, filterTreeData, type TreeNodeData } from './resource-tree-helpers';
import styles from './farm-overview.module.css';

export type { TreeNodeData };

type FarmObject={id:string;farm_id?:string;farmId?:string;symbol?:string;name:string;code:string;kind:string;version:number;boundary_status:string;geometry:unknown|null};
type Region={id:string;farmId:string;name:string;version:number;archivedAt:string|null;links:{objectId:string}[]};
type Farm={id:string;name:string};

type MenuState={node:TreeNodeData;x:number;y:number}|null;

const statusLabel=(item:FarmObject)=>{
  if(!item.geometry)return'待登记边界';
  return item.boundary_status==='verified'?'已核实边界':'边界草稿';
};

export type ResourceTreeProps={
  mode:'real'|'demo';
  items:FarmObject[];
  regions:Region[];
  farms:Farm[];
  demoRegions?:Region[];
  demoItems?:FarmObject[];
  selectedId:string|null;
  expandedKeys:string[];
  query:string;
  canConfigure:boolean;
  canManageFarm:boolean;
  loading:boolean;
  error:string;
  offline:boolean;
  hasData:boolean;
  treeRef?:React.RefObject<Tree<TreeNodeData> | null>;
  onSelectObject:(item:FarmObject)=>void;
  onFitRegion:(region:Region)=>void;
  onNewObject:(regionId?:string)=>void;
  onManageRegion:()=>void;
  onChangeRegion:(item:FarmObject)=>void;
  onEditBoundary:(item:FarmObject)=>void;
  onViewDetail:(item:FarmObject)=>void;
  onExpand:(keys:string[])=>void;
  onReload:()=>void;
  onNotify:(message:string)=>void;
};

export default function ResourceTree(props:ResourceTreeProps){
  const {mode,items,regions,farms,demoRegions,demoItems,selectedId,expandedKeys,query,canConfigure,canManageFarm,loading,error,offline,hasData,treeRef,onSelectObject,onFitRegion,onNewObject,onManageRegion,onChangeRegion,onEditBoundary,onViewDetail,onExpand,onReload,onNotify}=props;
  const [menu,setMenu]=useState<MenuState>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const rootRef=useRef<HTMLDivElement>(null);
  const treeData=useMemo(()=>buildTreeData({mode,items,regions,farms,demoRegions,demoItems}),[mode,items,regions,farms,demoRegions,demoItems]);
  const filtered=useMemo(()=>filterTreeData(treeData,query),[treeData,query]);
  const displayTree=query.trim()?filtered.nodes:treeData;
  const activeExpandedKeys=query.trim()?[...filtered.expandedKeys]:expandedKeys;
  const selectedKeys=useMemo(()=>selectedId?[selectedId]:[],[selectedId]);

  useEffect(()=>{
    if(!menu)return;
    const close=(e:MouseEvent)=>{if(menuRef.current&&!menuRef.current.contains(e.target as Node))setMenu(null);};
    const keydown=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(null);};
    document.addEventListener('mousedown',close);document.addEventListener('keydown',keydown);
    return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',keydown);};
  },[menu]);

  const handleArchive=async(node:TreeNodeData)=>{
    if(!window.confirm(archiveConfirmText(node)))return;
    setMenu(null);
    try{
      if(node.kind==='region'&&node.region){
        const res=await fetch('/api/v1/map-regions',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'archive',id:node.region.id,version:node.region.version,archived:true,reason:'通过目录菜单移至回收站'})});
        const data=await res.json().catch(()=>null);
        if(!res.ok)throw new Error(data?.message??'村庄归档失败');
      }else if(node.kind==='object'&&node.item){
        const res=await fetch('/api/v1/objects/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:node.item.id,version:node.item.version,archived:true,reason:'通过目录菜单移至回收站'})});
        const data=await res.json().catch(()=>null);
        if(!res.ok)throw new Error(data?.message??'对象归档失败');
      }else{return;}
      onReload();
    }catch(err){onNotify(err instanceof Error?err.message:'归档失败');}
  };

  const openMenu=(node:TreeNodeData,anchor:DOMRect|{x:number;y:number})=>{
    const rect='left' in anchor?anchor:null;
    const x=rect?rect.left:anchor.x;
    const y=rect?rect.top+rect.height:anchor.y;
    setMenu({node,x,y});
  };

  const titleRender:NonNullable<TreeProps<TreeNodeData>['titleRender']>=(node)=>{
    const isRegion=node.kind==='region';
    const isObject=node.kind==='object';
    const isFarm=node.kind==='farm';
    const selected=selectedId===String(node.key);
    const label=isRegion?`定位村庄 ${node.title}`:node.title;
    return <span className={`${styles.treeNode} ${selected?styles.treeNodeSelected:''}`} data-kind={node.kind}>
      <button type="button" className={styles.treeTitleButton} aria-label={label} onClick={e=>{e.stopPropagation();handleTitleClick(node);}}>{node.title}</button>
      {isObject&&node.item&&<span className={styles.treeMeta}>{node.item.code} · {statusLabel(node.item)}</span>}
      <button type="button" className={styles.treeMenuButton} aria-label={`${node.title} 操作菜单`} aria-haspopup="menu" aria-expanded={!!menu&&menu.node.key===node.key} onClick={e=>{e.stopPropagation();openMenu(node,e.currentTarget.getBoundingClientRect());}}>···</button>
      {menu&&menu.node.key===node.key&&<div ref={menuRef} className={styles.treeMenu} role="menu" style={{left:menu.x,top:menu.y}} onClick={e=>e.stopPropagation()}>
        <NodeMenu node={node} canConfigure={canConfigure} canManageFarm={canManageFarm} onSelect={()=>handleTitleClick(node)} onFitRegion={()=>{setMenu(null);node.region&&onFitRegion(node.region);}} onNewObject={()=>{setMenu(null);node.region&&onNewObject(node.region.id);}} onManageRegion={()=>{setMenu(null);onManageRegion();}} onExpand={()=>{setMenu(null);onExpand([...new Set([...expandedKeys,String(node.key)])]);}} onChangeRegion={()=>{setMenu(null);node.item&&onChangeRegion(node.item);}} onEditBoundary={()=>{setMenu(null);node.item&&onEditBoundary(node.item);}} onViewDetail={()=>{setMenu(null);node.item&&onViewDetail(node.item);}} onArchive={()=>handleArchive(node)} onClose={()=>setMenu(null)}/>
      </div>}
    </span>;
  };

  const handleTitleClick=(node:TreeNodeData)=>{
    if(node.kind==='object'&&node.item){onSelectObject(node.item);}
    else if(node.kind==='region'&&node.region){onFitRegion(node.region);}
    else if(node.kind==='farm'&&node.farm){
      fitFarm(node.farm);
    }
  };

  const fitFarm=(farm:Farm)=>{
    onExpand(expandedKeys.includes(`farm:${farm.id}`)?expandedKeys.filter(k=>k!==`farm:${farm.id}`):[...expandedKeys,`farm:${farm.id}`]);
  };

  const onTreeSelect:NonNullable<TreeProps<TreeNodeData>['onSelect']>=(keys,info)=>{
    handleTitleClick(info.node);
  };

  const onTreeExpand:NonNullable<TreeProps<TreeNodeData>['onExpand']>=(keys)=>{if(!query.trim())onExpand(keys.map(String));};
  const onTreeRightClick:NonNullable<TreeProps<TreeNodeData>['onRightClick']>=(info)=>{
    openMenu(info.node,{x:info.event.clientX,y:info.event.clientY});
  };

  if(loading)return <p role="status" className={styles.treeStatus}>正在读取已授权对象…</p>;
  if(error)return <div role="alert" className={styles.treeError}>{error}{offline&&hasData&&<p>正在显示上次成功读取的资料，当前状态尚未重新核实。</p>}<button type="button" onClick={()=>onReload()}>重试</button></div>;
  if(!displayTree.length)return <p className={styles.treeEmpty}>当前没有可查看的农业对象。</p>;

  return <div ref={rootRef} className={styles.treeWrap}>
    <Tree<TreeNodeData>
      ref={treeRef}
      prefixCls="rc-tree"
      className={styles.resourceTree}
      treeData={displayTree as TreeNodeData[]}
      fieldNames={{title:'title',key:'key',children:'children'}}
      titleRender={titleRender}
      selectedKeys={selectedKeys}
      expandedKeys={activeExpandedKeys}
      onSelect={onTreeSelect}
      onExpand={onTreeExpand}
      onRightClick={onTreeRightClick}
      showLine={false}
      showIcon={false}
      selectable={true}
      expandAction={false}
    />
  </div>;
}

function archiveConfirmText(node:TreeNodeData):string{
  if(node.kind==='region')return `村庄「${node.title}」将从正常目录移除，里面的农田/塘口/设施不会被删除，关联历史会保留。确定移至回收站？`;
  if(node.kind==='object')return `对象「${node.title}」将被移至回收站，历史版本与关联记录保留，可随时恢复。确定继续？`;
  return `确定将此节点移至回收站？`;
}

function NodeMenu({node,canConfigure,canManageFarm,onSelect,onFitRegion,onNewObject,onManageRegion,onExpand,onChangeRegion,onEditBoundary,onViewDetail,onArchive,onClose}:{node:TreeNodeData;canConfigure:boolean;canManageFarm:boolean;onSelect:()=>void;onFitRegion:()=>void;onNewObject:()=>void;onManageRegion:()=>void;onExpand:()=>void;onChangeRegion:()=>void;onEditBoundary:()=>void;onViewDetail:()=>void;onArchive:()=>void;onClose:()=>void}){
  const items:React.ReactNode[]=[];
  if(node.kind==='region'){
    const isDemoRegion=node.region?.id.startsWith('demo:')??String(node.key).startsWith('region:demo:');
    items.push(<button key="fit" type="button" role="menuitem" onClick={onFitRegion}>地图定位</button>);
    if(!isDemoRegion&&canConfigure)items.push(<button key="new" type="button" role="menuitem" onClick={onNewObject}>在该村新增对象</button>);
    if(!isDemoRegion&&canManageFarm)items.push(<button key="manage" type="button" role="menuitem" onClick={onManageRegion}>修改村庄资料</button>);
    items.push(<button key="expand" type="button" role="menuitem" onClick={onExpand}>查看关联对象</button>);
    if(!isDemoRegion&&canManageFarm)items.push(<button key="archive" type="button" role="menuitem" className={styles.dangerMenuItem} onClick={onArchive}>移至回收站</button>);
  }else if(node.kind==='object'&&node.item){
    const isDemo=node.item.id.startsWith('demo:');
    items.push(<button key="fit" type="button" role="menuitem" onClick={onSelect}>地图定位</button>);
    items.push(<button key="detail" type="button" role="menuitem" onClick={onViewDetail}>查看详情</button>);
    if(!isDemo&&canConfigure){
      items.push(<a key="edit" role="menuitem" href={`/objects/${node.item.id}`}>修改基本资料</a>);
      if(['field','pond'].includes(node.item.kind))items.push(<button key="boundary" type="button" role="menuitem" onClick={onEditBoundary}>编辑边界</button>);
      items.push(<button key="change" type="button" role="menuitem" onClick={onChangeRegion}>更改所属村庄</button>);
      items.push(<button key="archive" type="button" role="menuitem" className={styles.dangerMenuItem} onClick={onArchive}>移至回收站</button>);
    }
  }else if(node.kind==='farm'){
    items.push(<button key="expand" type="button" role="menuitem" onClick={onExpand}>展开/折叠</button>);
  }
  return <>{items}</>;
}

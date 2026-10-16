export type TreeObject={id:string;farm_id?:string;farmId?:string;name:string;code:string;kind:string;version:number;boundary_status:string;geometry:unknown|null};
export type TreeRegion={id:string;farmId:string;name:string;version:number;archivedAt:string|null;links:{objectId:string}[]};
export type TreeFarm={id:string;name:string};
export type TreeNodeData={
  key:string;
  title:string;
  kind:'farm'|'region'|'object'|'unassigned';
  item?:TreeObject;
  region?:TreeRegion;
  farm?:TreeFarm;
  isLeaf?:boolean;
  children?:TreeNodeData[];
};

function objectMatches(item:TreeObject,query:string):boolean{
  return (item.name+' '+item.code).toLocaleLowerCase().includes(query);
}
function nodeTitleMatch(node:TreeNodeData,query:string):boolean{
  if(node.item)return objectMatches(node.item,query);
  return node.title.toLocaleLowerCase().includes(query);
}

export function buildTreeData({mode,items,regions,farms,demoRegions,demoItems}:{mode:'real'|'demo';items:TreeObject[];regions:TreeRegion[];farms:TreeFarm[];demoRegions?:TreeRegion[];demoItems?:TreeObject[]}):TreeNodeData[]{
  if(mode==='demo'){
    const farm=demoRegions?.[0]?{id:demoRegions[0].farmId,name:'演示农场'}:farms[0]??{id:'demo',name:'演示农场'};
    const regionNodes=(demoRegions??[]).filter(r=>!r.archivedAt).map(region=>{
      const children=(demoItems??[]).filter(item=>region.links.some(l=>l.objectId===item.id)&&item.kind!=='mobile').sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).map(item=>({key:item.id,title:item.name,kind:'object' as const,item,isLeaf:true}));
      return{key:`region:${region.id}`,title:region.name,kind:'region' as const,region,children};
    });
    const unassigned=(demoItems??[]).filter(item=>item.kind!=='farm'&&item.kind!=='mobile'&&!regionNodes.some(r=>r.children?.some(c=>c.key===item.id))).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).map(item=>({key:item.id,title:item.name,kind:'object' as const,item,isLeaf:true}));
    const children=[...regionNodes,...(unassigned.length?[{key:`unassigned:${farm.id}`,title:'未归类',kind:'unassigned' as const,children:unassigned}]:[])];
    return[{key:`farm:${farm.id}`,title:farm.name,kind:'farm',farm,children}];
  }
  // real mode
  const farmMap=new Map<string,TreeFarm>();
  for(const farm of farms)if(!farmMap.has(farm.id))farmMap.set(farm.id,farm);
  for(const region of regions){if(!farmMap.has(region.farmId))farmMap.set(region.farmId,{id:region.farmId,name:'农场'});}
  for(const item of items){const fid=item.farm_id??item.farmId;if(fid&&!farmMap.has(fid))farmMap.set(fid,{id:fid,name:'农场'});}
  const roots=[...farmMap.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).map(farm=>{
    const regionNodes=regions.filter(r=>r.farmId===farm.id&&!r.archivedAt).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).map(region=>{
      const children=region.links.map(link=>items.find(item=>item.id===link.objectId)).filter((item):item is TreeObject=>!!item&&item.kind!=='mobile').sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).map(item=>({key:item.id,title:item.name,kind:'object' as const,item,isLeaf:true}));
      return{key:`region:${region.id}`,title:region.name,kind:'region' as const,region,children};
    });
    const assigned=new Set(regionNodes.flatMap(r=>r.children?.map(c=>c.key)??[]));
    const unassigned=items.filter(item=>item.kind!=='farm'&&item.kind!=='mobile'&&!assigned.has(item.id)&&(item.farm_id===farm.id||item.farmId===farm.id)).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).map(item=>({key:item.id,title:item.name,kind:'object' as const,item,isLeaf:true}));
    const children=[...regionNodes,...(unassigned.length?[{key:`unassigned:${farm.id}`,title:'未归类',kind:'unassigned' as const,children:unassigned}]:[])];
    return{key:`farm:${farm.id}`,title:farm.name,kind:'farm' as const,farm,children};
  });
  return roots;
}

export function filterTreeData(nodes:TreeNodeData[],query:string):{nodes:TreeNodeData[];expandedKeys:Set<string>}{
  const q=query.trim().toLocaleLowerCase();
  if(!q)return{nodes,expandedKeys:new Set<string>()};
  const expandedKeys=new Set<string>();
  function walk(list:TreeNodeData[]):TreeNodeData[]{
    const result:TreeNodeData[]=[];
    for(const node of list){
      const children=node.children?walk(node.children):undefined;
      const selfMatch=nodeTitleMatch(node,q);
      const hasMatchingChildren=children && children.length>0;
      if(selfMatch||hasMatchingChildren){
        const next:TreeNodeData={...node};
        if(hasMatchingChildren){
          next.children=children;
          expandedKeys.add(String(node.key));
        }else if(node.children){
          next.children=node.children;
        }
        result.push(next);
      }
    }
    return result;
  }
  const filtered=walk(nodes);
  return{nodes:filtered,expandedKeys};
}

export function collectKeys(nodes:TreeNodeData[]):string[]{
  return nodes.flatMap(node=>[String(node.key),...(node.children?collectKeys(node.children):[])]);
}

export function getDefaultExpandedKeys(nodes:TreeNodeData[]):string[]{
  return nodes.flatMap(node=>{
    const childKeys=node.children?getDefaultExpandedKeys(node.children):[];
    return node.kind==='farm'||node.kind==='region'||node.kind==='unassigned'?[String(node.key),...childKeys]:childKeys;
  });
}

export function findNodeByKey(nodes:TreeNodeData[],key:string):TreeNodeData|undefined{
  for(const node of nodes){
    if(String(node.key)===key)return node;
    if(node.children){const found=findNodeByKey(node.children,key);if(found)return found;}
  }
  return undefined;
}

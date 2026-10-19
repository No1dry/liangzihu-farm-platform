export default function KindIcon({kind,className}:{kind?:string;className?:string}){
 const key=kind??'facility';
 const common={width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.35,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true,'data-kind':key,className};
 if(key==='farm')return <svg {...common}><path d="M2 7.5 8 3l6 4.5v6H2z"/><path d="M5 13V8h6v5M8 3v4"/></svg>;
 if(key==='region')return <svg {...common}><path d="M2.5 4.5h4l1.5 2h5.5v7h-11z"/><path d="M2.5 6.5h11"/></svg>;
 if(key==='field')return <svg {...common}><path d="M13 3C7 3 3.5 6.5 3 12c5.5.5 9.5-2.5 10-9Z"/><path d="M3 13c2-4 5-6 8-8"/></svg>;
 if(key==='pond')return <svg {...common}><path d="M2 5c1.5 1 2.5 1 4 0s2.5-1 4 0 2.5 1 4 0M2 9c1.5 1 2.5 1 4 0s2.5-1 4 0 2.5 1 4 0M2 13c1.5 1 2.5 1 4 0s2.5-1 4 0 2.5 1 4 0"/></svg>;
 if(key==='mobile')return <svg {...common}><path d="M6 6h4v4H6zM3 4l3 3M13 4l-3 3M3 12l3-3M13 12l-3-3M8 10v3"/></svg>;
 return <svg {...common}><path d="M3 13V4.5L8 2.5l5 2V13"/><path d="M5.5 13V6h5v7M6.7 8h.7M8.7 8h.7M6.7 10h.7M8.7 10h.7"/></svg>;
}

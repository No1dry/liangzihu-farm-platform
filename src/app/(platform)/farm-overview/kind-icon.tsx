export default function KindIcon({kind,className}:{kind?:string;className?:string}){
 const key=kind??'facility';
 const common={width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.35,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true,'data-kind':key,className};
 if(key==='farm')return <svg {...common}><path d="M2 7.5 8 3l6 4.5v6H2z"/><path d="M5 13V8h6v5M8 3v4"/></svg>;
 if(key==='region')return <svg {...common}><path d="M8 14s5-4.2 5-7.2A4 4 0 0 0 8 3a4 4 0 0 0-5 3.8C3 9.8 8 14 8 14Z"/><circle cx="8" cy="6.8" r="1.3"/></svg>;
 if(key==='field')return <svg {...common}><path d="M13 3C7 3 3.5 6.5 3 12c5.5.5 9.5-2.5 10-9Z"/><path d="M3 13c2-4 5-6 8-8"/></svg>;
 if(key==='pond')return <svg {...common}><path d="M2 5c1.5 1 2.5 1 4 0s2.5-1 4 0 2.5 1 4 0M2 9c1.5 1 2.5 1 4 0s2.5-1 4 0 2.5 1 4 0M2 13c1.5 1 2.5 1 4 0s2.5-1 4 0 2.5 1 4 0"/></svg>;
 if(key==='mobile')return <svg {...common}><path d="M6 6h4v4H6zM3 4l3 3M13 4l-3 3M3 12l3-3M13 12l-3-3M8 10v3"/></svg>;
 return <svg {...common}><path d="M3 3h4l1.5 2H13v8H3z"/><path d="M5 8h6M5 10h4"/></svg>;
}

const EARTH_RADIUS=6378137;
const DEG2RAD=Math.PI/180;

export function lonLatToMercator(lonLat:[number,number]):[number,number]{
 const x=EARTH_RADIUS*lonLat[0]*DEG2RAD;
 const y=EARTH_RADIUS*Math.log(Math.tan(Math.PI/4+lonLat[1]*DEG2RAD/2));
 return [x,y];
}

export function mercatorToPixel(merc:[number,number],center:[number,number],resolution:number,size:[number,number]):[number,number]{
 return [size[0]/2+(merc[0]-center[0])/resolution,size[1]/2-(merc[1]-center[1])/resolution];
}

export function lonLatToPixel(lonLat:[number,number],center:[number,number],resolution:number,size:[number,number]):[number,number]{
 return mercatorToPixel(lonLatToMercator(lonLat),center,resolution,size);
}

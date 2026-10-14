import { readApi } from '@/platform/api';
import { getPointsCurrent } from '@/modules/telemetry/queries';
export function GET(request:Request){return readApi(request,(c,a)=>getPointsCurrent(c,a));}

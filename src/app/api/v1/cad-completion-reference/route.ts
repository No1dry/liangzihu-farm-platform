import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {endpoint,json} from '@/modules/identity/http';
import {requireActor} from '@/modules/identity/session';

const filePath=path.join(process.cwd(),'data','cad-reference','completion-reference.json');

export function GET(request:Request){
 return endpoint(async()=>{await requireActor(request);return json(JSON.parse(await readFile(filePath,'utf8')));});
}

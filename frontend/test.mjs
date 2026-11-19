// Accept the toolkit's optional --run flag; tests always run once.
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
if(process.argv.slice(2).some(arg=>arg!=='--run'))throw Error('Unknown test option');
const folder=fileURLToPath(new URL('tests/',import.meta.url));
const files=readdirSync(folder).filter(name=>name.endsWith('.test.mjs')).map(name=>folder+name);
if(!files.length)throw Error('No tests found');
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
process.exitCode=result.status??1;

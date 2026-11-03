'use strict';
// Reproducible source/app ZIP and per-file hashes, using Node standard libraries.
// This command packages files; it does not select a license or publish a release.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{deflateRawSync}=require('node:zlib');
const root=path.resolve(__dirname,'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version))throw Error('Invalid package version.');
execFileSync(process.execPath,[path.join(__dirname,'build.cjs'),'--check'],{cwd:root,stdio:'inherit'});
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const files=[...new Set(execFileSync('git',['ls-files','--cached','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean))].sort();
for(const required of ['GlyphPoint-v1a-layout-fixed.html','src/app.html','src/app.js','src/workflows.js','src/recovery.js','src/renderer.js','src/interchange.js','src/jobs.js','assets/fonts/fonts.css','assets/fonts/LICENSE-DejaVu.txt','scripts/build.cjs','scripts/release.cjs']){
  if(!files.includes(required))throw Error('Stage all required release source files before packaging: missing '+required);
}
const records=files.filter(file=>!file.startsWith('dist/')).map(file=>{
  if(file==='RELEASE-MANIFEST.json')throw Error('RELEASE-MANIFEST.json is reserved for generated package metadata.');
  if(path.isAbsolute(file)||file.split('/').includes('..'))throw Error('Unsafe archive path: '+file);
  const source=path.join(root,file),stat=fs.lstatSync(source);
  if(!fs.realpathSync(source).startsWith(fs.realpathSync(root)+path.sep))throw Error('Archive source resolves outside the repository: '+file);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Only regular tracked files can be packaged: '+file);
  return {name:file,data:fs.readFileSync(source)};
});
const manifest={version,sourceCommit:git('rev-parse','HEAD'),workingTreeDirty:git('status','--porcelain')!=='',license:records.some(record=>record.name==='LICENSE')?'See LICENSE':'Owner license selection pending',entryPoint:'GlyphPoint-v1a-layout-fixed.html',files:records.map(({name,data})=>({path:name,bytes:data.length,sha256:hash(data)}))};
records.push({name:'RELEASE-MANIFEST.json',data:Buffer.from(JSON.stringify(manifest,null,2)+'\n')});
// A fixed DOS timestamp makes repeat packages byte-for-byte reproducible.
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
const crc32=data=>{let n=0xffffffff;for(const byte of data)n=table[(n^byte)&255]^(n>>>8);return (n^0xffffffff)>>>0};
let offset=0;const entries=[],central=[];
for(const record of records){
  const name=Buffer.from('GlyphPoint-'+version+'/'+record.name),data=deflateRawSync(record.data,{level:9}),crc=crc32(record.data);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(0x21,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(record.data.length,22);header.writeUInt16LE(name.length,26);
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(0x21,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(record.data.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);
  entries.push(header,name,data);central.push(directory,name);offset+=header.length+name.length+data.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(records.length,8);end.writeUInt16LE(records.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...entries,directory,end]),out=path.join(root,'dist');fs.mkdirSync(out,{recursive:true});
const filename='GlyphPoint-'+version+'.zip';fs.writeFileSync(path.join(out,filename),archive);fs.writeFileSync(path.join(out,filename+'.sha256'),hash(archive)+'  '+filename+'\n');fs.writeFileSync(path.join(out,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Packaged ${records.length} files as dist/${filename} (${archive.length.toLocaleString()} bytes). Source ${manifest.sourceCommit}${manifest.workingTreeDirty?' plus working changes':''}.`);

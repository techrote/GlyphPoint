'use strict';
// The same bounded generator runs in a Blob worker or yields on the main thread.
// Inputs are structured-cloned by workers; callers commit only a current result.
const GPJobs = (() => {
  function* kernel(kind, input) {
    const {cols, rows} = input;
    const dimensions = (w,h) => {
      if (!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>512||h>512||w*h>65536) throw Error('Result exceeds the 512-cell side or 65,536-cell document limit.');
    };
    dimensions(cols,rows);
    if (!Array.isArray(input.cells)||input.cells.length!==cols*rows) throw Error('Invalid source cell count.');
    const blank = () => ({ch:' ',fg:'',bg:'',font:'DejaVu Sans Mono',bold:false,italic:false,underline:false});
    if (kind==='fill') {
      const {x,y,cell}=input;
      if (!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=cols||y>=rows) throw Error('Invalid fill origin.');
      const cells=input.cells.map(c=>({...c})), target=cells[y*cols+x], seen=new Uint8Array(cells.length), stack=[y*cols+x];
      seen[stack[0]]=1;let count=0,steps=0;
      while(stack.length) {
        const i=stack.pop(),current=cells[i],cx=i%cols,cy=Math.floor(i/cols);
        if(current.ch!==target.ch||current.fg!==target.fg||current.bg!==target.bg)continue;
        cells[i]={...cell};count++;
        for(const next of [cx>0?i-1:-1,cx+1<cols?i+1:-1,cy>0?i-cols:-1,cy+1<rows?i+cols:-1]) {
          if(next>=0&&!seen[next]){seen[next]=1;stack.push(next)}
        }
        if(++steps%1024===0)yield {completed:steps,total:cells.length};
      }
      return {cols,rows,cells,count};
    }
    if(kind!=='resize')throw Error('Unknown document job.');
    const {width,height,angleX=0,angleY=0,edgePolicy='expand'}=input;
    dimensions(width,height);
    if(!Number.isFinite(angleX)||!Number.isFinite(angleY)||Math.abs(angleX)>89||Math.abs(angleY)>89)throw Error('Skew angles must be between -89 and 89 degrees.');
    if(!['expand','clip','reject'].includes(edgePolicy))throw Error('Invalid edge policy.');
    // Sequential shears have determinant 1, including simultaneous 45° angles.
    const kx=Math.tan(angleX*Math.PI/180),ky=Math.tan(angleY*Math.PI/180);
    const corners=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>[x+kx*y,y+ky*(x+kx*y)]);
    const epsilon=1e-8;
    const minX=Math.floor(Math.min(...corners.map(p=>p[0]))+epsilon), minY=Math.floor(Math.min(...corners.map(p=>p[1]))+epsilon);
    const maxX=Math.ceil(Math.max(...corners.map(p=>p[0]))-epsilon), maxY=Math.ceil(Math.max(...corners.map(p=>p[1]))-epsilon);
    const extendsField=minX<0||minY<0||maxX>width||maxY>height;
    if(edgePolicy==='reject'&&extendsField)throw Error('Skew extends beyond the field. Choose Expand or explicitly choose Clip.');
    const offsetX=edgePolicy==='expand'?minX:0, offsetY=edgePolicy==='expand'?minY:0;
    const outW=edgePolicy==='expand'?maxX-minX:width, outH=edgePolicy==='expand'?maxY-minY:height;
    dimensions(outW,outH);
    const cells=new Array(outW*outH);
    for(let y=0;y<outH;y++)for(let x=0;x<outW;x++) {
      const tx=x+offsetX+.5,ty=y+offsetY+.5,sy=ty-ky*tx,sx=tx-kx*sy;
      const i=y*outW+x;
      if(sx<0||sy<0||sx>=width||sy>=height)cells[i]=blank();
      else cells[i]={...input.cells[Math.min(rows-1,Math.floor(sy*rows/height))*cols+Math.min(cols-1,Math.floor(sx*cols/width))]};
      if((i+1)%1024===0)yield {completed:i+1,total:cells.length};
    }
    return {cols:outW,rows:outH,cells,clipped:edgePolicy==='clip'&&extendsField};
  }
  const abortError=()=>Object.assign(Error('Operation cancelled.'),{name:'AbortError'});
  async function cooperative(kind,input,{signal,onProgress=()=>{}}={}) {
    const iterator=kernel(kind,input);let next;
    do {
      if(signal?.aborted)throw abortError();
      next=iterator.next();
      if(!next.done){onProgress(next.value);await new Promise(resolve=>setTimeout(resolve,0))}
    }while(!next.done);
    return next.value;
  }
  function run(kind,input,options={}) {
    const {signal,onProgress=()=>{}}=options;
    if(signal?.aborted)return Promise.reject(abortError());
    if(options.preferWorker===false||typeof Worker==='undefined')return cooperative(kind,input,options);
    return new Promise((resolve,reject)=>{
      let worker,url,finished=false;
      const cleanup=()=>{worker?.terminate();if(url)URL.revokeObjectURL(url);signal?.removeEventListener('abort',cancel)};
      const finish=(error,value)=>{if(finished)return;finished=true;cleanup();error?reject(error):resolve(value)};
      const cancel=()=>finish(abortError());
      try {
        const source=`const kernel=${kernel.toString()};onmessage=e=>{try{const it=kernel(e.data.kind,e.data.input);let n;do{n=it.next();if(!n.done)postMessage({progress:n.value})}while(!n.done);postMessage({result:n.value})}catch(error){postMessage({error:error.message})}};`;
        url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(url);
        signal?.addEventListener('abort',cancel,{once:true});
        worker.onmessage=e=>{if(e.data.progress)onProgress(e.data.progress);else if(e.data.error)finish(Error(e.data.error));else finish(null,e.data.result)};
        worker.onerror=()=>{if(finished)return;finished=true;cleanup();cooperative(kind,input,options).then(resolve,reject)};
        worker.postMessage({kind,input});
      }catch{if(!finished){finished=true;cleanup();cooperative(kind,input,options).then(resolve,reject)}}
    });
  }
  return Object.freeze({run,kernel,cooperative});
})();

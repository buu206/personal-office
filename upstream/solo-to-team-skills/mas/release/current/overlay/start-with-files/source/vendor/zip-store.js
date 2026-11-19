'use strict';
const LocalTeamZip=(()=>{
const encoder=new TextEncoder(); const error=(zh,en)=>{throw Error(zh+' / '+en)};
  const crcTable = Uint32Array.from({length:256},(_,i) => {
    let c=i;
    for(let n=0;n<8;n++) c=(c>>>1)^((c&1)?0xedb88320:0);
    return c>>>0;
  });
  function crc32(data) {
    let c=0xffffffff;
    for(const byte of data) c=(c>>>8)^crcTable[(c^byte)&255];
    return (c^0xffffffff)>>>0;
  }

  // ZIP32, stored payloads, UTF-8 paths and no archive comments or host paths.
  function storeZip(entries) {
    if(entries.length>=65535) error('项目文件过多。','Too many ZIP entries.');
    const parts=[], central=[], usedPaths=new Set();
    let offset=0, centralSize=0;
    for (const [path,raw] of entries) {
      if(!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(s=> !s || s==='..' || s==='.') || usedPaths.has(path.toLowerCase()))
        error('导出文件路径冲突。','Unsafe or duplicate archive path.');
      usedPaths.add(path.toLowerCase());
      const name=encoder.encode(path),data=typeof raw==='string'?encoder.encode(raw):raw;
      const checksum=crc32(data);
      const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(12,0x21,true);
      lv.setUint32(14,checksum,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);local.set(name,30);
      const record=new Uint8Array(46+name.length),cv=new DataView(record.buffer);
      cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,0x21,true);
      cv.setUint32(16,checksum,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);record.set(name,46);
      parts.push(local,data);central.push(record);offset+=local.length+data.length;centralSize+=record.length;
      if(offset+centralSize>=0xffffffff) error('导出超出 ZIP32 容量。','ZIP32 size limit exceeded.');
    }
    const tail=new Uint8Array(22),ev=new DataView(tail.buffer);
    ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
    return new Blob([...parts,...central,tail],{type:'application/zip'});
  }

return storeZip;
})();

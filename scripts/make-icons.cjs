// Rasterizes the ShotCaller logo (see src/components/Logo.tsx) into resources/ and build/ PNGs. Run: node scripts/make-icons.cjs
/* eslint-disable @typescript-eslint/no-require-imports */
const zlib=require('zlib'),fs=require('fs');
function crc(b){let t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}let x=0xffffffff;for(const v of b)x=t[(x^v)&255]^(x>>>8);return (x^0xffffffff)>>>0}
function chunk(type,data){const l=Buffer.alloc(4);l.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])}
function inPoly(x,y,p){let r=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const[xi,yi]=p[i],[xj,yj]=p[j];if((yi>y)!=(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)r=!r}return r}
const horn=[[18,28],[24,28],[36,20],[36,44],[24,36],[18,36]];
function ellD(x,y,deg){const t=deg*Math.PI/180,dx=x-32,dy=y-32,u=dx*Math.cos(t)+dy*Math.sin(t),v=-dx*Math.sin(t)+dy*Math.cos(t),a=25,b=9;const f=Math.sqrt((u/a)**2+(v/b)**2),g=Math.sqrt((u/a/a)**2+(v/b/b)**2)/(f||1);return Math.abs(f-1)/(g||1)}
function px(x,y,small){
  const r=16,cx=Math.min(Math.max(x,r),64-r),cy=Math.min(Math.max(y,r),64-r);
  if(x<0||x>64||y<0||y>64||(x-cx)**2+(y-cy)**2>r*r) return null;
  if(inPoly(x,y,horn)) return [255,255,255];
  if(!small){const d=Math.hypot(x-35,y-32); if(x>38&&Math.abs(y-32)<5.2&&Math.abs(d-5.5)<1.5) return [255,255,255];}
  const sw=small?2.25:1.1; if(ellD(x,y,30)<sw||ellD(x,y,-30)<sw) return [0x7f,0xb2,0xff];
  return [0x1a,0x1c,0x3a];
}
function make(size,file){const small=size<=20,ss=4,rows=[];for(let y=0;y<size;y++){const row=[0];for(let x=0;x<size;x++){let R=0,G=0,B=0,A=0;for(let sy=0;sy<ss;sy++)for(let sx=0;sx<ss;sx++){const c=px((x+(sx+.5)/ss)*64/size,(y+(sy+.5)/ss)*64/size,small);if(c){R+=c[0];G+=c[1];B+=c[2];A++}}row.push(A?Math.round(R/A):0,A?Math.round(G/A):0,A?Math.round(B/A):0,Math.round(255*A/(ss*ss)))}rows.push(Buffer.from(row))}
const ih=Buffer.alloc(13);ih.writeUInt32BE(size,0);ih.writeUInt32BE(size,4);ih[8]=8;ih[9]=6;
fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]))}
const o=require('path').join(__dirname,'..')+'/';make(16,o+'resources/tray.png');make(32,o+'resources/tray@2x.png');make(256,o+'resources/icon.png');fs.mkdirSync(o+'build',{recursive:true});make(512,o+'build/icon.png');

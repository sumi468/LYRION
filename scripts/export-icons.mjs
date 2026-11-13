import {chromium} from 'playwright';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const svg=readFileSync(new URL('../public/favicon.svg',import.meta.url),'utf8');
mkdirSync(new URL('../public/icons/',import.meta.url),{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage();const frames=[];
 for(const size of [32,48,64,180,192,256,512]){
  const data=await page.evaluate(async([svg,size])=>{const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=size;canvas.getContext('2d').drawImage(image,0,0,size,size);return canvas.toDataURL('image/png').split(',')[1];},[svg,size]);
  const png=Buffer.from(data,'base64');if([32,48,64,256].includes(size))frames.push({size,png});
  if([180,192,512].includes(size))writeFileSync(new URL(`../public/icons/${size===180?'apple-touch-icon':`icon-${size}`}.png`,import.meta.url),png);
  if(size===512)writeFileSync(new URL('../public/icons/maskable-512.png',import.meta.url),png);
 }
 const header=Buffer.alloc(6+frames.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);let offset=header.length;
 frames.forEach(({size,png},i)=>{const n=6+i*16;header[n]=header[n+1]=size===256?0:size;header.writeUInt16LE(1,n+4);header.writeUInt16LE(32,n+6);header.writeUInt32LE(png.length,n+8);header.writeUInt32LE(offset,n+12);offset+=png.length;});
 writeFileSync(new URL('../public/favicon.ico',import.meta.url),Buffer.concat([header,...frames.map(f=>f.png)]));
 console.log('Original LYRION icon: SVG, PNG and multi-resolution ICO exported.');
}finally{await browser.close();}

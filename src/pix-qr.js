import {qrcode} from "./vendor/qrcode.mjs";
const field=(id,value)=>id+String(value.length).padStart(2,"0")+value;
export function normalizePixText(value,max){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9 .'-]/g,"").trim().slice(0,max);}
export function crc16(value){let crc=0xffff;for(const b of new TextEncoder().encode(value)){crc^=b<<8;for(let bit=0;bit<8;bit++)crc=((crc<<1)^((crc&0x8000)?0x1021:0))&0xffff;}return crc.toString(16).toUpperCase().padStart(4,"0");}
export function pixPayload({key,recipient,city,cents}){
 const name=normalizePixText(recipient,25),place=normalizePixText(city,15);
 if(!name||!place||!Number.isSafeInteger(cents)||cents<=0||!key||!/^[\x20-\x7e]+$/.test(key)||key.length>77)throw Error("Dados Pix inválidos.");
 const account=field("00","br.gov.bcb.pix")+field("01",key);
 if(account.length>99)throw Error("Chave Pix longa demais para QR estático.");
 const base=field("00","01")+field("01","11")+field("26",account)+field("52","0000")+field("53","986")+field("54",(cents/100).toFixed(2))+field("58","BR")+field("59",name)+field("60",place)+field("62",field("05","***"))+"6304";
 return base+crc16(base);
}
export function qrGif(payload){const code=qrcode(0,"M");code.addData(payload);code.make();const data=code.createDataURL(5,20);return Uint8Array.from(atob(data.split(",")[1]),x=>x.charCodeAt(0));}

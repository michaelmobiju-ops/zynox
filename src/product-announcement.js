import {botTokenForStore} from "./custom-bots.js";
export const inventorySQL="SELECT v.*,(SELECT count(*) FROM stock st WHERE st.variant_id=v.id AND st.status IN ('available','reserved') AND NOT EXISTS(SELECT 1 FROM order_stock os JOIN orders o ON o.id=os.order_id WHERE os.stock_id=st.id AND o.status IN ('paid','delivering','delivered') AND v.infinite_stock=0)) AS on_hand,(SELECT count(*) FROM stock st WHERE st.variant_id=v.id AND st.status='available') AS available FROM variants v WHERE v.product_id=? ORDER BY v.name,v.id";
export const inventoryLabel=v=>v.infinite_stock&&v.on_hand>0?"Infinito":String(v.on_hand);
export function announcement(p,options){
 const price=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n/100);
 const multiple=Boolean(p.has_variations&&options.length>1);
 const lines=multiple?[]:options.map(v=>v.name.slice(0,80)+" • "+price(v.price_cents)+" • Estoque: "+inventoryLabel(v));
 const fields=[];let chunk="";for(const line of lines){if((chunk+"\n"+line).length>1000){fields.push({name:fields.length?"Estoque (continuação)":"Preços e estoque",value:chunk});chunk="";}chunk+=(chunk?"\n":"")+line;}if(chunk)fields.push({name:fields.length?"Estoque (continuação)":"Preços e estoque",value:chunk});
 const embed={title:p.name,description:String(p.description||"").slice(0,1900)||undefined,color:parseInt(p.color.slice(1),16),fields,...(p.image_url?{image:{url:p.image_url}}:{})};
 const components=multiple?[{type:1,components:[{type:3,custom_id:"pick:"+p.id,placeholder:"Escolha o produto",options:options.slice(0,25).map(v=>({label:v.name,value:v.id,description:price(v.price_cents)+" • Estoque: "+inventoryLabel(v)}))}]}]:[{type:1,components:[{type:2,style:1,label:p.button_text,custom_id:"buy:"+p.id,disabled:!options.some(v=>v.on_hand>0)}]}];
 return {embeds:[embed],components,allowed_mentions:{parse:[]}};
}
export async function refreshAnnouncement(env,orderId){
 const p=await env.DB.prepare("SELECT p.* FROM orders o JOIN variants v ON v.id=o.variant_id JOIN products p ON p.id=v.product_id AND p.store_id=o.store_id WHERE o.id=? AND p.status='active'").bind(orderId).first();
 if(!p?.message_id)return false;
 const token=await botTokenForStore(env,p.store_id);if(!token)return false;
 const options=(await env.DB.prepare(inventorySQL).bind(p.id).all()).results;
 const r=await fetch("https://discord.com/api/v10/channels/"+p.channel_id+"/messages/"+p.message_id,{method:"PATCH",headers:{Authorization:"Bot "+token,"Content-Type":"application/json"},body:JSON.stringify(announcement(p,options)),signal:AbortSignal.timeout(8000)});
 return r.ok;
}

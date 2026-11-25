const hex=s=>Uint8Array.from(String(s).match(/../g)||[],x=>parseInt(x,16));
const json=(data,status=200)=>Response.json(data,{status});
async function decryptStock(value,variantId,secret){
 const [ivHex,cipherHex]=String(value).split(":");
 const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),"HKDF",false,["deriveKey"]);
 const key=await crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:new TextEncoder().encode("zynox-stock-v1"),info:new TextEncoder().encode("encryption")},material,{name:"AES-GCM",length:256},false,["decrypt"]);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:hex(ivHex),additionalData:new TextEncoder().encode(variantId)},key,hex(cipherHex)));
}
async function deliver(env,orderId){
 const order=await env.DB.prepare("SELECT o.*,c.discord_id,v.id variant_id,p.name product_name,v.name variant_name FROM orders o JOIN customers c ON c.id=o.customer_id JOIN variants v ON v.id=o.variant_id JOIN products p ON p.id=v.product_id WHERE o.id=?").bind(orderId).first();
 if(!order||order.status!=="paid"||order.delivered_at||!env.DISCORD_BOT_TOKEN||!env.STOCK_ENCRYPTION_KEY)return;
 const item=await env.DB.prepare("SELECT s.id,s.key_encrypted FROM order_stock os JOIN stock s ON s.id=os.stock_id WHERE os.order_id=? AND s.status='reserved' LIMIT 1").bind(orderId).first();
 if(!item)return;
 const value=await decryptStock(item.key_encrypted,order.variant_id,env.STOCK_ENCRYPTION_KEY);
 const dm=await fetch("https://discord.com/api/v10/users/@me/channels",{method:"POST",headers:{Authorization:"Bot "+env.DISCORD_BOT_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({recipient_id:order.discord_id}),signal:AbortSignal.timeout(8000)});
 if(!dm.ok)return;
 const channel=await dm.json();
 const sent=await fetch("https://discord.com/api/v10/channels/"+channel.id+"/messages",{method:"POST",headers:{Authorization:"Bot "+env.DISCORD_BOT_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({content:"Pagamento confirmado!\\nProduto: "+order.product_name+" — "+order.variant_name+"\\nSua key: "+value,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(8000)});
 if(!sent.ok)return;
 await env.DB.batch([env.DB.prepare("UPDATE stock SET status='sold',reserved_until=NULL WHERE id=? AND status='reserved'").bind(item.id),env.DB.prepare("UPDATE orders SET delivered_at=datetime('now'),status='delivered' WHERE id=? AND status='paid' AND delivered_at IS NULL").bind(orderId)]);
}
export async function paymentWebhook(request,env){
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 const raw=await request.text();let event;try{event=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400);}
 let provider,paymentId;
 const asaasToken=request.headers.get("asaas-access-token");
 if(asaasToken&&env.ASAAS_WEBHOOK_TOKEN&&asaasToken===env.ASAAS_WEBHOOK_TOKEN){provider="asaas";paymentId=event.payment?.id;}
 else{
  const sig=request.headers.get("x-signature")||"",requestId=request.headers.get("x-request-id")||"",parts=Object.fromEntries(sig.split(",").map(x=>x.trim().split("=").map(y=>y.trim())));
  if(!env.MP_WEBHOOK_SECRET||!event.data?.id||!parts.ts||!parts.v1||!requestId)return json({error:"Unauthorized"},401);
  const manifest="id:"+String(event.data.id)+";request-id:"+requestId+";ts:"+parts.ts+";";
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.MP_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(manifest))),b=>b.toString(16).padStart(2,"0")).join("");
  if(digest!==parts.v1)return json({error:"Unauthorized"},401);
  provider="mercadopago";paymentId=String(event.data.id);
 }
 if(!paymentId)return json({received:true});
 const row=await env.DB.prepare("SELECT pay.*,g.provider,g.credentials_encrypted,o.id order_id,o.total_cents FROM payments pay JOIN gateways g ON g.id=pay.gateway_id JOIN orders o ON o.id=pay.order_id WHERE pay.external_id=? AND g.provider=?").bind(String(paymentId),provider).first();
 if(!row)return json({received:true});
 const [ivHex,cipherHex]=String(row.credentials_encrypted||"").split(":");
 if(!env.GATEWAY_ENCRYPTION_KEY||!ivHex||!cipherHex)return json({error:"Gateway configuration missing"},503);
 const cryptoKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.GATEWAY_ENCRYPTION_KEY),"AES-GCM",false,["decrypt"]);
 let token;try{token=new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:hex(ivHex)},cryptoKey,hex(cipherHex)));}catch{return json({error:"Gateway credential error"},500);}
 let confirmed=false,amount=0,reference="";
 if(provider==="asaas"){
  const base=row.provider==="asaas_sandbox"?"https://api-sandbox.asaas.com/v3":"https://api.asaas.com/v3";
  const res=await fetch(base+"/payments/"+encodeURIComponent(paymentId),{headers:{"access_token":token},signal:AbortSignal.timeout(10000)});
  if(!res.ok)return json({error:"Provider verification failed"},502);
  const p=await res.json();confirmed=["RECEIVED","CONFIRMED"].includes(p.status);amount=Math.round(Number(p.value)*100);reference=p.externalReference||"";
 }else{
  const res=await fetch("https://api.mercadopago.com/v1/payments/"+encodeURIComponent(paymentId),{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(10000)});
  if(!res.ok)return json({error:"Provider verification failed"},502);
  const p=await res.json();confirmed=p.status==="approved";amount=Math.round(Number(p.transaction_amount)*100);reference=p.external_reference||"";
 }
 if(!confirmed)return json({received:true});
 if(amount!==row.amount_cents||reference!=="zynox_"+row.order_id)return json({error:"Payment details mismatch"},409);
 const changed=await env.DB.prepare("UPDATE payments SET status='paid',paid_at=datetime('now') WHERE id=? AND status='pending'").bind(row.id).run();
 if(changed.meta.changes){await env.DB.prepare("UPDATE orders SET status='paid',paid_at=datetime('now') WHERE id=? AND status='pending'").bind(row.order_id).run();await deliver(env,row.order_id);}
 return json({received:true});
}

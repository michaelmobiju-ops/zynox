import {cart} from "./cart.js";
import {customBotToken} from "./custom-bots.js";
export class BotGateway {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.state="offline";this.seq=null;this.ack=true;this.socket=null;this.busy=false;this.epoch=0;this.lastReady=null;this.lastAck=null;this.lastError=null;}
 async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==="/status")return Response.json(await this.snapshot());
  if(path==="/presence"&&request.method==="POST"){const {presence}=await request.json();await this.ctx.storage.put("presence",presence);if(this.state==="online"&&this.socket)this.socket.send(JSON.stringify({op:3,d:presence}));return Response.json(await this.snapshot());}
  if(!["/start","/enable","/disable","/restart"].includes(path)||request.method!=="POST")return new Response(null,{status:404});
  const {storeId}=await request.json();
  await this.ctx.storage.put("storeId",storeId);
  if(path==="/disable"){
   await this.ctx.storage.put("enabled",false);
   this.epoch++;this.stop();await this.ctx.storage.deleteAlarm();
   return Response.json({state:"offline",enabled:false});
  }
  if(path==="/enable"||path==="/restart")await this.ctx.storage.put("enabled",true);
  if((await this.ctx.storage.get("enabled"))===false)return Response.json({state:"offline",enabled:false});
  if(path==="/restart"){this.epoch++;this.stop();}
  await this.ctx.storage.setAlarm(Date.now()+60000);
  if(!this.socket&&!this.busy)await this.start(storeId);
  return Response.json(await this.snapshot());
 }
 async snapshot(){return {state:this.state,enabled:(await this.ctx.storage.get("enabled"))!==false,presence:await this.ctx.storage.get("presence")||{status:"online",activities:[],afk:false,since:null},lastReady:this.lastReady,lastAck:this.lastAck,lastError:this.lastError};}
 stop(){clearInterval(this.heartbeat);const socket=this.socket;this.socket=null;this.state="offline";try{socket?.close(1000,"Reconnect");}catch{}}
 async alarm(){
  const id=await this.ctx.storage.get("storeId");
  if(!id||(await this.ctx.storage.get("enabled"))===false)return;
  await this.ctx.storage.setAlarm(Date.now()+60000);
  if(this.socket&&this.state==="online"){
   const row=await this.record(id);
   if(!row||row.token_cipher!==this.cipher){this.stop();}
  }
  if(!this.socket&&!this.busy)await this.start(id);
 }
 async record(id){return this.env.DB.prepare("SELECT cb.token_cipher,cb.application_id,s.guild_id FROM custom_bots cb JOIN stores s ON s.id=cb.store_id JOIN users u ON u.id=s.owner_id LEFT JOIN server_controls c ON c.store_id=s.id WHERE s.id=? AND u.status='active' AND COALESCE(c.enabled,1)=1 AND (u.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM subscriptions sub WHERE sub.user_id=u.id AND sub.status='active' AND (sub.lifetime=1 OR datetime(sub.expires_at)>datetime('now'))))").bind(id).first();}
 async start(id){
  if(this.busy||this.socket)return;
  const epoch=this.epoch;this.busy=true;this.state="connecting";
  try{
   const row=await this.record(id);
   if(!row){this.state="offline";await this.ctx.storage.deleteAlarm();return;}
   this.cipher=row.token_cipher;const presence=await this.ctx.storage.get("presence")||{status:"online",activities:[],afk:false,since:null};
   const token=await customBotToken(this.env,row);
   const res=await fetch("https://gateway.discord.gg/?v=10&encoding=json",{headers:{Upgrade:"websocket"}});
   const ws=res.webSocket;if(!ws)throw Error("Gateway unavailable");
   if(epoch!==this.epoch){ws.accept();ws.close(1000,"Cancelled");return;}
   this.socket=ws;this.seq=null;this.ack=true;
   const send=(op,d)=>ws.send(JSON.stringify({op,d}));
   const close=()=>{if(this.socket===ws)this.stop();};
   ws.addEventListener("close",close);ws.addEventListener("error",close);
   ws.addEventListener("message",event=>{
    if(this.socket!==ws)return;
    try{
     const p=JSON.parse(event.data);if(p.s!=null)this.seq=p.s;
     if(p.op===10){
      clearInterval(this.heartbeat);
      const beat=()=>{if(!this.ack){close();return;}this.ack=false;try{send(1,this.seq);}catch{close();}};
      this.heartbeat=setInterval(beat,p.d.heartbeat_interval);
      send(2,{token,intents:1,properties:{os:"linux",browser:"ZYNOX",device:"ZYNOX"},presence});
     }else if(p.op===11){this.ack=true;this.lastAck=new Date().toISOString();}
     else if(p.op===1){send(1,this.seq);}
     else if(p.op===7||p.op===9)close();
     else if(p.op===0&&p.t==="READY"){this.state="online";this.lastReady=new Date().toISOString();this.lastError=null;}
     else if(p.op===0&&p.t==="INTERACTION_CREATE")this.ctx.waitUntil(this.interaction(p.d,row).catch(()=>{}));
    }catch{close();}
   });
   ws.accept();
  }catch{if(epoch===this.epoch){this.lastError="Falha ao abrir conexão com Discord.";this.stop();}}finally{this.busy=false;}
 }
 async interaction(i,row){
  if(String(i.application_id)!==String(row.application_id)||String(i.guild_id)!==String(row.guild_id))return;
  if(!await this.record(await this.ctx.storage.get("storeId")))return;
  const replies={ping:"🏓 Pong! ZYNOX está respondendo.",zynox:"ZYNOX — automação de vendas.",ajuda:"Comandos: /ping, /zynox, /ajuda."};
  const send=async payload=>fetch("https://discord.com/api/v10/interactions/"+encodeURIComponent(i.id)+"/"+encodeURIComponent(i.token)+"/callback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if(i.type===2&&Object.hasOwn(replies,i.data?.name))return send({type:4,data:{content:replies[i.data.name],flags:64,allowed_mentions:{parse:[]}}});
  if([3,5].includes(i.type)&&/^(buy:|pick:|choose:|checkout:|close:|confirm-sale:|confirm-pix:)/.test(i.data?.custom_id||"")){
   const ack=await send({type:5,data:{flags:64}});if(!ack.ok)return;
   let result;try{result=await cart(i,this.env);}catch{}
   await fetch("https://discord.com/api/v10/webhooks/"+encodeURIComponent(row.application_id)+"/"+encodeURIComponent(i.token)+"/messages/@original",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(result?.data?{content:result.data.content,components:result.data.components||[],allowed_mentions:{parse:[]}}:{content:"Não foi possível concluir a operação."})});
  }
 }

}
export async function startGateway(env,storeId,action="start",extra={}){
 if(!env.BOT_GATEWAY)return {state:"unavailable",reason:"binding_missing"};
 try{const stub=env.BOT_GATEWAY.get(env.BOT_GATEWAY.idFromName(storeId));const res=await stub.fetch("https://internal/"+action,{method:"POST",body:JSON.stringify({storeId,...extra})});if(!res.ok)return {state:"unavailable",reason:"durable_object_http_"+res.status};return await res.json();}catch{return {state:"unavailable",reason:"durable_object_request_failed"};}
}

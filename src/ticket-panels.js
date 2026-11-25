const json=(x,s=200)=>Response.json(x,{status:s,headers:{"Cache-Control":"no-store"}});
const fail=(error,s=400)=>json({error},s);
const discord=(env,path,method="GET",body)=>fetch("https://discord.com/api/v10"+path,{method,headers:{Authorization:"Bot "+env.DISCORD_BOT_TOKEN,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(9000)});
const styles={roxo:1,cinza:2,verde:3,vermelho:4};
function components(panel){
 const items=JSON.parse(panel.options_json);
 if(panel.mode==="select")return [{type:1,components:[{type:3,custom_id:"ticket:"+panel.id,placeholder:"Escolha o atendimento",min_values:1,max_values:1,options:items.map((o,i)=>({label:o.label,value:String(i),description:o.description||undefined}))}]}];
 return items.map((o,i)=>({type:1,components:[{type:2,style:styles[o.color]||1,label:o.label,custom_id:"ticket:"+panel.id+":"+i}]}));
}
export async function ticketPanelApi(request,env,store,body){
 const url=new URL(request.url);
 if(request.method==="GET"){
  try{return json({panels:(await env.DB.prepare("SELECT * FROM ticket_panels WHERE store_id=? ORDER BY created_at DESC LIMIT 30").bind(store.id).all()).results.map(p=>({...p,options:JSON.parse(p.options_json),options_json:undefined}))});}
  catch(e){if(String(e).includes("ticket_panels"))return fail("Aplique a migração 0009 no banco D1.",503);throw e;}
 }
 const title=String(body.title||"").trim(),description=String(body.description||"").trim(),mode=body.mode,channel=String(body.channel_id||"");
 const options=body.options;
 if(!title||title.length>256||description.length>4000||!["buttons","select"].includes(mode)||!/^\d{17,20}$/.test(channel)||!Array.isArray(options)||options.length<1||options.length>5||options.some(o=>!o||typeof o.label!=="string"||!o.label.trim()||o.label.length>80||!Object.hasOwn(styles,o.color)||String(o.description||"").length>100))return fail("Confira o título, canal, modo e até cinco opções de atendimento.");
 const previous=body.panel_id?await env.DB.prepare("SELECT * FROM ticket_panels WHERE id=? AND store_id=?").bind(String(body.panel_id),store.id).first():null;
 if(body.panel_id&&!previous)return fail("Anúncio não encontrado.",404);
 if(previous&&previous.channel_id!==channel)return fail("Para mudar de canal, crie um novo anúncio.",409);
 const id=previous?.id||crypto.randomUUID();
 const panel={id,mode,options_json:JSON.stringify(options)};
 const payload={embeds:[{title,description,color:0x7135ff}],components:components(panel),allowed_mentions:{parse:[]}};
 const response=await discord(env,"/channels/"+channel+"/messages"+(previous?.message_id?"/"+previous.message_id:""),previous?.message_id?"PATCH":"POST",payload);
 if(!response.ok)return fail("O Discord recusou o anúncio. Confira se o bot pode enviar mensagens e embeds no canal.",502);
 const message=await response.json();
 try{
  await env.DB.prepare("INSERT INTO ticket_panels(id,store_id,channel_id,message_id,title,description,mode,options_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET message_id=excluded.message_id,title=excluded.title,description=excluded.description,mode=excluded.mode,options_json=excluded.options_json").bind(id,store.id,channel,message.id,title,description,mode,panel.options_json).run();
 }catch(e){if(String(e).includes("ticket_panels"))return fail("Anúncio publicado, mas não salvo. Aplique a migração 0009 antes de usar.",503);throw e;}
 return json({success:true,id,message_id:message.id});
}
export async function ticketInteraction(interaction,env){
 const cid=String(interaction.data?.custom_id||"");if(!cid.startsWith("ticket:"))return null;
 const parts=cid.split(":"),id=parts[1],user=interaction.member?.user||interaction.user;
 const ephemeral=content=>({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
 if(!user?.id||!interaction.guild_id)return ephemeral("Atendimento disponível apenas dentro do servidor.");
 const panel=await env.DB.prepare("SELECT p.*,s.guild_id FROM ticket_panels p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND s.guild_id=?").bind(id,interaction.guild_id).first();
 if(!panel)return ephemeral("Anúncio não encontrado ou desativado.");
 const index=panel.mode==="select"?Number(interaction.data?.values?.[0]):Number(parts[2]);
 const opts=JSON.parse(panel.options_json);if(!Number.isInteger(index)||index<0||index>=opts.length)return ephemeral("Opção inválida.");
 const reason=opts[index].label;
 const channelName="ticket-"+user.id.slice(-8)+"-"+crypto.randomUUID().slice(0,4);
 const permissions=[{id:interaction.guild_id,type:0,deny:"1024",allow:"0"},{id:user.id,type:1,allow:"3072",deny:"0"},{id:env.DISCORD_CLIENT_ID,type:1,allow:"3072",deny:"0"}];
 const created=await discord(env,"/guilds/"+interaction.guild_id+"/channels","POST",{name:channelName,type:0,permission_overwrites:permissions,topic:"ZYNOX ticket • "+reason+" • "+user.id});
 if(!created.ok)return ephemeral("Não foi possível abrir o ticket. O bot precisa da permissão Gerenciar Canais.");
 const channel=await created.json();
 try{
  await env.DB.prepare("INSERT INTO tickets(id,store_id,subject,channel_id,status) VALUES(?,?,?,?,'open')").bind(crypto.randomUUID(),panel.store_id,reason,channel.id).run();
 }catch(e){return ephemeral("Canal criado, mas não foi possível registrar o ticket. Avise o suporte do servidor: <#"+channel.id+">");}
 await discord(env,"/channels/"+channel.id+"/messages","POST",{content:"<@"+user.id+"> Seu atendimento foi aberto: **"+reason+"**. Aguarde a equipe.",allowed_mentions:{users:[user.id]}});
 return ephemeral("Ticket criado: <#"+channel.id+">");
}

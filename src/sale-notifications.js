export async function announceSale(env,orderId){
  if(!env.DISCORD_BOT_TOKEN)return false;
  let row;
  try{
    row=await env.DB.prepare("SELECT n.channel_id,n.template,n.image_url,o.id,o.total_cents,p.name AS product_name,c.discord_id,c.username FROM orders o JOIN stores st ON st.id=o.store_id JOIN sale_notifications n ON n.store_id=st.id AND n.enabled=1 JOIN customers c ON c.id=o.customer_id JOIN variants v ON v.id=o.variant_id JOIN products p ON p.id=v.product_id WHERE o.id=? AND o.status IN ('paid','delivering','delivered')").bind(orderId).first();
  }catch{return false;}
  if(!row)return false;
  const money=(row.total_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const username=row.username||"Cliente Discord";
  const templates={
    classic:{title:"🎉 Nova venda confirmada!",description:"**Produto:** "+row.product_name+"\n**Comprador:** "+username+"\n**Valor:** "+money,color:7419391},
    compact:{title:"💜 Venda realizada",description:username+" comprou **"+row.product_name+"** por **"+money+"**.",color:7419391},
    premium:{title:"✦ ZYNOX • VENDA APROVADA",description:"🛍️ "+row.product_name+"\n👤 "+username+"\n💰 Receita bruta: "+money,color:12616956}
  };
  const embed=templates[row.template]||templates.classic;
  if(row.image_url)embed.image={url:row.image_url};
  const response=await fetch("https://discord.com/api/v10/channels/"+encodeURIComponent(row.channel_id)+"/messages",{method:"POST",headers:{Authorization:"Bot "+env.DISCORD_BOT_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({embeds:[embed],allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(8000)});
  return response.ok;
}

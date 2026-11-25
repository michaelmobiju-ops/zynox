export async function cart(interaction,env){
 const reply=(content,components=[])=>({type:4,data:{content,components,flags:64,allowed_mentions:{parse:[]}}});
 const custom=interaction.data?.custom_id||"";
 if(!custom.startsWith("buy:")&&!custom.startsWith("choose:"))return null;
 const choosing=custom.startsWith("choose:");
 const id=custom.slice(choosing?7:4);
 const p=await env.DB.prepare("SELECT p.*,s.guild_id FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND p.status='active'").bind(id).first();
 if(!p||p.guild_id!==interaction.guild_id||p.channel_id!==interaction.channel_id||(!choosing&&p.message_id!==interaction.message?.id))return reply("Produto indisponível.");
 const variants=(await env.DB.prepare("SELECT v.*,(SELECT count(*) FROM stock WHERE variant_id=v.id AND status='available') AS available FROM variants v WHERE product_id=?").bind(id).all()).results;
 const available=variants.filter(v=>v.available>0);
 if(!available.length)return reply("Produto sem estoque.");
 if(choosing){
  const v=available.find(v=>v.id===interaction.data?.values?.[0]);
  if(!v)return reply("Variação indisponível.");
  return reply("Selecionado: "+p.name+" — "+v.name+"\\nTotal: R$ "+(v.price_cents/100).toFixed(2)+"\\nPix ainda indisponível. Nenhuma reserva ou cobrança realizada.");
 }
 return reply("Carrinho privado — "+p.name+"\n"+available.map(v=>v.name+" — R$ "+(v.price_cents/100).toFixed(2)).join("\n")+"\nPagamento ainda indisponível. Nenhuma cobrança ou reserva foi realizada.",[{type:1,components:[{type:3,custom_id:"choose:"+p.id,placeholder:"Selecione a variação",options:available.slice(0,25).map(v=>({label:v.name,value:v.id,description:"R$ "+(v.price_cents/100).toFixed(2)}))}]}]);
}

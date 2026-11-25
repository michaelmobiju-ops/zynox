export async function cart(interaction,env){
 const reply=(content,components=[])=>({type:4,data:{content,components,flags:64,allowed_mentions:{parse:[]}}});
 const custom=interaction.data?.custom_id||"";
 if(!custom.startsWith("buy:"))return null;
 const id=custom.slice(4);
 const p=await env.DB.prepare("SELECT p.*,s.guild_id FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND p.status='active'").bind(id).first();
 if(!p||p.guild_id!==interaction.guild_id||p.channel_id!==interaction.channel_id||p.message_id!==interaction.message?.id)return reply("Produto indisponível.");
 const variants=(await env.DB.prepare("SELECT v.*,(SELECT count(*) FROM stock WHERE variant_id=v.id AND status='available') AS available FROM variants v WHERE product_id=?").bind(id).all()).results;
 const available=variants.filter(v=>v.available>0);
 if(!available.length)return reply("Produto sem estoque.");
 return reply("Carrinho privado — "+p.name+"\n"+available.map(v=>v.name+" — R$ "+(v.price_cents/100).toFixed(2)).join("\n")+"\nPagamento ainda indisponível. Nenhuma cobrança ou reserva foi realizada.");
}

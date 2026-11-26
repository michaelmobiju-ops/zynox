const reply=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"public, max-age=20","X-Content-Type-Options":"nosniff"}});
export async function storefront(request,env){
 if(request.method!=="GET")return reply({error:"Método não permitido."},405);
 const url=new URL(request.url);
 const storeId=url.pathname.startsWith("/api/storefront/")?url.pathname.slice("/api/storefront/".length):url.pathname.slice("/loja/".length);
 if(!/^[a-f0-9-]{36}$/i.test(storeId))return reply({error:"Loja não encontrada."},404);
 const store=await env.DB.prepare("SELECT id,name,guild_id FROM stores WHERE id=?").bind(storeId).first();
 if(!store)return reply({error:"Loja não encontrada."},404);
 const products=(await env.DB.prepare("SELECT p.id,p.name,p.description,p.image_url,p.color,p.has_variations,p.created_at, MIN(v.price_cents) AS starting_price_cents, SUM(CASE WHEN v.infinite_stock=1 AND EXISTS(SELECT 1 FROM stock st WHERE st.variant_id=v.id AND st.status='available') THEN 1 WHEN v.infinite_stock=0 THEN (SELECT COUNT(*) FROM stock st WHERE st.variant_id=v.id AND st.status='available') ELSE 0 END) AS available_units FROM products p JOIN variants v ON v.product_id=p.id WHERE p.store_id=? AND p.status='active' GROUP BY p.id ORDER BY p.created_at DESC LIMIT 100").bind(storeId).all()).results;
 return reply({store:{id:store.id,name:store.name},products:products.map(p=>({...p,available_units:Number(p.available_units||0)})),checkout_available:false});
}

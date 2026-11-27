export async function checkoutBrand(env,storeId){
 try{const r=await env.DB.prepare("SELECT commercial_name,accent_color,receipt_footer FROM store_branding WHERE store_id=?").bind(storeId).first();return {name:String(r?.commercial_name||"ZYNOX").slice(0,100),color:/^#[0-9a-f]{6}$/i.test(r?.accent_color||"")?parseInt(r.accent_color.slice(1),16):null,footer:String(r?.receipt_footer||"").slice(0,500)};}catch{return {name:"ZYNOX",color:null,footer:""};}
}
export function receipt(order,brand){
 const amount=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(order.total_cents/100);
 return {title:"Compra confirmada",color:brand.color??0x22c55e,author:{name:brand.name},fields:[{name:"Produto",value:String(order.product_name+" • "+order.variant_name).slice(0,1024)},{name:"Total",value:amount,inline:true},{name:"Pedido",value:order.id,inline:true}],footer:{text:brand.footer||"Comprovante comercial • não substitui documento fiscal"}};
}

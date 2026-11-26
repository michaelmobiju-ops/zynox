const catalog=document.getElementById("catalog"),search=document.getElementById("search"),title=document.getElementById("name"),error=document.getElementById("error");let products=[];
const money=cents=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
function render(){
 catalog.replaceChildren();
 const query=search.value.trim().toLocaleLowerCase("pt-BR");
 const filtered=products.filter(p=>p.name.toLocaleLowerCase("pt-BR").includes(query));
 if(!filtered.length){const empty=document.createElement("p");empty.textContent="Nenhum produto encontrado.";catalog.append(empty);return;}
 for(const p of filtered){
  const card=document.createElement("article");
  if(p.image_url){try{const url=new URL(p.image_url);if(url.protocol==="https:"){const img=document.createElement("img");img.src=url.href;img.alt="Imagem de "+p.name;img.loading="lazy";card.append(img);}}catch{}}
  const h=document.createElement("h2");h.textContent=p.name;card.append(h);
  if(p.description){const desc=document.createElement("p");desc.textContent=p.description;card.append(desc);}
  const price=document.createElement("b");price.textContent="A partir de "+money(p.starting_price_cents);card.append(price);
  const stock=document.createElement("p");stock.textContent=p.available_units>0?"Disponível":"Indisponível";card.append(stock);
  catalog.append(card);
 }
}
search.addEventListener("input",render);
(async()=>{try{
 const id=location.pathname.split("/").filter(Boolean).at(-1);
 const response=await fetch("/api/storefront/"+encodeURIComponent(id));
 const data=await response.json();if(!response.ok)throw Error(data.error||"Não foi possível carregar a loja.");
 title.textContent=data.store.name;document.title=data.store.name+" • ZYNOX";products=data.products;render();
}catch(e){title.textContent="Loja indisponível";error.textContent=e.message;}})();

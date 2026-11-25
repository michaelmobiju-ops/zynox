const ZYNOX = {
  user: null,
  subscription: null,
  currentPage: "home"
};

const pageNames = {
  home: "Início",
  dashboard: "Dashboard",
  bot: "Meu bot",
  servers: "Servidores",
  products: "Produtos",
  stock: "Estoque",
  sales: "Vendas",
  coupons: "Cupons e ofertas",
  customers: "Clientes",
  automations: "Automações",
  tickets: "Tickets",
  payments: "Pagamentos",
  gateways: "Gateways e bancos",
  wallet: "Carteira digital",
  ai: "Zynox AI",
  reports: "Relatórios",
  integrations: "Integrações",
  plans: "Planos",
  licenses: "Licenças",
  notifications: "Notificações",
  settings: "Configurações",
  support: "Suporte",
  account: "Minha conta",
  control: "ZYNOX CONTROL"
};

let homeContent = "";

function element(id) {
  return document.getElementById(id);
}

function isAdmin() {
  return ["owner", "admin"].includes(
    ZYNOX.user?.role
  );
}

function isOwner() {
  return ZYNOX.user?.role === "owner";
}

function node(tag, text, className) {
  const item = document.createElement(tag);

  if (text !== undefined) {
    item.textContent = text;
  }

  if (className) {
    item.className = className;
  }

  return item;
}

function openMenu() {
  element("sidebar")?.classList.add("open");
  element("overlay")?.classList.add("active");

  if (element("overlay")) {
    element("overlay").hidden = false;
  }
}

function closeMenu() {
  element("sidebar")?.classList.remove("open");
  element("overlay")?.classList.remove("active");

  if (element("overlay")) {
    element("overlay").hidden = true;
  }
}

async function api(path, body) {
  const options = {
    credentials: "same-origin",
    cache: "no-store"
  };

  if (body !== undefined) {
    options.method = "POST";
    options.headers = {
      "Content-Type": "application/json"
    };
    options.body = JSON.stringify(body);
  }

  const response = await fetch(path, options);

  if (response.status === 401) {
    window.location.replace("/");
    throw new Error("Sessão encerrada.");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Não foi possível concluir."
    );
  }

  return data;
}

function panel(title, description) {
  const box = node("section", undefined, "control-panel");

  box.appendChild(node("h2", title));

  if (description) {
    box.appendChild(node("p", description));
  }

  return box;
}

function button(text, action, danger = false) {
  const item = node(
    "button",
    text,
    danger ? "control-danger" : "control-button"
  );

  item.type = "button";

  item.addEventListener("click", async () => {
    if (item.disabled) return;

    item.disabled = true;

    try {
      await action();
    } catch (error) {
      alert(error.message);
    } finally {
      item.disabled = false;
    }
  });

  return item;
}

function input(placeholder, type = "text") {
  const item = node("input");

  item.type = type;
  item.placeholder = placeholder;
  item.className = "control-input";

  return item;
}

function select(options) {
  const item = node("select");

  item.className = "control-input";

  options.forEach(([value, label]) => {
    const option = node("option", label);
    option.value = value;
    item.appendChild(option);
  });

  return item;
}

function field(label, item) {
  const wrapper = node("label", undefined, "control-field");

  wrapper.appendChild(node("span", label));
  wrapper.appendChild(item);

  return wrapper;
}

function formatDate(value) {
  if (!value) return "—";

  const normalized = String(value).includes("T")
    ? value
    : String(value).replace(" ", "T") + "Z";

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("pt-BR");
}

function updateProfile() {
  const user = ZYNOX.user;

  if (!user) return;

  const role = user.role === "owner"
    ? "DONO"
    : user.role === "admin"
      ? "ADM"
      : ZYNOX.subscription?.plan?.toUpperCase()
        || "SEM PLANO";

  if(element("selected-server"))element("selected-server").textContent=ZYNOX.store?.name||"Selecionar servidor";
  if (element("username")) {
    element("username").textContent = user.username;
  }

  if (element("user-plan")) {
    element("user-plan").textContent = role;
  }

  if (element("welcome-name")) {
    element("welcome-name").textContent = user.username;
  }

  if (element("admin-navigation")) {
    element("admin-navigation").hidden = !isAdmin();
  }
}

function renderAccount() {
  const box = panel(
    "Minha conta",
    "Informações da sua conta ZYNOX."
  );

  box.append(
    node("p", "Usuário: " + ZYNOX.user.username),
    node("p", "ID: " + ZYNOX.user.id),
    node("p", "Cargo: " + ZYNOX.user.role),
    node("p", "Discord: " + (
      ZYNOX.user.discord_id || "Não vinculado"
    ))
  );

  element("main-content").appendChild(box);
}

function renderPlans() {
  const box = panel("Minha assinatura");

  if (isAdmin()) {
    box.appendChild(
      node("p", "Acesso administrativo ilimitado.")
    );
  } else {
    const sub = ZYNOX.subscription;

    box.append(
      node("p", "Plano: " + (sub?.plan || "Nenhum")),
      node("p", "Validade: " + (
        sub?.lifetime
          ? "Vitalício"
          : formatDate(sub?.expires_at)
      ))
    );
  }

  element("main-content").appendChild(box);
}

// ESTATÍSTICAS ADMINISTRATIVAS

async function controlStats(container) {
  const data = await api("/api/control/stats");

  const grid = node("div", undefined, "control-grid");

  const items = [
    ["Assinantes", data.subscribers],
    ["Assinaturas ativas", data.activeSubscriptions],
    ["Contas suspensas", data.suspended],
    ["Keys disponíveis", data.availableLicenses],
    ["Administradores", data.administrators]
  ];

  items.forEach(([label, value]) => {
    const card = node("div", undefined, "control-stat");

    card.append(
      node("p", label),
      node("h2", String(value))
    );

    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// GERADOR DE LICENÇAS

async function controlLicenses(container) {
  if (!isOwner()) return;

  const box = panel(
    "Gerador de licenças",
    "Crie keys de assinatura exclusivas."
  );

  const plan = select([
    ["starter", "Starter"],
    ["pro", "Pro"],
    ["premium", "Premium"]
  ]);

  const duration = input("Duração", "number");
  duration.value = "30";
  duration.min = "1";

  const unit = select([
    ["minutes", "Minutos"],
    ["hours", "Horas"],
    ["days", "Dias"],
    ["months", "Meses"],
    ["years", "Anos"]
  ]);

  unit.value = "days";

  const quantity = input("Quantidade", "number");
  quantity.value = "1";
  quantity.min = "1";
  quantity.max = "50";

  const lifetime = input("", "checkbox");

  lifetime.addEventListener("change", () => {
    duration.disabled = lifetime.checked;
    unit.disabled = lifetime.checked;
  });

  const output = node("textarea");
  output.className = "control-input";
  output.readOnly = true;
  output.rows = 6;
  output.placeholder = "As keys aparecerão aqui.";

  box.append(
    field("Plano", plan),
    field("Duração", duration),
    field("Unidade", unit),
    field("Quantidade", quantity),
    field("Vitalício", lifetime),

    button("Gerar licenças", async () => {
      const data = await api(
        "/api/owner/licenses/create",
        {
          plan: plan.value,
          duration: Number(duration.value),
          unit: unit.value,
          duration_unit: unit.value,
          quantity: Number(quantity.value),
          lifetime: lifetime.checked
        }
      );

      const keys = data.keys || data.licenses || [];

      output.value = keys.map(item =>
        typeof item === "string" ? item : item.key
      ).filter(Boolean).join("\n");

      if (!output.value) {
        alert("Confira a resposta da API de licenças.");
        return;
      }

      alert("Keys geradas. Copie e guarde agora.");
    }),

    output,

    button("Copiar todas as keys", async () => {
      if (!output.value) {
        throw new Error("Nenhuma key gerada.");
      }

      await navigator.clipboard.writeText(output.value);
      alert("Keys copiadas!");
    })
  );

  container.appendChild(box);

  const history = panel("Histórico de licenças");

  const data = await api("/api/owner/licenses/list");

  const licenses = data.licenses || [];

  if (!licenses.length) {
    history.appendChild(
      node("p", "Nenhuma licença encontrada.")
    );
  }

  licenses.forEach(license => {
    const card = node("div", undefined, "control-item");

    card.append(
      node("h3", String(license.plan).toUpperCase()),
      node("p", "ID: " + license.id),
      node("p", "Status: " + license.status),
      node("p", "Criada em: " + formatDate(
        license.created_at
      )),
      node("p", "Utilizada por: " + (
        license.username ||
        license.redeemed_username ||
        license.redeemed_by ||
        "Ninguém"
      ))
    );

    if (license.status !== "revoked") {
      card.appendChild(
        button("Revogar licença", async () => {
          if (!confirm("Revogar esta licença?")) return;

          await api(
            "/api/owner/licenses/revoke",
            { id: license.id }
          );

          alert("Licença revogada.");
          await renderControl("licenses");
        }, true)
      );
    }

    history.appendChild(card);
  });

  container.appendChild(history);
}

// GERENCIAMENTO DE ASSINANTES

async function controlUsers(container) {
  const box = panel(
    "Gerenciar assinantes",
    "Controle contas, planos e períodos."
  );

  const data = await api("/api/control/users");
  const users = data.users || [];

  const search = input("Buscar usuário ou ID Discord");
  const list = node("div");

  function draw() {
    list.replaceChildren();

    const query = search.value.toLowerCase();

    const filtered = users.filter(user =>
      [
        user.username,
        user.discord_id,
        user.id
      ].some(value =>
        String(value || "").toLowerCase().includes(query)
      )
    );

    if (!filtered.length) {
      list.appendChild(node("p", "Nenhum assinante encontrado."));
    }

    filtered.forEach(user => {
      const card = node("div", undefined, "control-item");

      const plan = select([
        ["starter", "Starter"],
        ["pro", "Pro"],
        ["premium", "Premium"]
      ]);

      plan.value = user.plan || "starter";

      const days = input("Novo período em dias", "number");
      days.value = "30";
      days.min = "1";
      days.max = "36500";

      const lifetime = input("", "checkbox");

      lifetime.checked = Boolean(user.lifetime);
      days.disabled = lifetime.checked;

      lifetime.addEventListener("change", () => {
        days.disabled = lifetime.checked;
      });

      card.append(
        node("h3", user.username),
        node("p", "Discord: " + (user.discord_id || "—")),
        node("p", "Conta: " + user.status),
        node("p", "Plano atual: " + (user.plan || "Nenhum")),
        node("p", "Assinatura: " + (
          user.subscription_status || "Nenhuma"
        )),
        node("p", "Validade: " + (
          user.lifetime
            ? "Vitalício"
            : formatDate(user.expires_at)
        )),

        field("Novo plano", plan),
        field("Novo período em dias", days),
        field("Vitalício", lifetime),

        button("Atualizar assinatura", async () => {
          if (!confirm(
            "Substituir o período atual da assinatura?"
          )) return;

          await api(
            "/api/control/subscriptions/update",
            {
              id: user.id,
              plan: plan.value,
              days: Number(days.value),
              lifetime: lifetime.checked
            }
          );

          alert("Assinatura atualizada.");
          await renderControl("users");
        }),

        button(
          user.status === "suspended"
            ? "Reativar conta"
            : "Suspender conta",

          async () => {
            const status = user.status === "suspended"
              ? "active"
              : "suspended";

            if (!confirm("Alterar status desta conta?")) return;

            await api(
              "/api/control/users/status",
              { id: user.id, status }
            );

            await renderControl("users");
          },

          user.status !== "suspended"
        ),

        button("Cancelar assinatura", async () => {
          if (!confirm("Cancelar esta assinatura?")) return;

          await api(
            "/api/control/subscriptions/cancel",
            { id: user.id }
          );

          await renderControl("users");
        }, true)
      );

      list.appendChild(card);
    });
  }

  search.addEventListener("input", draw);

  box.append(search, list);
  container.appendChild(box);

  draw();
}

// ADMINISTRADORES

async function controlAdmins(container) {
  if (!isOwner()) return;

  const box = panel(
    "Criar administrador",
    "Acesso exclusivo do proprietário."
  );

  const username = input("Nome de usuário");
  username.autocomplete = "off";
  username.autocapitalize = "none";

  const password = input("Senha segura", "password");
  password.autocomplete = "new-password";
  password.minLength = 12;

  box.append(
    field("Usuário", username),
    field("Senha", password),

    button("Criar administrador", async () => {
      try {
        await api(
          "/api/control/admins/create",
          {
            username: username.value.trim().toLowerCase(),
            password: password.value
          }
        );

        alert("Administrador criado.");
        await renderControl("admins");

      } finally {
        password.value = "";
      }
    })
  );

  container.appendChild(box);

  const list = panel("Administradores cadastrados");

  const data = await api("/api/control/admins");

  (data.admins || []).forEach(admin => {
    const card = node("div", undefined, "control-item");

    card.append(
      node("h3", admin.username),
      node("p", "Status: " + admin.status),
      node("p", "Criado em: " + formatDate(admin.created_at)),

      button(
        admin.status === "suspended"
          ? "Reativar administrador"
          : "Suspender administrador",

        async () => {
          if (!confirm("Alterar status do administrador?")) return;

          await api(
            "/api/control/admins/status",
            {
              id: admin.id,
              status: admin.status === "suspended"
                ? "active"
                : "suspended"
            }
          );

          await renderControl("admins");
        },

        admin.status !== "suspended"
      )
    );

    list.appendChild(card);
  });

  if (!(data.admins || []).length) {
    list.appendChild(
      node("p", "Nenhum administrador cadastrado.")
    );
  }

  container.appendChild(list);
}

// HISTÓRICO ADMINISTRATIVO

async function controlLogs(container) {
  if (!isOwner()) return;

  const box = panel("Histórico administrativo");

  const data = await api("/api/control/logs");

  (data.logs || []).forEach(log => {
    const card = node("div", undefined, "control-item");

    card.append(
      node("h3", log.action),
      node("p", "Responsável: " + (
        log.username || "Sistema"
      )),
      node("p", formatDate(log.created_at)),
      node("p", log.details || "")
    );

    box.appendChild(card);
  });

  container.appendChild(box);
}

// INTERFACE ZYNOX CONTROL

async function renderControl(tab = "stats") {
  if (!isAdmin()) return;

  if (ZYNOX.currentPage !== "control") return;

  const main = element("main-content");

  main.replaceChildren();

  const header = panel(
    "ZYNOX CONTROL",
    isOwner()
      ? "Painel exclusivo do proprietário."
      : "Painel de administração."
  );

  const navigation = node(
    "div",
    undefined,
    "control-navigation"
  );

  const tabs = [
    ["stats", "Visão geral"],
    ["users", "Assinantes"]
  ];

  if (isOwner()) {
    tabs.push(
      ["licenses", "Licenças"],
      ["admins", "Administradores"],
      ["logs", "Histórico"]
    );
  }

  tabs.forEach(([key, label]) => {
    const item = button(label, () => renderControl(key));

    if (tab === key) {
      item.classList.add("selected");
    }

    navigation.appendChild(item);
  });

  header.appendChild(navigation);

  main.appendChild(header);

  const content = node("div", undefined, "control-content");

  const loading = node("p", "Carregando...");

  content.appendChild(loading);
  main.appendChild(content);

  try {
    loading.remove();

    if (tab === "stats") {
      await controlStats(content);
    }

    if (tab === "users") {
      await controlUsers(content);
    }

    if (tab === "licenses") {
      await controlLicenses(content);
    }

    if (tab === "admins") {
      await controlAdmins(content);
    }

    if (tab === "logs") {
      await controlLogs(content);
    }

  } catch (error) {
    content.appendChild(
      node("p", error.message, "control-error")
    );

    content.appendChild(
      button("Tentar novamente", () => renderControl(tab))
    );
  }
}

// NAVEGAÇÃO PRINCIPAL

async function loadHomeDashboard() {
  const main=element("main-content");
  const selector=element("dashboard-store");
  if(selector&&ZYNOX.store){selector.replaceChildren(new Option(ZYNOX.store.name,ZYNOX.store.id));selector.disabled=true;}
  const status=element("dashboard-status");
  if(!selector||!status)return;
  const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n||0)/100);
  let serial=0;
  async function refresh(){
    const current=++serial;
    status.textContent="Atualizando indicadores...";
    try{
      const d=await api("/api/dashboard/summary?store="+encodeURIComponent(selector.value));
      if(current!==serial||!main.contains(selector))return;
      if(!ZYNOX.store&&selector.options.length===1){for(const s of d.stores)selector.append(new Option(s.name,s.id));}
      const m=d.metrics;
      element("total-revenue").textContent=money(m.revenue_cents);
      element("total-sales").textContent=String(m.sales);
      element("total-products").textContent=String(m.products);
      element("total-customers").textContent=String(m.customers);
      status.textContent=d.stores.length?"Indicadores atualizados.":"Vincule uma loja em Servidores para começar.";
      const chart=element("sales-chart");chart.replaceChildren();
      const days=new Map(d.days.map(x=>[x.day,x]));
      const series=Array.from({length:7},(_,i)=>{const date=new Date();date.setUTCDate(date.getUTCDate()-6+i);const day=date.toISOString().slice(0,10);return {day,cents:Number(days.get(day)?.cents||0)};});
      const max=Math.max(1,...series.map(x=>x.cents));
      for(const item of series){const row=node("div",undefined,"home-chart-row"),label=node("span",item.day.slice(8)+"/"+item.day.slice(5,7)),track=node("div",undefined,"home-chart-track"),bar=node("div",undefined,"home-chart-bar"),value=node("span",money(item.cents));bar.style.width=(100*item.cents/max)+"%";track.append(bar);row.append(label,track,value);chart.append(row);}
      const recent=element("recent-activities");recent.replaceChildren();
      const labels={pending:"Pendente",paid:"Pago",delivered:"Entregue",cancelled:"Cancelado",expired:"Expirado"};
      for(const o of d.recent){const c=node("div",undefined,"control-item");c.append(node("strong",o.product_name+" · "+money(o.total_cents)),node("p",o.store_name+" · "+(labels[o.status]||o.status)+" · "+formatDate(o.created_at)));recent.append(c);}
      if(!d.recent.length)recent.append(node("p","Nenhum pedido registrado."));
    }catch(e){if(current===serial&&main.contains(selector))status.textContent=e.message;}
  }
  selector.addEventListener("change",refresh);
  element("dashboard-refresh")?.addEventListener("click",refresh);
  await refresh();
}

function navigate(page) {
  if (!pageNames[page]) return;
  if (!ZYNOX.store && !["servers","control","account","plans","licenses","support","notifications"].includes(page)) page="servers";

  if (page === "control" && !isAdmin()) return;

  ZYNOX.currentPage = page;

  closeMenu();

  document.querySelectorAll("[data-page]").forEach(item => {
    item.classList.toggle(
      "active",
      item.dataset.page === page
    );
  });

  const main = element("main-content");

  main.replaceChildren();

  if (page === "home" || page === "dashboard") {
    main.innerHTML = homeContent;
    updateProfile();
    loadHomeDashboard();
    return;
  }

  if (page === "control") {
    renderControl();
    return;
  }

  if (page === "products" || page === "stock") {
    const box=panel("Produtos","Crie, edite e gerencie o estoque de cada produto em um só lugar.");
    const stores=select([["","Selecione a loja"]]),status=node("p","Carregando lojas..."),listing=node("div"),editor=node("div");
    let data={products:[],variants:[]},generation=0;
    const add=button("+ Adicionar produto",()=>openEditor(null));add.disabled=true;
    box.append(field("Loja",stores),add,status,editor,listing);main.append(box);
    async function load(){
      const id=stores.value,version=++generation;listing.replaceChildren();editor.replaceChildren();add.disabled=!id;
      if(!id){status.textContent="Selecione a loja.";return;}
      status.textContent="Carregando produtos...";
      const d=await api("/api/commerce/products?store="+encodeURIComponent(id));if(version!==generation)return;
      data=d;status.textContent=d.products.length+" produto(s) cadastrado(s).";
      for(const p of d.products){
        const card=node("div",undefined,"control-item");card.style.borderLeft="4px solid "+p.color;
        if(p.image_url){const img=node("img");img.src=p.image_url;img.alt="Imagem do produto";img.loading="lazy";img.referrerPolicy="no-referrer";img.style.cssText="width:100%;max-width:220px;max-height:120px;object-fit:contain;border-radius:8px;";card.append(img);}
        card.append(node("h3",p.name),node("p",p.status==="active"?"Publicado":p.status==="draft"?"Rascunho":p.status));
        for(const v of d.variants.filter(v=>v.product_id===p.id))card.append(node("p",v.name+" — R$ "+(v.price_cents/100).toFixed(2).replace(".",",")+" • Estoque: "+(v.infinite_stock?"Infinito":v.available)));
        card.append(button("Editar produto",()=>openEditor(p)),button(p.message_id?"Atualizar anúncio":"Publicar no Discord",async()=>{await api("/api/commerce/publish",{store_id:id,product_id:p.id});await load();}));listing.append(card);
      }if(!d.products.length)listing.append(node("p","Nenhum produto cadastrado. Clique em Adicionar produto."));
    }
    async function openEditor(product){
      const id=stores.value;if(!id)return;
      editor.replaceChildren();const form=node("div",undefined,"control-item");
      editor.append(form);form.append(node("h3",product?"Editar produto":"Adicionar produto"));
      const name=input("Nome do produto"),description=node("textarea",undefined,"control-input"),image=input("https://..."),color=input("","color"),label=input("Comprar"),multiple=input("","checkbox"),channels=select([["","Selecione o canal"]]),rows=node("div"),preview=node("div",undefined,"control-item");
      name.value=product?.name||"";description.value=product?.description||"";image.value=product?.image_url||"";color.value=product?.color||"#7135FF";label.value=product?.button_text||"Comprar";multiple.checked=Boolean(product?.has_variations);channels.disabled=true;
      function renderPreview(){preview.replaceChildren(node("h3",name.value||"Nome do produto"),node("p",description.value||"Descrição"),node("p",label.value||"Comprar"));preview.style.borderLeft="4px solid "+color.value;if(/^https:\/\//i.test(image.value)){const img=node("img");img.src=image.value;img.alt="Prévia da imagem";img.referrerPolicy="no-referrer";img.style.cssText="width:100%;max-height:180px;object-fit:contain";preview.append(img);}}
      for(const e of [name,description,image,color,label])e.addEventListener("input",renderPreview);renderPreview();
      const variants=[];
      function addVariant(v){
        const n=input("Nome da variação"),price=input("Preço em reais","number"),keys=node("textarea",undefined,"control-input"),infinite=input("","checkbox"),row=node("div",undefined,"control-item");
        n.value=v?.name|| (variants.length?"":"Padrão");price.min="0.01";price.step="0.01";price.value=v?(v.price_cents/100).toFixed(2):"";keys.placeholder="Uma key por linha";infinite.checked=Boolean(v?.infinite_stock);infinite.disabled=Boolean(v);keys.disabled=Boolean(v?.infinite_stock);
        const entry={id:v?.id,n,price,keys,infinite,row};variants.push(entry);
        row.append(field("Nome da variação",n),field("Preço",price),node("p","Estoque disponível: "+(v?.infinite_stock?"Infinito":v?.available||0)),field("Adicionar keys",keys),field("Estoque infinito",infinite));
        if(v)row.append(button(v.infinite_stock?"Desativar estoque infinito":"Ativar estoque infinito",async()=>{if(variants.some(x=>x.keys.value.trim()))throw Error("Salve as novas keys antes de alterar o modo.");await api("/api/commerce/stock/mode",{store_id:id,variant_id:v.id,infinite:!v.infinite_stock});await load();const updated=data.products.find(x=>x.id===product.id);if(updated)await openEditor(updated);}));
        else row.append(button("Remover variação",()=>{if(variants.length>1){variants.splice(variants.indexOf(entry),1);row.remove();}}));
        rows.append(row);
      }
      const previous=data.variants.filter(v=>v.product_id===product?.id);if(previous.length)previous.forEach(addVariant);else addVariant(null);
      const addRow=button("+ Adicionar variação",()=>{if(variants.length<25)addVariant(null);});addRow.hidden=!multiple.checked;
      multiple.addEventListener("change",()=>{if(!multiple.checked&&variants.length>1){multiple.checked=true;alert("Remova as novas variações primeiro. As existentes são preservadas.");}addRow.hidden=!multiple.checked;});
      const save=button("Salvar produto",async()=>{if(!channels.value)throw Error("Selecione o canal.");await api("/api/commerce/products",{store_id:id,product_id:product?.id,channel_id:channels.value,name:name.value,description:description.value,image_url:image.value,color:color.value,button_text:label.value,has_variations:multiple.checked,variants:variants.map(v=>({id:v.id,name:v.n.value,price_cents:Math.round(Number(v.price.value)*100),keys:v.keys.value,infinite:v.infinite.checked}))});await load();status.textContent="Produto e estoque salvos. Publique ou atualize o anúncio quando desejar.";});
      form.append(field("Nome",name),field("Descrição",description),field("Imagem (link HTTPS)",image),field("Cor da barra lateral",color),field("Texto do botão",label),field("Canal de vendas",channels),node("h3","Prévia do anúncio"),preview,field("Usar variações",multiple),node("h3","Preço e estoque"),rows,addRow,save,button("Cancelar",()=>editor.replaceChildren()));
      form.scrollIntoView({behavior:"smooth",block:"start"});
      const result=await api("/api/store/channels?store="+encodeURIComponent(id));if(!editor.contains(form)||stores.value!==id)return;
      for(const c of result.channels){const o=new Option("#"+c.name+(c.available?"":" — sem permissão"),c.id);o.disabled=!c.available;channels.append(o);}channels.value=product?.channel_id||"";channels.disabled=Boolean(product?.message_id);
    }
    stores.addEventListener("change",()=>load().catch(e=>status.textContent=e.message));
    api("/api/store/channels").then(d=>{for(const s of d.stores.filter(s=>s.id===ZYNOX.store?.id))stores.append(new Option(s.name,s.id));if(ZYNOX.store){stores.value=ZYNOX.store.id;stores.disabled=true;}status.textContent=d.stores.length?"Selecione a loja.":"Vincule uma loja em Servidores.";if(ZYNOX.store)return load();}).catch(e=>status.textContent=e.message);
    return;
  }

  if (page === "payments") {
    const box=panel("Pagamentos Pix","Receba diretamente na sua conta. O Pix manual exige conferência no extrato bancário.");
    const stores=select([["","Selecione a loja"]]),status=node("p","Carregando lojas..."),list=node("div");
    box.append(field("Loja",stores),status,list);main.append(box);
    async function load(){
      const id=stores.value;list.replaceChildren();if(!id)return;
      const [d,m]=await Promise.all([api("/api/commerce/overview?store="+encodeURIComponent(id)),api("/api/commerce/manual-pix?store="+encodeURIComponent(id))]);
      if(stores.value!==id)return;
      list.append(node("h3","Pix manual"),node("p",m.settings?.enabled?"Ativo — recebimento direto no banco cadastrado.":"Desativado."),button("Configurar chave Pix",()=>navigate("gateways")),node("h3","Pedidos Pix manual"));
      for(const o of m.orders){
        const card=node("div",undefined,"control-item");
        card.append(node("strong","Pedido "+o.order_id),node("p","R$ "+(o.amount_cents/100).toFixed(2).replace(".",",")),node("p",o.status==="confirmed"?"Confirmado pelo vendedor":o.status==="pending"?"Aguardando conferência bancária":"Cancelado"));
        if(o.status==="pending"&&o.order_status==="pending"){
          const ref=input("ID da transação Pix (EndToEndId)"),verified=input("","checkbox");ref.maxLength=32;
          card.append(field("ID da transação no extrato",ref),field("Conferi o crédito e o valor na minha conta bancária",verified),button("Confirmar recebimento",async()=>{if(!verified.checked)throw Error("Confira o extrato primeiro.");if(!confirm("Confirma que o valor foi recebido na sua conta?"))return;await api("/api/commerce/manual-pix/confirm",{store_id:id,order_id:o.order_id,bank_reference:ref.value,verified:true});await load();}));
        }
        if(o.status==="confirmed"){
          const deliveryLabels={paid:"Entrega pendente",delivering:"Entrega em análise — não reenvie até verificar",delivered:"Produto entregue"};
          card.append(node("p",deliveryLabels[o.order_status]||"Status: "+o.order_status));
          if(o.order_status==="paid")card.append(button("Reenviar produto",async()=>{const result=await api("/api/commerce/manual-pix/retry-delivery",{store_id:id,order_id:o.order_id});await load();status.textContent=result.delivery==="delivered"?"Produto entregue com sucesso.":"Entrega ainda pendente. Confira as permissões e a DM do comprador.";}));
        }
        list.append(card);
      }if(!m.orders.length)list.append(node("p","Nenhum pedido manual."));
      list.append(node("h3","Cobranças automáticas — ambiente de testes"));
      for(const o of d.orders.filter(o=>!m.orders.some(mo=>mo.order_id===o.id))){
        const card=node("div",undefined,"control-item");card.append(node("strong","Pedido "+o.id),node("p",o.status+" • R$ "+(o.total_cents/100).toFixed(2).replace(".",",")));
        if(o.status==="pending"){const name=input("Nome do comprador"),email=input("E-mail do comprador","email"),result=node("div");card.append(field("Nome",name),field("E-mail",email),button("Gerar Pix de teste",async()=>{const p=await api("/api/commerce/pix",{store_id:id,order_id:o.id,buyer_name:name.value,buyer_email:email.value});result.replaceChildren(node("p","Pix copia e cola:"),node("textarea",p.payment.pix_code,"control-input"),button("Copiar Pix",()=>navigator.clipboard.writeText(p.payment.pix_code)));}),result);}list.append(card);
      }status.textContent="Pedidos atualizados.";
    }
    stores.addEventListener("change",()=>load().catch(e=>status.textContent=e.message));
    api("/api/store/channels").then(d=>{for(const s of d.stores.filter(s=>s.id===ZYNOX.store?.id))stores.append(new Option(s.name,s.id));if(ZYNOX.store){stores.value=ZYNOX.store.id;stores.disabled=true;}status.textContent="Servidor selecionado.";if(ZYNOX.store)return load();}).catch(e=>status.textContent=e.message);return;
  }

  if (page === "wallet") {
    const box=panel("ZYNOX WALLET","");
    const message=node("h2","EM BREVE !");
    message.style.cssText="text-align:center;color:#C084FC;font-size:clamp(1.8rem,6vw,2.8rem);letter-spacing:.08em;padding:64px 12px;";
    box.append(message);
    main.append(box);
    return;
  }

  if (page === "gateways") {
    const box=panel("Conectar banco / provedor","Use somente tokens de API. Nunca informe senha bancária ou código de autenticação.");
    const stores=select([["","Selecione a loja"]]),status=node("p","Carregando lojas..."),content=node("div");
    box.append(field("Loja",stores),status,content);main.append(box);
    async function load(){
      const id=stores.value;content.replaceChildren();if(!id)return;
        const m=await api("/api/commerce/manual-pix?store="+encodeURIComponent(id));if(stores.value!==id)return;
        const bank=select([["nubank","Nubank"],["picpay","PicPay"],["itau","Itaú"],["other","Outro banco"]]),type=select([["CPF","CPF"],["CNPJ","CNPJ"],["EMAIL","E-mail"],["PHONE","Telefone (+55)"],["EVP","Chave aleatória"]]),key=input("Sua chave Pix"),recipient=input("Nome do titular"),consent=input("","checkbox");
        if(m.settings){bank.value=m.settings.bank;type.value=m.settings.key_type;key.value=m.settings.pix_key;recipient.value=m.settings.recipient;}
        content.append(node("h3","Pix manual — "+(m.settings?.enabled?"Ativo":"Desativado")),field("Banco",bank),field("Tipo de chave",type),field("Chave Pix",key),field("Titular da conta",recipient),field("Autorizo mostrar a chave privadamente aos compradores",consent),button("Salvar e ativar Pix manual",async()=>{await api("/api/commerce/manual-pix",{store_id:id,bank:bank.value,key_type:type.value,pix_key:key.value,recipient:recipient.value,accept_disclosure:consent.checked});await load();}));
        if(m.settings?.enabled)content.append(button("Desativar Pix manual",async()=>{await api("/api/commerce/manual-pix",{store_id:id,enabled:false});await load();}));
        content.append(node("h3","Integrações automáticas"),node("p","Nubank — disponível por Pix manual. PicPay e Itaú — integração API em desenvolvimento, exige habilitação comercial."));
        const pic=node("div",undefined,"control-item"),client=input("Client ID"),secret=input("Client Secret","password"),picStatus=node("p","Homologação — não gera cobranças reais.");
        pic.append(node("h3","PicPay automático"),picStatus,field("Client ID de teste",client),field("Client Secret de teste",secret),button("Validar credenciais",async()=>{try{const d=await api("/api/commerce/picpay/test",{store_id:id,client_id:client.value,client_secret:secret.value});picStatus.textContent=d.message;}finally{secret.value="";}}));
        const itau=node("div",undefined,"control-item");itau.append(node("h3","Itaú automático"),node("p","Em desenvolvimento — requer habilitação e certificados bancários."));content.append(pic,itau);
        const provider=select([["mercadopago","Mercado Pago"],["asaas","Asaas — produção"],["asaas_sandbox","Asaas — sandbox"]]),token=input("Cole o token de API","password");
        content.append(field("Provedor",provider),field("Token de API",token),button("Validar e conectar",async()=>{status.textContent="Validando credencial...";const d=await api("/api/commerce/gateways",{store_id:id,provider:provider.value,api_token:token.value});token.value="";status.textContent="Conectado: "+d.gateway.account;await load();}));
        const d=await api("/api/commerce/overview?store="+encodeURIComponent(id));
        content.append(node("h3","Conexões"));for(const g of d.gateways){const c=node("div",undefined,"control-item");c.append(node("strong",g.provider),node("p",g.status+(g.is_primary?" • principal":"")));content.append(c);}
    }
    stores.addEventListener("change",()=>load().catch(e=>status.textContent=e.message));
    api("/api/store/channels").then(d=>{for(const s of d.stores.filter(s=>s.id===ZYNOX.store?.id))stores.append(new Option(s.name,s.id));if(ZYNOX.store){stores.value=ZYNOX.store.id;stores.disabled=true;}status.textContent="Servidor selecionado.";if(ZYNOX.store)return load();}).catch(e=>status.textContent=e.message);
    return;
  }

  if (["sales","customers","coupons","tickets","reports"].includes(page)) {
    const descriptions={sales:"Acompanhe os pedidos e as vendas da sua loja.",customers:"Consulte seus clientes e o histórico de compras.",coupons:"Gerencie os cupons da sua loja.",tickets:"Acompanhe os chamados registrados.",reports:"Indicadores de pedidos e vendas da loja."};
    const box=panel(pageNames[page],descriptions[page]);
    const stores=select([["","Selecione a loja"]]),status=node("p","Carregando lojas..."),list=node("div");
    box.append(field("Loja",stores),status,list);main.append(box);
    const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n||0)/100);
    const labels={pending:"Pendente",paid:"Pago",delivered:"Entregue",cancelled:"Cancelado",expired:"Expirado",open:"Aberto",closed:"Fechado"};
    const card=(title,...lines)=>{const c=node("div",undefined,"control-item");c.append(node("h3",title),...lines.map(x=>node("p",x)));return c;};
    function metrics(items){const grid=node("div",undefined,"control-grid");for(const [label,value] of items){const c=node("div",undefined,"control-stat");c.append(node("p",label),node("h2",String(value)));grid.append(c);}return grid;}
    async function load(){
      const id=stores.value;list.replaceChildren();if(!id)return;
      status.textContent="Consultando registros...";
      const d=await api("/api/commerce/overview?store="+encodeURIComponent(id));if(stores.value!==id)return;
      status.textContent="Dados da loja atualizados.";
      if(page==="sales"||page==="reports"){
        const m=d.stats;
        list.append(metrics([["Valor bruto confirmado",money(m.sales_cents)],["Pedidos",m.orders],["Pagos ou entregues",m.paid],["Pendentes",m.pending],["Entregues",m.delivered],["Clientes",m.customers]]));
        if(page==="reports"){list.append(node("p","Ticket médio confirmado: "+money(m.paid?m.sales_cents/m.paid:0)),node("p","Indicadores acumulados. Incluem vendas de teste, quando existentes; não representam saldo bancário nem lucro líquido."));return;}
        const filter=select([["","Todos os status"],["pending","Pendentes"],["paid","Pagos"],["delivered","Entregues"],["cancelled","Cancelados"],["expired","Expirados"]]),search=input("Buscar produto, cliente ou pedido"),results=node("div");
        const render=()=>{results.replaceChildren();const q=search.value.trim().toLowerCase();const items=d.orders.filter(o=>(!filter.value||o.status===filter.value)&&(!q||[o.id,o.username,o.product_name,o.variant_name].some(x=>String(x||"").toLowerCase().includes(q))));for(const o of items)results.append(card(o.product_name||"Pedido",o.variant_name||"Padrão","Cliente: "+(o.username||"—"),"Valor: "+money(o.total_cents),"Status: "+(labels[o.status]||o.status),"Data: "+formatDate(o.created_at),"ID: "+o.id));if(!items.length)results.append(node("p","Nenhum pedido encontrado."));};
        filter.addEventListener("change",render);search.addEventListener("input",render);
        list.append(node("h3","Últimos 100 pedidos"),field("Filtrar status",filter),field("Buscar",search),results);render();
      }else if(page==="customers"){
        const search=input("Buscar nome ou ID do Discord"),results=node("div");
        list.append(metrics([["Total de clientes",d.stats.customers]]),field("Buscar cliente",search),node("p","Até 100 clientes recentes."),results);
        const render=()=>{results.replaceChildren();const q=search.value.trim().toLowerCase();const items=d.customers.filter(c=>[c.username,c.discord_id].some(x=>String(x||"").toLowerCase().includes(q)));for(const c of items)results.append(card(c.username||"Cliente","Discord: "+c.discord_id,"Pedidos: "+c.orders,"Compras confirmadas: "+money(c.spent_cents),"Cadastro: "+formatDate(c.created_at)));if(!items.length)results.append(node("p","Nenhum cliente encontrado."));};search.addEventListener("input",render);render();
      }else if(page==="coupons"){
        const code=input("Ex.: PROMO10"),discount=input("Desconto %","number");discount.min="1";discount.max="100";
        list.append(field("Código",code),field("Desconto",discount),button("Criar cupom",async()=>{await api("/api/commerce/coupons",{store_id:id,code:code.value,discount:Number(discount.value)});await load();}),node("p","Cadastro de cupons disponível. Aplicação no carrinho ainda não implementada."));
        for(const c of d.coupons)list.append(card(c.code,"Desconto: "+c.discount+"%","Status: "+(c.active?"Ativo":"Inativo"),"Usos: "+c.uses));
        if(!d.coupons.length)list.append(node("p","Nenhum cupom cadastrado."));
      }else{
        for(const t of d.tickets)list.append(card(t.subject||"Ticket","Status: "+(labels[t.status]||t.status),"Data: "+formatDate(t.created_at),"ID: "+t.id));
        if(!d.tickets.length)list.append(node("p","Nenhum ticket registrado."));
        list.append(node("p","A criação automática de tickets pelo Discord ainda não está disponível."));
      }
    }
    stores.addEventListener("change",()=>load().catch(e=>status.textContent=e.message));
    api("/api/store/channels").then(d=>{for(const s of d.stores.filter(s=>s.id===ZYNOX.store?.id))stores.append(new Option(s.name,s.id));if(ZYNOX.store){stores.value=ZYNOX.store.id;stores.disabled=true;}status.textContent="Servidor selecionado.";if(ZYNOX.store)return load();}).catch(e=>status.textContent=e.message);
    return;
  }

  if (page === "ai") {
    const box=panel("Zynox AI","Assistente inteligente da ZYNOX.");
    const status=node("p","Verificando disponibilidade..."),chat=node("div",undefined,"control-item"),prompt=node("textarea",undefined,"control-input"),send=button("Enviar",()=>{});
    prompt.placeholder="Pergunte sobre sua loja...";prompt.disabled=true;send.disabled=true;
    chat.append(node("h3","Zynox AI"),node("p","Em breve você poderá receber ajuda para organizar produtos, vendas e configurações da loja."));
    box.append(chat,status,field("Mensagem",prompt),send);main.append(box);
    api("/api/ai/status").then(d=>status.textContent=d.message).catch(e=>status.textContent=e.message);return;
  }
  if (page === "support") {
    const box=panel("Suporte","Abra um chamado para a equipe da ZYNOX. Não envie senhas, tokens ou dados bancários.");
    const subject=input("Assunto"),message=node("textarea",undefined,"control-input"),status=node("p","Carregando..."),list=node("div");
    subject.maxLength=120;message.maxLength=3000;message.placeholder="Descreva sua dúvida ou problema...";
    async function load(){const d=await api("/api/support");list.replaceChildren();for(const t of d.items){const c=node("div",undefined,"control-item");c.append(node("h3",t.subject),node("p",t.message),node("p",t.status==="closed"?"Encerrado":"Aberto"),node("p",formatDate(t.created_at)),node("p","Protocolo: "+t.id));list.append(c);}if(!d.items.length)list.append(node("p","Nenhum chamado registrado."));status.textContent="Chamados atualizados.";}
    box.append(field("Assunto",subject),field("Descrição",message),button("Abrir chamado",async()=>{await api("/api/support",{subject:subject.value,message:message.value});subject.value="";message.value="";await load();status.textContent="Chamado registrado.";}),status,node("h3","Meus chamados"),list,button("Atualizar",load));main.append(box);load().catch(e=>status.textContent=e.message);return;
  }

  if (page === "notifications") {
    const box=panel("Notificações","Avisos da sua conta ZYNOX.");
    const list=node("div"),status=node("p","Carregando...");
    async function load(){const d=await api("/api/notifications");list.replaceChildren();status.textContent=d.unread+" não lidas";for(const n of d.items){const c=node("div",undefined,"control-item");c.append(node("h3",n.title),node("p",n.message),node("p",formatDate(n.created_at)));if(!n.is_read)c.append(button("Marcar como lida",async()=>{await api("/api/notifications/read",{id:n.id});await load();}));list.append(c);}if(!d.items.length)list.append(node("p","Nenhuma notificação."));}
    box.append(status,button("Marcar todas como lidas",async()=>{await api("/api/notifications/read",{all:true});await load();}),button("Atualizar",load),list);main.append(box);load().catch(e=>status.textContent=e.message);return;
  }
  if (["settings","integrations","automations"].includes(page)) {
    const desc={settings:"Personalize os dados da sua loja.",integrations:"Confira as conexões e a disponibilidade dos serviços.",automations:"Acompanhe as entregas automáticas e a configuração de pagamentos."};
    const box=panel(pageNames[page],desc[page]),stores=select([["","Selecione a loja"]]),status=node("p","Carregando lojas..."),content=node("div");
    box.append(field("Loja",stores),status,content);main.append(box);
    const card=(title,...lines)=>{const c=node("div",undefined,"control-item");c.append(node("h3",title),...lines.map(x=>node("p",x)));return c;};
    async function load(){const id=stores.value;content.replaceChildren();if(!id)return;status.textContent="Carregando...";
      const d=await api("/api/commerce/"+page+"?store="+encodeURIComponent(id));if(stores.value!==id)return;status.textContent="Dados atualizados.";
      if(page==="settings"){
        const name=input("Nome da loja");name.value=d.store.name;name.maxLength=100;content.append(field("Nome da loja",name),node("p","Servidor Discord: "+d.store.guild_id),button("Salvar alterações",async()=>{const result=await api("/api/commerce/settings",{store_id:id,name:name.value});stores.selectedOptions[0].textContent=result.name;status.textContent="Configurações salvas.";}));
      }else if(page==="integrations"){
        content.append(card("Discord","Servidor vinculado: "+d.discord.guild_id,d.discord.bot_configured?"Token do bot configurado":"Token do bot não configurado"),button("Gerenciar servidores",()=>navigate("servers")),node("h3","Provedores de pagamento"));for(const g of d.gateways)content.append(card(g.provider,g.status+(g.is_primary?" — principal":"")));if(!d.gateways.length)content.append(node("p","Nenhum provedor conectado."));content.append(button("Gerenciar gateways",()=>navigate("gateways")),card("ZYNOX Wallet","EM BREVE !"),card("Zynox AI","Ainda não disponível"),node("p","Pagamentos reais não habilitados."));
      }else{
        content.append(card("Entrega por DM",d.delivery.configured?"Credenciais configuradas":"Credenciais pendentes","Entrega de estoque finito após pagamento verificado. Estoque infinito ainda não suportado."),card("Pagamento Pix",d.payments.sandbox_enabled?"Ambiente de testes habilitado":"Cobranças desativadas"),node("h3","Últimos pedidos pagos"));for(const o of d.rows)content.append(card(o.product_name,o.status==="delivered"?"Entregue":"Entrega pendente","Pagamento: "+formatDate(o.paid_at),"Entrega: "+formatDate(o.delivered_at),"Pedido: "+o.id));if(!d.rows.length)content.append(node("p","Nenhuma entrega registrada."));content.append(node("p","A configuração de novas regras automáticas ainda está em desenvolvimento."));
      }
    }
    stores.addEventListener("change",()=>load().catch(e=>status.textContent=e.message));api("/api/store/channels").then(d=>{for(const s of d.stores.filter(s=>s.id===ZYNOX.store?.id))stores.append(new Option(s.name,s.id));if(ZYNOX.store){stores.value=ZYNOX.store.id;stores.disabled=true;}status.textContent="Servidor selecionado.";if(ZYNOX.store)return load();}).catch(e=>status.textContent=e.message);return;
  }

  if (page === "servers") {
    const box=panel("Selecionar servidor","Escolha o servidor que deseja gerenciar.");
    const list=node("div"),invite=node("a","+ Adicionar ZYNOX ao servidor","control-button");
    invite.href="https://discord.com/oauth2/authorize?client_id=1575192990132076637&permissions=84992&scope=bot%20applications.commands";invite.target="_blank";invite.rel="noopener noreferrer";
    async function load(){
      list.replaceChildren(node("p","Carregando servidores..."));
      const d=await api("/api/server-controls");list.replaceChildren();
      for(const server of d.stores){
        const card=node("div",undefined,"control-item");
        card.append(node("h3",server.name),node("p",server.removed_at?"Removido":server.enabled?"Operação habilitada":"Operação pausada"),node("p",server.enabled_since?"Habilitado desde: "+formatDate(server.enabled_since):"Vinculado em: "+formatDate(server.created_at)),node("p","Presença online não monitorada (bot HTTP)."));
        if(!server.removed_at)card.append(button("Abrir dashboard",()=>{ZYNOX.store=server;updateProfile();navigate("home");}),button(server.enabled?"Pausar bot":"Reativar bot",async()=>{await api("/api/server-controls/action",{store_id:server.id,action:server.enabled?"pause":"resume"});await load();}),button("Remover bot",async()=>{if(!confirm("Remover ZYNOX deste servidor? Os registros da loja serão preservados."))return;await api("/api/server-controls/action",{store_id:server.id,action:"leave",confirm:true});if(ZYNOX.store?.id===server.id)ZYNOX.store=null;await load();},true));
        list.append(card);
      }
      const discord=await api("/api/discord/servers");
      if(discord.needsDiscord)list.append(button("Vincular Discord",()=>location.href="/auth/discord/link"));
      for(const g of discord.servers||[]){
        const existing=d.stores.find(x=>x.guild_id===g.id);
        if(!existing||existing.removed_at){const card=node("div",undefined,"control-item");card.append(node("h3",g.name),button("Vincular servidor",async()=>{await api("/api/discord/store/link",{guild_id:g.id,name:g.name});const fresh=await api("/api/server-controls");const linked=fresh.stores.find(x=>x.guild_id===g.id);if(linked?.removed_at)await api("/api/server-controls/action",{store_id:linked.id,action:"resume"});await load();}));list.append(card);}
      }
    }
    box.append(invite,button("Atualizar servidores",load),list,button("Minha conta",()=>navigate("account")));if(isAdmin())box.append(button("ZYNOX CONTROL",()=>navigate("control")));
    main.append(box);load().catch(e=>list.append(node("p",e.message,"control-error")));return;
  }

  if (page === "bot") {
    const box = panel("Meu bot", "Integração com o Discord");
    const invite = node("a","Adicionar bot ao servidor","control-button");
    invite.href = "https://discord.com/oauth2/authorize?client_id=1575192990132076637&permissions=84992&scope=bot%20applications.commands";
    invite.target = "_blank";
    invite.rel = "noopener noreferrer";
    box.append(invite,node("p","Aplicação compartilhada da ZYNOX. O bot usa interações HTTP; o indicador online do Discord pode aparecer desligado."),button("Gerenciar servidores",()=>navigate("servers")),button("Gerenciar produtos",()=>navigate("products")),button("Ver automações",()=>navigate("automations")),node("h3","Comandos disponíveis"),node("p","/ping • /zynox • /painel • /ajuda"));
    if (isOwner()) {
      const status = node("p","Verifique a conexão ou registre os comandos.");
      box.append(status,button("Verificar conexão",async()=>{
        const data = await api("/api/owner/discord/status");
        status.textContent = "Conectado: "+data.bot.username;
      }),button("Registrar comandos",async()=>{
        const data = await api("/api/owner/discord/commands",{});
        status.textContent = "Registrados: "+data.registered.map(name=>"/"+name).join(", ");
      }));
    }
    main.append(box);
    return;
  }

  if (page === "account") {
    renderAccount();
    return;
  }

  if (page === "plans") {
    renderPlans();
    return;
  }

  if (page === "licenses" && isOwner()) {
    ZYNOX.currentPage = "control";
    renderControl("licenses");
    return;
  }

  main.appendChild(
    panel(
      pageNames[page],
      "Esta funcionalidade está em desenvolvimento."
    )
  );

  window.scrollTo(0, 0);
}

async function logout() {
  try {
    const response = await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error("Não foi possível sair.");
    }

    window.location.replace("/");

  } catch (error) {
    alert(error.message);
  }
}

function setupEvents() {
  element("open-menu")?.addEventListener("click", openMenu);

  element("close-menu")?.addEventListener("click", closeMenu);

  element("overlay")?.addEventListener("click", closeMenu);

  element("logout")?.addEventListener("click", logout);

  document.addEventListener("click", event => {
    const target = event.target.closest("[data-page]");

    if (!target) return;

    event.preventDefault();

    navigate(target.dataset.page);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });
}

async function initialize() {
  try {
    const data = await api("/api/me");

    if (!data.authenticated) {
      window.location.replace("/");
      return;
    }

    ZYNOX.user = data.user;
    ZYNOX.subscription = data.subscription;

    if (!isAdmin() && !ZYNOX.subscription) {
      window.location.replace("/plans");
      return;
    }

    homeContent = element("main-content").innerHTML;

    updateProfile();
    setupEvents();

    if (element("loading")) {
      element("loading").hidden = true;
    }

    if (element("app")) {
      element("app").hidden = false;
    }
    navigate("servers");

  } catch (error) {
    const loading = element("loading");

    if (loading) {
      loading.replaceChildren(
        node("p", error.message),

        button("Tentar novamente", () => {
          window.location.reload();
        })
      );
    }
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initialize
);

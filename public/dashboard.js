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

function navigate(page) {
  if (!pageNames[page]) return;

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
    return;
  }

  if (page === "control") {
    renderControl();
    return;
  }

  if (page === "stock") {
    const box=panel("Estoque","Cadastre keys separadamente para cada produto ou variação.");
    const stores=select([["","Selecione a loja"]]),list=node("div"),status=node("p","Carregando lojas...");
    box.append(field("Loja",stores),status,list);main.append(box);
    async function load(){const id=stores.value;list.replaceChildren();if(!id)return;const d=await api("/api/commerce/products?store="+encodeURIComponent(id));if(stores.value!==id)return;
      for(const p of d.products){const card=node("div",undefined,"control-item");card.append(node("h3",p.name));for(const v of d.variants.filter(v=>v.product_id===p.id)){const keys=node("textarea",undefined,"control-input");keys.placeholder="Uma key por linha (até 50)";const result=node("p","Disponíveis: "+v.available);card.append(node("h4",v.name),result,button(v.infinite_stock?"Desativar estoque infinito":"Ativar estoque infinito",async()=>{await api("/api/commerce/stock/mode",{store_id:id,variant_id:v.id,infinite:!v.infinite_stock});await load();}),field("Novas keys",keys),button("Adicionar ao estoque",async()=>{const x=await api("/api/commerce/stock",{store_id:id,variant_id:v.id,keys:keys.value});keys.value="";result.textContent="Adicionadas: "+x.added;await load();}));}list.append(card);}if(!d.products.length)list.append(node("p","Cadastre um produto primeiro."));}
    stores.addEventListener("change",()=>load().catch(e=>status.textContent=e.message));
    api("/api/store/channels").then(d=>{for(const s of d.stores)stores.append(new Option(s.name,s.id));status.textContent="Selecione a loja.";}).catch(e=>status.textContent=e.message);
    return;
  }

  if (page === "products") {
    const box = panel("Produtos","Selecione a loja e o canal para preparar a publicação de produtos.");
    const stores = select([["","Selecione a loja"]]);
    const channels = select([["","Selecione o canal"]]);
    const status = node("p","Carregando lojas...");
    channels.disabled = true;
    box.append(field("Loja",stores),field("Canal de vendas",channels),status);
    main.append(box);
    api("/api/store/channels").then(data=>{
      for(const s of data.stores){const o=node("option",s.name);o.value=s.id;stores.append(o);}
      status.textContent=data.stores.length?"Selecione uma loja.":"Vincule uma loja em Servidores primeiro.";
    }).catch(e=>status.textContent=e.message);
    stores.addEventListener("change",async()=>{
      const id=stores.value;
      channels.replaceChildren(new Option("Selecione o canal",""));
      channels.disabled=true;
      if(!id)return;
      status.textContent="Consultando canais...";
      try{
        const data=await api("/api/store/channels?store="+encodeURIComponent(id));
        if(stores.value!==id)return;
        for(const c of data.channels){const o=new Option("#"+c.name+(c.available?"":" — sem permissão"),c.id);o.disabled=!c.available;channels.append(o);}
        channels.disabled=false;
        status.textContent="Escolha um canal disponível.";
      }catch(e){status.textContent=e.message;}
    });
    const name=input("Nome do produto"),description=node("textarea",undefined,"control-input"),image=input("https://..."),color=input("#7135FF"),label=input("Comprar"),multiple=input("","checkbox"),rows=node("div"),listing=node("div");
    color.value="#7135FF";label.value="Comprar";
    const variants=[];
    function addVariant(){const n=input("Nome da variação"),p=input("Preço em reais","number"),row=node("div",undefined,"control-item");p.min="0.01";p.step="0.01";n.value=variants.length?"":"Padrão";const v={n,p,row};variants.push(v);row.append(field("Variação",n),field("Preço",p),button("Remover",()=>{if(variants.length>1){variants.splice(variants.indexOf(v),1);row.remove();}}));rows.append(row);}
    addVariant();
    const add=button("Adicionar variação",()=>{if(variants.length<25)addVariant();});add.hidden=true;
    multiple.addEventListener("change",()=>{add.hidden=!multiple.checked;if(!multiple.checked){while(variants.length>1)variants.pop().row.remove();}});
    async function loadProducts(){const id=stores.value;listing.replaceChildren();if(!id)return;const data=await api("/api/commerce/products?store="+encodeURIComponent(id));if(stores.value!==id)return;for(const p of data.products){const card=node("div",undefined,"control-item");card.append(node("h3",p.name),node("p","Status: "+p.status));card.append(button(p.message_id?"Atualizar anúncio":"Publicar no Discord",async()=>{await api("/api/commerce/publish",{store_id:id,product_id:p.id});await loadProducts();}));for(const v of data.variants.filter(v=>v.product_id===p.id))card.append(node("p",v.name+" — R$ "+(v.price_cents/100).toFixed(2)+" | Estoque: "+v.available));listing.append(card);}}
    stores.addEventListener("change",()=>loadProducts().catch(e=>status.textContent=e.message));
    box.append(field("Nome",name),field("Descrição",description),field("Imagem HTTPS",image),field("Cor",color),field("Texto do botão",label),field("Usar variações",multiple),rows,add,button("Salvar produto",async()=>{if(!stores.value||!channels.value)throw Error("Selecione loja e canal.");await api("/api/commerce/products",{store_id:stores.value,channel_id:channels.value,name:name.value,description:description.value,image_url:image.value,color:color.value,button_text:label.value,has_variations:multiple.checked,variants:variants.map(v=>({name:v.n.value,price_cents:Math.round(Number(v.p.value)*100)}))});status.textContent="Produto salvo como rascunho.";await loadProducts();}),node("h3","Produtos cadastrados"),listing);
    return;
  }

  if (["sales","customers","coupons","wallet","gateways","tickets","reports","payments"].includes(page)) {
    const box=panel(pageNames[page],"Dados da loja selecionada. Pagamentos reais ainda dependem de integração.");
    const stores=select([["","Selecione a loja"]]),list=node("div"),status=node("p","Carregando lojas...");
    box.append(field("Loja",stores),status,list);main.append(box);
    async function load(){const id=stores.value;list.replaceChildren();if(!id)return;const d=await api("/api/commerce/overview?store="+encodeURIComponent(id));if(stores.value!==id)return;const key={sales:"orders",customers:"customers",coupons:"coupons",wallet:"wallet",gateways:"gateways",tickets:"tickets",reports:"orders",payments:"orders"}[page];if(page==="coupons"){const code=input("Código"),discount=input("Desconto %","number");list.append(field("Código",code),field("Desconto",discount),button("Criar cupom",async()=>{await api("/api/commerce/coupons",{store_id:id,code:code.value,discount:Number(discount.value)});await load();}));}if(!d[key].length)list.append(node("p","Nenhum registro."));for(const item of d[key]){const card=node("div",undefined,"control-item");for(const [k,v] of Object.entries(item))if(v!==null)card.append(node("p",k+": "+String(v)));list.append(card);}}
    stores.addEventListener("change",()=>load().catch(e=>status.textContent=e.message));
    api("/api/store/channels").then(d=>{for(const s of d.stores)stores.append(new Option(s.name,s.id));status.textContent="Selecione a loja.";}).catch(e=>status.textContent=e.message);
    return;
  }

  if (page === "servers") {
    const box = panel("Servidores","Servidores com ZYNOX instalado e permissão de gerenciamento.");
    const list = node("div");
    const load = async () => {
      list.replaceChildren(node("p","Consultando Discord..."));
      try {
        const data = await api("/api/discord/servers");
        list.replaceChildren();
        if (data.needsDiscord) list.append(node("p","Vincule sua conta administrativa ao Discord."),button("Vincular Discord",()=>{window.location.href="/auth/discord/link";}));
        else if (!data.servers.length) list.append(node("p","Nenhum servidor autorizado encontrado."));
        for (const server of data.servers) {
          const card = node("div",undefined,"control-item");
          card.append(node("h3",server.name),node("p",server.linked?"Loja vinculada":"Disponível para vinculação"));
          if (!server.linked) {
            const name = input("Nome da loja");
            name.value = server.name;
            card.append(field("Nome da loja",name),button("Vincular loja",async()=>{
              await api("/api/discord/store/link",{guild_id:server.id,name:name.value.trim()});
              await load();
            }));
          }
          list.append(card);
        }
        if (data.limited) list.append(node("p","Consulta inicial limitada a 20 servidores."));
      } catch (error) { list.replaceChildren(node("p",error.message,"control-error")); }
    };
    box.append(button("Atualizar servidores",load),list);
    main.append(box);
    load();
    return;
  }

  if (page === "bot") {
    const box = panel("Meu bot", "Integração com o Discord");
    const invite = node("a","Adicionar bot ao servidor","control-button");
    invite.href = "https://discord.com/oauth2/authorize?client_id=1575192990132076637&permissions=84992&scope=bot%20applications.commands";
    invite.target = "_blank";
    invite.rel = "noopener noreferrer";
    box.append(invite);
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

const ZYNOX = {
  user: null,
  subscription: null,
  currentPage: "home"
};

const pageNames = {
  home: "Início",
  dashboard: "Dashboard",
  bot: "Conectar bot",
  "bot-settings": "Configurar bot",
  servers: "Servidores",
  products: "Produtos",
  sales: "Vendas",
  coupons: "Cupons e ofertas",
  customers: "Clientes",
  tickets: "Tickets",
  payments: "Pagamentos",
  gateways: "Gateways e bancos",
  wallet: "Carteira digital",
  ai: "Zynox AI",
  reports: "Relatórios",
  integrations: "Integrações",
  plans: "Planos",
  notifications: "Notificações",
  settings: "Configurações",
  support: "Suporte",
  account: "Minha conta",
  control: "ZYNOX CONTROL"
};

let homeContent = "";
const money = n => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n||0)/100);
function toast(message,success=false){
  let host=element("zynox-toasts");if(!host){host=node("div");host.id="zynox-toasts";host.setAttribute("aria-live","polite");document.body.append(host);}
  const item=node("div",String(message||"Erro desconhecido"),"zynox-toast"+(success?" success":""));host.append(item);
  setTimeout(()=>item.remove(),7000);
}
window.alert=message=>toast(message);
function confirmInApp(message){
 return new Promise(resolve=>{
  const shade=node("div",undefined,"zynox-confirm-shade"),dialog=node("div",undefined,"zynox-confirm");
  dialog.append(node("h3","Confirmar ação"),node("p",message));
  const actions=node("div",undefined,"control-navigation");
  const finish=value=>{shade.remove();resolve(value);};
  actions.append(button("Cancelar",()=>finish(false)),button("Confirmar",()=>finish(true),true));
  dialog.append(actions);shade.append(dialog);document.body.append(shade);
 });
}

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
  box.dataset.module = ZYNOX.currentPage || "home";

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
  const root=node("div",undefined,"zynox-select control-input");
  root.tabIndex=0;root.setAttribute("role","combobox");root.setAttribute("aria-expanded","false");
  const display=node("button",undefined,"zynox-select-current");display.type="button";
  const choices=node("div",undefined,"zynox-select-menu");choices.hidden=true;
  const values=[];let selected="",disabled=false;
  const close=()=>{choices.hidden=true;root.setAttribute("aria-expanded","false");};
  const refresh=()=>{const found=values.find(x=>x.value===selected);display.textContent=(found?.label||"Selecione")+" ▾";choices.replaceChildren();for(const o of values){const item=node("button",o.label,"zynox-select-option");item.type="button";item.disabled=o.disabled;item.setAttribute("role","option");item.setAttribute("aria-selected",String(o.value===selected));item.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();if(disabled)return;selected=o.value;refresh();close();root.dispatchEvent(new Event("change",{bubbles:true}));});choices.append(item);}};
  Object.defineProperty(root,"value",{get:()=>selected,set:v=>{selected=String(v);refresh();}});
  Object.defineProperty(root,"disabled",{get:()=>disabled,set:v=>{disabled=Boolean(v);display.disabled=disabled;close();}});
  Object.defineProperty(root,"options",{get:()=>values});
  root.replaceChildren=(...items)=>{values.length=0;selected="";for(const o of items){if(o instanceof HTMLOptionElement)root.addOption(o.value,o.textContent,o.disabled);}refresh();};
  root.addOption=(value,label,disabledOption=false)=>{values.push({value:String(value),label:String(label),disabled:Boolean(disabledOption)});if(values.length===1)selected=String(value);refresh();};
  root.append=(...nodes)=>{for(const o of nodes){if(o instanceof HTMLOptionElement)root.addOption(o.value,o.textContent,o.disabled);else HTMLElement.prototype.append.call(root,o);}};
  for(const [value,label] of options)root.addOption(value,label);
  display.addEventListener("click",()=>{if(disabled)return;choices.hidden=!choices.hidden;root.setAttribute("aria-expanded",String(!choices.hidden));});
  root.addEventListener("keydown",e=>{if(e.key==="Escape")close();if(e.key==="Enter"&&e.target===root){e.preventDefault();display.click();}});
  document.addEventListener("click",e=>{if(!root.contains(e.target))close();});
  HTMLElement.prototype.append.call(root,display,choices);
  return root;
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
      : "ASSINANTE";

  if(element("selected-server"))element("selected-server").textContent=ZYNOX.store?.name||"Servidores";
  const sideAvatar=element("sidebar-profile-avatar");if(sideAvatar){sideAvatar.replaceChildren();if(ZYNOX.discordProfile?.avatar_url){const pic=node("img");pic.src=ZYNOX.discordProfile.avatar_url;pic.alt="Foto do Discord";sideAvatar.append(pic);}else sideAvatar.textContent=user.username.slice(0,1).toUpperCase();}
  const sideName=element("sidebar-profile-name");if(sideName)sideName.textContent=ZYNOX.discordProfile?.display_name||user.username;
  const sideRole=element("sidebar-profile-role");if(sideRole)sideRole.textContent=role;
  const headerAvatar=element("header-avatar");if(headerAvatar){headerAvatar.replaceChildren();if(ZYNOX.discordProfile?.avatar_url){const img=node("img");img.src=ZYNOX.discordProfile.avatar_url;img.alt="Foto de perfil";img.loading="lazy";headerAvatar.append(img);}else headerAvatar.textContent=user.username.slice(0,1).toUpperCase();}
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

function renderAccount(refresh=false){
  if(refresh)element("main-content").replaceChildren();
  const box=panel("Minha conta","Seu perfil e informações da assinatura ZYNOX.");
  const hero=node("div",undefined,"account-hero");
  const profile=ZYNOX.discordProfile||{};
  const banner=node("div",undefined,"account-banner");
  if(profile.banner_url){const img=node("img");img.src=profile.banner_url;img.alt="Banner do Discord";banner.append(img);}
  const row=node("div",undefined,"account-identity");
  const avatar=node("div",ZYNOX.user.username.slice(0,2).toUpperCase(),"account-avatar");
  if(profile.avatar_url){const img=node("img");img.src=profile.avatar_url;img.alt="Foto de perfil do Discord";avatar.append(img);}
  row.append(avatar,node("div",undefined,"account-name"));
  row.lastChild.append(node("h2",profile.display_name||ZYNOX.user.username),node("p","@"+ZYNOX.user.username));
  hero.append(banner,row);
  const details=node("div",undefined,"account-details");
  const sub=ZYNOX.subscription;
  for(const [label,value] of [["Usuário",ZYNOX.user.username],["ID da conta",ZYNOX.user.id],["Cargo",ZYNOX.user.role==="owner"?"Proprietário":ZYNOX.user.role==="admin"?"Administrador":"Assinante"],["Plano",isAdmin()?"Acesso administrativo ilimitado":sub?.plan?.toUpperCase()||"Sem plano"],["Validade",isAdmin()?"Ilimitada":sub?.lifetime?"Vitalícia":formatDate(sub?.expires_at)],["Discord ID",ZYNOX.user.discord_id||"Não vinculado"],["Situação da conta",ZYNOX.user.status||"Ativa"]]){
    const item=node("div",undefined,"account-detail");item.append(node("span",label),node("strong",value));details.append(item);
  }
  box.append(hero,details,button("Atualizar plano",()=>navigate("plans")),button("Gerenciar meus servidores",()=>navigate("servers")));
  element("main-content").append(box);
}

function renderPlans(){
 const box=panel("Atualizar plano","Escolha o plano e o período.");
 const tiers=[["starter","Starter",["Produtos e estoque","Vendas e relatórios","Pix manual"]],["pro","Pro",["Tudo do Starter","Cupons e ofertas","Ferramentas de gestão"]],["premium","Premium",["Tudo do Pro","Recursos premium conforme disponibilidade"]]];
 const grid=node("div",undefined,"zynox-plan-grid");
 for(const [id,title,benefits] of tiers){const card=node("div",undefined,"zynox-plan-choice");card.append(node("h3",title));for(const benefit of benefits)card.append(node("p","✓ "+benefit));card.append(button("Ver períodos e valores",()=>location.href="/plan-detail.html?plan="+id));grid.append(card);}
 box.append(grid,node("p","Preços provisórios; pagamentos de assinatura indisponíveis."));element("main-content").append(box);
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
          if (!await confirmInApp("Revogar esta licença?")) return;

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
          if (!await confirmInApp(
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

            if (!await confirmInApp("Alterar status desta conta?")) return;

            await api(
              "/api/control/users/status",
              { id: user.id, status }
            );

            await renderControl("users");
          },

          user.status !== "suspended"
        ),

        button("Cancelar assinatura", async () => {
          if (!await confirmInApp("Cancelar esta assinatura?")) return;

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
          if (!await confirmInApp("Alterar status do administrador?")) return;

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

    card.append(button("Excluir cadastro",async()=>{
      if(!await confirmInApp("Excluir definitivamente o cadastro de "+admin.username+"? As sessões serão encerradas."))return;
      await api("/api/control/admins/delete",{id:admin.id});
      toast("Administrador excluído.",true);
      await renderControl("admins");
    },true));
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
      const max=Math.max(100,...series.map(x=>x.cents));
      const svg=(tag,attrs={})=>{const el=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el;};
      const graph=svg("svg",{viewBox:"0 0 360 205",role:"img","aria-label":"Receita bruta dos últimos sete dias",class:"sales-line-chart"});
      const defs=svg("defs"),gradient=svg("linearGradient",{id:"sales-fill",x1:"0",y1:"0",x2:"0",y2:"1"});gradient.append(svg("stop",{offset:"0%","stop-color":"#7135FF","stop-opacity":".45"}),svg("stop",{offset:"100%","stop-color":"#7135FF","stop-opacity":"0"}));defs.append(gradient);graph.append(defs);
      const points=series.map((v,i)=>({x:48+i*50,y:163-137*v.cents/max,...v}));
      for(let i=0;i<=4;i++){const y=163-i*137/4;graph.append(svg("line",{x1:48,y1:y,x2:348,y2:y,stroke:"#332B45","stroke-dasharray":"3 4"}));const t=svg("text",{x:42,y:y+3,"text-anchor":"end",fill:"#A19BAD","font-size":8});t.textContent=new Intl.NumberFormat("pt-BR",{notation:"compact",maximumFractionDigits:1}).format(max*i/400);graph.append(t);}
      const path=points.map((p,i)=>(i?"L":"M")+p.x+" "+p.y).join(" ");
      graph.append(svg("path",{d:path+" L348 163 L48 163 Z",fill:"url(#sales-fill)"}),svg("path",{d:path,fill:"none",stroke:"#C084FC","stroke-width":2.5,"stroke-linejoin":"round","stroke-linecap":"round"}));
      const detail=node("p","Toque em um ponto para consultar o faturamento do dia.","chart-detail");
      for(const p of points){const c=svg("circle",{cx:p.x,cy:p.y,r:4,fill:"#C084FC",stroke:"#15121F","stroke-width":1.5,tabindex:0,role:"button","aria-label":p.day+" — "+money(p.cents)});const t=svg("title");t.textContent=p.day+" — "+money(p.cents);c.append(t);const show=()=>detail.textContent=p.day.slice(8)+"/"+p.day.slice(5,7)+" — "+money(p.cents);c.addEventListener("click",show);c.addEventListener("focus",show);c.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" ")show();});graph.append(c);const label=svg("text",{x:p.x,y:181,fill:"#A19BAD","font-size":9,"text-anchor":"middle"});label.textContent=p.day.slice(8)+"/"+p.day.slice(5,7);graph.append(label);}
      chart.append(graph,detail);
      const recent=element("recent-activities");if(!recent)return;recent.replaceChildren();
      const labels={pending:"Pendente",paid:"Vendido — entrega pendente",delivering:"Vendido — entrega em andamento",delivered:"Vendido — entregue",cancelled:"Cancelado",expired:"Expirado"};
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
  if (!ZYNOX.store && !["home","dashboard","servers","control","account","plans","licenses","support","notifications","bot","bot-settings"].includes(page)) page="servers";

  if (page === "stock") page="products";
  if (page === "automations") page="integrations";
  if (page === "control" && !isAdmin()) return;

  ZYNOX.currentPage = page;
  try{sessionStorage.setItem("zynox:last-page",page);}catch{}
  document.body.classList.toggle("server-selection-mode",page==="servers");
  closeMenu();

  document.querySelectorAll("[data-page]").forEach(item => {
    const active=item.dataset.page===page;item.classList.toggle("active",active);if(active)item.setAttribute("aria-current","page");else item.removeAttribute("aria-current");
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

  if (page === "products") {
    const box=panel("Produtos","Gerencie seus anúncios e estoque.");box.classList.add("products-compact");
    const stores=select([["","Selecione a loja"]]),status=node("p","Carregando lojas..."),listing=node("div"),editor=node("div");
    let data={products:[],variants:[]},generation=0;
    const add=button("+ Adicionar produto",()=>openEditor(null));add.disabled=true;
    const search=input("Buscar produtos","search");search.setAttribute("aria-label","Buscar produtos");
    const toolbar=node("div",undefined,"neon-product-toolbar");toolbar.append(search,add);
    listing.classList.add("neon-product-grid");
    const filter=()=>{const q=search.value.trim().toLocaleLowerCase("pt-BR");for(const card of listing.querySelectorAll("[data-product-name]"))card.hidden=!card.dataset.productName.includes(q);};
    search.addEventListener("input",filter);
    box.append(toolbar,status,editor,listing);main.append(box);
    async function load(){
      const id=stores.value,version=++generation;listing.replaceChildren();editor.replaceChildren();add.disabled=!id;
      if(!id){status.textContent="Selecione a loja.";return;}
      status.textContent="Carregando produtos...";
      const d=await api("/api/commerce/products?store="+encodeURIComponent(id));if(version!==generation)return;
      data=d;status.textContent=d.products.length+" produto(s) cadastrado(s).";
      for(const p of d.products){
        const card=node("div",undefined,"control-item");card.style.borderLeft="4px solid "+p.color;card.dataset.productName=String(p.name).toLocaleLowerCase("pt-BR");
        if(p.image_url){const img=node("img");img.src=p.image_url;img.alt="Imagem do produto";img.loading="lazy";img.referrerPolicy="no-referrer";img.style.cssText="width:100%;max-width:220px;max-height:120px;object-fit:contain;border-radius:8px;";card.append(img);}
        card.append(node("h3",p.name),node("p",p.status==="active"?"Publicado":p.status==="draft"?"Rascunho":p.status));
        for(const v of d.variants.filter(v=>v.product_id===p.id)){const line=node("div",undefined,"neon-variant");line.append(node("strong",v.name+" — "+money(v.price_cents)));const qty=Number(v.available);const state=v.infinite_stock?"available":qty===0?"empty":qty<=3?"low":"available";line.append(node("span","Estoque: "+(v.infinite_stock?"Infinito":v.available),"neon-stock "+state));card.append(line);}
        const cardActions=node("div",undefined,"product-card-actions");cardActions.append(button("Editar",()=>openEditor(p)),button(p.message_id?"Atualizar anúncio":"Publicar no Discord",async()=>{await api("/api/commerce/publish",{store_id:id,product_id:p.id});await load();}),button("Excluir produto",async()=>{if(!await confirmInApp("Excluir este produto? O anúncio será removido do Discord e o histórico de vendas será preservado."))return;await api("/api/commerce/products/delete",{store_id:id,product_id:p.id});await load();},true));card.append(cardActions);listing.append(card);
      }filter();if(!d.products.length)listing.append(node("p","Nenhum produto cadastrado. Clique em Adicionar produto."));
    }
    async function openEditor(product){
      const id=stores.value;if(!id)return;
      editor.replaceChildren();const form=node("div",undefined,"control-item product-editor");
      editor.append(form);form.append(node("h3",product?"Editar produto":"Adicionar produto"));
      const name=input("Nome do produto"),description=node("textarea",undefined,"control-input"),image=input("https://..."),color=input("","color"),label=input("Comprar"),multiple=input("","checkbox"),channels=select([["","Selecione o canal"]]),rows=node("div"),preview=node("div",undefined,"control-item");
      name.value=product?.name||"";description.value=product?.description||"";description.rows=3;image.value=product?.image_url||"";color.value=product?.color||"#7135FF";label.value=product?.button_text||"Comprar";multiple.checked=Boolean(product?.has_variations);channels.disabled=true;
      function renderPreview(){preview.replaceChildren(node("h3",name.value||"Nome do produto"),node("p",description.value||"Descrição"),node("p",label.value||"Comprar"));preview.style.borderLeft="4px solid "+color.value;if(/^https:\/\//i.test(image.value)){const img=node("img");img.src=image.value;img.alt="Prévia da imagem";img.referrerPolicy="no-referrer";img.style.cssText="width:100%;max-height:180px;object-fit:contain";preview.append(img);}}
      for(const e of [name,description,image,color,label])e.addEventListener("input",renderPreview);renderPreview();
      const variants=[];
      function addVariant(v){
        const n=input("Nome da variação"),price=input("Preço em reais","number"),keys=node("textarea",undefined,"control-input"),infinite=input("","checkbox"),row=node("div",undefined,"control-item compact-variant");
        n.value=v?.name|| (variants.length?"":"Padrão");price.min="0.01";price.step="0.01";price.value=v?(v.price_cents/100).toFixed(2):"";keys.placeholder="Uma key por linha";keys.rows=2;infinite.checked=Boolean(v?.infinite_stock);infinite.disabled=Boolean(v);keys.disabled=Boolean(v?.infinite_stock);
        const entry={id:v?.id,n,price,keys,infinite,row};variants.push(entry);
        const variantNameField=field("Nome da variação",n);row.append(variantNameField,field("Preço",price),node("p","Estoque disponível: "+(v?.infinite_stock?"Infinito":v?.available||0)),field("Adicionar keys",keys),field("Estoque infinito",infinite));
        if(v){
          const stockTools=node("details",undefined,"stock-manager"),stockList=node("div");
          const stockTitle=node("summary","Gerenciar keys cadastradas");stockTools.append(stockTitle,stockList);
          async function refreshKeys(){
            stockList.replaceChildren(node("p","Carregando estoque..."));
            const result=await api("/api/commerce/stock/list?store="+encodeURIComponent(id)+"&variant_id="+encodeURIComponent(v.id));
            stockList.replaceChildren(node("p","Keys cadastradas: "+result.items.length+(result.items.length===150?" (mostrando as 150 mais recentes)":"")));
            for(const item of result.items){
              const line=node("div",undefined,"stock-key-row");
              line.append(node("span","Key "+item.id.slice(0,8)+" • "+(item.status==="available"?"Disponível":item.status==="reserved"?"Reservada":"Utilizada")));
              if(item.status==="available"){const editKey=button("Editar",async()=>{const editRow=node("div",undefined,"stock-key-editor"),newKey=input("Nova key para substituir a atual");newKey.maxLength=1000;newKey.type="password";newKey.autocomplete="off";editRow.append(newKey,button("Salvar nova key",async()=>{if(!newKey.value.trim())throw Error("Informe a nova key.");await api("/api/commerce/stock/replace",{store_id:id,variant_id:v.id,stock_id:item.id,key:newKey.value});newKey.value="";await refreshKeys();toast("Key atualizada.",true);}),button("Cancelar",()=>editRow.remove()));if(line.nextElementSibling?.classList.contains("stock-key-editor"))line.nextElementSibling.remove();line.after(editRow);newKey.focus();});line.append(editKey);}
              if(item.status==="available"&&!result.infinite)line.append(button("Remover",async()=>{
                if(!await confirmInApp("Remover esta key do estoque? Essa ação não pode ser desfeita."))return;
                await api("/api/commerce/stock/remove",{store_id:id,variant_id:v.id,stock_id:item.id});
                await refreshKeys();
              },true));
              stockList.append(line);
            }
          }
          stockTools.addEventListener("toggle",()=>{if(stockTools.open)refreshKeys().catch(e=>toast(e.message));});
          row.append(stockTools);
        }
        if(v)row.append(button(v.infinite_stock?"Desativar estoque infinito":"Ativar estoque infinito",async()=>{if(variants.some(x=>x.keys.value.trim()))throw Error("Salve as novas keys antes de alterar o modo.");await api("/api/commerce/stock/mode",{store_id:id,variant_id:v.id,infinite:!v.infinite_stock});await load();const updated=data.products.find(x=>x.id===product.id);if(updated)await openEditor(updated);}));
        else row.append(button("Remover variação",()=>{if(variants.length>1){variants.splice(variants.indexOf(entry),1);row.remove();}}));
        rows.append(row);
        entry.variantNameField=variantNameField;
        entry.removeButton=row.querySelector("button:last-child");
      }
      const previous=data.variants.filter(v=>v.product_id===product?.id);if(previous.length)previous.forEach(addVariant);else addVariant(null);
      const addRow=button("+ Adicionar variação",()=>{if(variants.length<25)addVariant(null);});addRow.hidden=!multiple.checked;
      function syncVariationFields(){addRow.hidden=!multiple.checked;for(const v of variants){v.variantNameField.hidden=!multiple.checked;if(v.removeButton&&v.removeButton.textContent==="Remover variação")v.removeButton.hidden=!multiple.checked;}}
      multiple.addEventListener("change",()=>{if(!multiple.checked&&variants.length>1){multiple.checked=true;alert("Remova as novas variações primeiro. As existentes são preservadas.");}syncVariationFields();});syncVariationFields();
      const save=button("Salvar produto",async()=>{if(!channels.value)throw Error("Selecione o canal.");await api("/api/commerce/products",{store_id:id,product_id:product?.id,channel_id:channels.value,name:name.value,description:description.value,image_url:image.value,color:color.value,button_text:label.value,has_variations:multiple.checked,variants:variants.map(v=>({id:v.id,name:v.n.value,price_cents:Math.round(Number(v.price.value)*100),keys:v.keys.value,infinite:v.infinite.checked}))});await load();status.textContent="Produto e estoque salvos. Publique ou atualize o anúncio quando desejar.";});
      const basic=node("div",undefined,"product-fields");basic.append(field("Nome",name),field("Canal de vendas",channels),field("Descrição",description));
      const appearance=node("details",undefined,"product-section");appearance.append(node("summary","Aparência do anúncio"),field("Imagem (link HTTPS)",image),field("Cor da barra lateral",color),field("Texto do botão",label),preview);
      const inventory=node("details",undefined,"product-section");inventory.open=true;inventory.append(node("summary","Preço e estoque"),field("Usar variações",multiple),rows,addRow);
      const actions=node("div",undefined,"product-actions");actions.append(save,button("Cancelar",()=>editor.replaceChildren()));
      form.append(basic,appearance,inventory,actions);
      form.scrollIntoView({behavior:"smooth",block:"start"});
      const result=await api("/api/store/channels?store="+encodeURIComponent(id));if(!editor.contains(form)||stores.value!==id)return;
      for(const c of result.channels){const o=new Option("#"+c.name+(c.available?"":" — sem permissão"),c.id);o.disabled=!c.available;channels.append(o);}channels.value=product?.channel_id||"";channels.disabled=Boolean(product?.message_id);
    }
    stores.addEventListener("change",()=>load().catch(e=>status.textContent=e.message));
    api("/api/store/channels").then(d=>{for(const s of d.stores.filter(s=>s.id===ZYNOX.store?.id))stores.append(new Option(s.name,s.id));if(ZYNOX.store){stores.value=ZYNOX.store.id;stores.disabled=true;}status.textContent=d.stores.length?"Selecione a loja.":"Vincule uma loja em Servidores.";if(ZYNOX.store)return load();}).catch(e=>status.textContent=e.message);
    return;
  }

  if (page === "payments") {
    const box=panel("Notificações de vendas","Escolha onde e como as compras confirmadas serão anunciadas no Discord.");
    const stores=select([["","Selecione a loja"]]),status=node("p","Carregando lojas..."),list=node("div");
    const config=node("div",undefined,"sale-config");
    const manual=node("details",undefined,"product-section");manual.append(node("summary","Conferir pagamentos Pix manual"),list);
    box.append(config,status,manual);main.append(box);
    const channel=select([["","Selecione o canal"]]),style=select([["classic","Clássico"],["compact","Compacto"],["premium","Premium"]]),preview=node("div",undefined,"control-item"),settingsStatus=node("p","Carregando canais...");
    const examples={
      classic:"🎉 Nova venda confirmada!\nProduto: Gerador de Sensi\nComprador: @cliente\nValor: R$ 20,00",
      compact:"💜 Venda realizada\n@cliente comprou Gerador de Sensi por R$ 20,00.",
      premium:"✦ ZYNOX • VENDA APROVADA\n🛍️ Gerador de Sensi\n👤 @cliente\n💰 Receita bruta: R$ 20,00"
    };
    const presets=node("div",undefined,"zynox-notification-presets");
    const templates=[["classic","Clássico"],["compact","Compacto"],["premium","Premium"]];
    const presetUrl=id=>"/notification-"+id+".svg";
    const renderPresets=()=>{presets.replaceChildren();for(const [id,title] of templates){const card=node("button",undefined,"zynox-notification-preset");card.type="button";card.dataset.style=id;card.setAttribute("aria-pressed",String(imageUrl.value===presetUrl(id)));const picture=node("img");picture.src=presetUrl(id);picture.alt="Modelo visual "+title;picture.loading="lazy";card.append(picture,node("strong",title));card.addEventListener("click",()=>{style.value=id;imageUrl.value=presetUrl(id);show();renderPresets();});presets.append(card);}};
    const imageUrl=input("https://exemplo.com/imagem.gif","url");imageUrl.placeholder="Link direto da imagem ou GIF (HTTPS)";
    const imagePicker=input("","file");imagePicker.accept="image/png,image/jpeg,image/webp,image/gif";imagePicker.style.display="none";
    const uploadStatus=node("p","Envie uma imagem do celular ou informe o link direto.");
    const uploadButton=button("Escolher imagem ou GIF do celular",()=>imagePicker.click());
    imagePicker.addEventListener("change",async()=>{
      const file=imagePicker.files?.[0];if(!file)return;
      const localPreview=URL.createObjectURL(file);imagePreview.src=localPreview;imagePreview.style.display="block";uploadStatus.textContent="Prévia local carregada. Enviando imagem...";
      if(file.size>5*1024*1024){uploadStatus.textContent="Limite de 5 MB.";return;}
      uploadStatus.textContent="Enviando imagem...";
      try{
        const response=await fetch("/api/media/sales?store="+encodeURIComponent(ZYNOX.store.id),{method:"POST",headers:{"Content-Type":file.type},body:file});
        const data=await response.json();if(!response.ok)throw Error(data.error||"Falha no envio.");
        imageUrl.value=data.url;show();renderPresets();uploadStatus.textContent="Imagem enviada. Clique em Salvar notificações.";
      }catch(e){uploadStatus.textContent=e.message+" A prévia é local e não foi salva.";}
    });
    const imagePreview=node("img");imagePreview.alt="Prévia da imagem";imagePreview.style.cssText="display:none;max-width:100%;max-height:240px;object-fit:contain;border-radius:12px";
    const show=()=>{preview.textContent=examples[style.value];const url=imageUrl.value.trim();imagePreview.style.display=/^(https:\/\/|\/notification-(classic|compact|premium)\.svg$)/i.test(url)?"block":"none";if(imagePreview.style.display==="block")imagePreview.src=url;};style.addEventListener("change",()=>{show();renderPresets();});imageUrl.addEventListener("input",()=>{show();renderPresets();});imageUrl.value=presetUrl(style.value);show();renderPresets();preview.style.whiteSpace="pre-line";

    const editToggle=node("input");editToggle.type="checkbox";editToggle.checked=false;
    const editToggleLabel=node("label"," Ativar edição de texto");editToggleLabel.style.cssText="display:flex;align-items:center;gap:10px;font-weight:700;cursor:pointer;margin:16px 0";editToggleLabel.prepend(editToggle);
    const editSection=node("div");editSection.style.display="none";
    editToggle.addEventListener("change",()=>{editSection.style.display=editToggle.checked?"block":"none";renderOverlay();});
    const editTitle=node("h3","Editar texto na imagem");
    const editText=node("textarea",undefined,"control-input");editText.rows=3;editText.value="PAGAMENTO CONFIRMADO\nProduto: {produto}\nCliente: {cliente}\nValor: {valor}";
    const editHint=node("p","Arraste o texto na prévia para posicionar. Use {produto}, {cliente} e {valor} como exemplos. Para gravar o texto na imagem, é necessário o armazenamento R2.");
    const textSize=input("","number");textSize.min="12";textSize.max="90";textSize.value="30";
    const textColor=input("","color");textColor.value="#ffffff";
    const textX=input("","range");textX.min="0";textX.max="100";textX.value="50";
    const textY=input("","range");textY.min="0";textY.max="100";textY.value="50";
    const imageStage=node("div");imageStage.style.cssText="position:relative;display:none;width:100%;max-width:540px;overflow:hidden;border-radius:12px;touch-action:none;background:#120b26";
    const stageImage=node("img");stageImage.style.cssText="display:block;width:100%;height:auto;max-height:420px;object-fit:contain";
    const overlay=node("div");overlay.style.cssText="position:absolute;white-space:pre-line;max-width:94%;text-align:center;transform:translate(-50%,-50%);font-weight:800;text-shadow:0 2px 7px #000,0 0 3px #000;cursor:grab;touch-action:none;overflow-wrap:anywhere";
    imageStage.append(stageImage,overlay);
    const renderOverlay=()=>{
      overlay.style.display=editToggle.checked?"block":"none";
      overlay.textContent=editText.value.replaceAll("{produto}","Gerador de Sensi").replaceAll("{cliente}","@cliente").replaceAll("{valor}","R$ 20,00");
      overlay.style.left=textX.value+"%";overlay.style.top=textY.value+"%";
      overlay.style.color=textColor.value;overlay.style.fontSize=Math.max(10,Number(textSize.value)||30)*Math.min(imageStage.clientWidth||360,540)/540+"px";
      const source=imagePreview.src;imageStage.style.display=imagePreview.style.display==="block"?"block":"none";
      if(source&&stageImage.src!==source)stageImage.src=source;
    };
    for(const control of [editText,textSize,textColor,textX,textY])control.addEventListener("input",renderOverlay);
    overlay.addEventListener("pointerdown",event=>{event.preventDefault();overlay.setPointerCapture(event.pointerId);});
    overlay.addEventListener("pointermove",event=>{
      if(!editToggle.checked||!overlay.hasPointerCapture(event.pointerId))return;
      const rect=imageStage.getBoundingClientRect();
      textX.value=String(Math.round(Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100))));
      textY.value=String(Math.round(Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100))));
      renderOverlay();
    });
    const exportButton=button("Aplicar texto à imagem",async()=>{
      if(!editToggle.checked)throw Error("Ative a edição de texto antes de aplicar.");
      if(!stageImage.complete||!stageImage.naturalWidth)throw Error("Aguarde a imagem carregar.");
      const canvas=document.createElement("canvas");canvas.width=stageImage.naturalWidth;canvas.height=stageImage.naturalHeight;
      const ctx=canvas.getContext("2d");ctx.drawImage(stageImage,0,0);
      const scale=canvas.width/540;const size=Math.max(12,Number(textSize.value)||30)*scale;
      ctx.fillStyle=textColor.value;ctx.strokeStyle="#000000";ctx.lineWidth=Math.max(2,4*scale);ctx.font="800 "+size+"px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
      const lines=overlay.textContent.split("\n");const cx=canvas.width*Number(textX.value)/100,cy=canvas.height*Number(textY.value)/100;
      const wrap=[];for(const line of lines){let current="";for(const word of line.split(/\s+/)){const next=current?current+" "+word:word;if(ctx.measureText(next).width>canvas.width*.88&&current){wrap.push(current);current=word;}else current=next;}wrap.push(current);}
      const start=cy-(wrap.length-1)*size*1.18/2;wrap.forEach((line,i)=>{const y=start+i*size*1.18;ctx.strokeText(line,cx,y);ctx.fillText(line,cx,y);});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw Error("Não foi possível criar a imagem.");
      const response=await fetch("/api/media/sales?store="+encodeURIComponent(ZYNOX.store.id),{method:"POST",headers:{"Content-Type":"image/png"},body:blob});
      const data=await response.json();if(!response.ok)throw Error(data.error||"Falha ao enviar imagem.");
      imageUrl.value=data.url;imagePreview.src=data.url;uploadStatus.textContent="Imagem editada enviada. Agora clique em Salvar notificações.";renderPresets();renderOverlay();
    });
    const refreshEditor=()=>{renderOverlay();};
    imagePreview.addEventListener("load",refreshEditor);
    stageImage.addEventListener("load",renderOverlay);
    imageUrl.addEventListener("input",()=>requestAnimationFrame(renderOverlay));
    style.addEventListener("change",()=>requestAnimationFrame(renderOverlay));
    presets.addEventListener("click",()=>requestAnimationFrame(renderOverlay));
    imagePicker.addEventListener("change",()=>setTimeout(renderOverlay,100));
    requestAnimationFrame(renderOverlay);
    editSection.append(editTitle,field("Texto da imagem",editText),editHint,field("Tamanho da fonte",textSize),field("Cor do texto",textColor),field("Posição horizontal",textX),field("Posição vertical",textY),imageStage,exportButton);
    config.append(node("h3","Canal de confirmação de compras"),field("Canal do Discord",channel),node("h3","Escolha um modelo pronto"),presets,field("Imagem ou GIF da notificação",imageUrl),uploadButton,imagePicker,uploadStatus,node("h3","Prévia da imagem da notificação"),imagePreview,editToggleLabel,editSection,button("Salvar notificações",async()=>{if(!channel.value)throw Error("Selecione primeiro o canal do Discord para publicar as notificações.");await api("/api/commerce/sale-notifications",{store_id:ZYNOX.store.id,channel_id:channel.value,template:style.value,image_url:imageUrl.value.trim()});settingsStatus.textContent="Canal e modelo salvos."; }),settingsStatus);
    Promise.all([api("/api/store/channels?store="+encodeURIComponent(ZYNOX.store.id)),api("/api/commerce/sale-notifications?store="+encodeURIComponent(ZYNOX.store.id))]).then(([d,n])=>{for(const c of d.channels){const o=new Option("#"+c.name+(c.available?"":" (sem permissão)"),c.id);o.disabled=!c.available;channel.append(o);}if(!n.settings&&d.channels.filter(c=>c.available).length===1)channel.value=d.channels.find(c=>c.available).id;if(n.settings){channel.value=n.settings.channel_id;style.value=n.settings.template;imageUrl.value=n.settings.image_url||presetUrl(style.value);show();renderPresets();}settingsStatus.textContent=n.migration_needed?"É necessário aplicar as migrações 0007 e 0010 no banco D1.":"Selecione um canal e salve o modelo.";}).catch(e=>settingsStatus.textContent=e.message);
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
          card.append(field("ID da transação no extrato",ref),field("Conferi o crédito e o valor na minha conta bancária",verified),button("Confirmar recebimento",async()=>{if(!verified.checked)throw Error("Confira o extrato primeiro.");if(!await confirmInApp("Confirma que o valor foi recebido na sua conta?"))return;await api("/api/commerce/manual-pix/confirm",{store_id:id,order_id:o.order_id,bank_reference:ref.value,verified:true});await load();}));
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
    const box=panel("Gateways e bancos","Escolha a opção abaixo.");
    const nav=node("div",undefined,"control-navigation"),content=node("div");
    const options=[["pix","Pix manual"],["banks","Bancos"],["gateways","Gateways"]];
    const banks=[["nubank","Nubank"],["mercadopago","Mercado Pago"],["picpay","PicPay"],["itau","Itaú"],["inter","Banco Inter"],["bradesco","Bradesco"],["caixa","Caixa"],["bb","Banco do Brasil"],["santander","Santander"],["other","Outro banco"]];
    let tab="pix",selectedBank="nubank",bankLoaded=false;
    const bankNames=Object.fromEntries(banks);
    function render(){
      content.replaceChildren();nav.replaceChildren();
      for(const [key,title] of options){const b=button(title,()=>{tab=key;render();});if(key===tab)b.classList.add("selected");nav.append(b);}
      if(tab==="gateways"){content.append(node("h3","Gateways"),node("p","EM BREVE !"));return;}
      if(tab==="banks"){
         content.append(node("h3","Bancos — configuração Pix manual"),node("p","Escolha seu banco e cadastre a chave Pix. O cadastro não conecta a conta bancária nem consulta saldos."));
         const grid=node("div",undefined,"zynox-bank-grid");
         for(const [id,name] of banks){const b=button(name,()=>{selectedBank=id;bankLoaded=true;render();});if(id===selectedBank)b.classList.add("selected");grid.append(b);}
         content.append(grid);
       }
       const status=node("p","Carregando configuração...");
       content.append(node("h3",tab==="banks"?"Informações do banco":"Pix manual"),node("p","Banco: "+bankNames[selectedBank]),status);
       api("/api/commerce/manual-pix?store="+encodeURIComponent(ZYNOX.store.id)).then(m=>{
        if(tab!=="pix"&&tab!=="banks")return;
        const type={value:"CPF"},typeChoice=node("div",undefined,"zynox-choice"),typeButton=button("CPF ▾",()=>{typeOptions.hidden=!typeOptions.hidden;}),typeOptions=node("div",undefined,"zynox-choice-options");
         for(const [code,label] of [["CPF","CPF"],["CNPJ","CNPJ"],["EMAIL","E-mail"],["PHONE","Telefone (+55)"],["EVP","Chave aleatória"]])typeOptions.append(button(label,()=>{type.value=code;typeButton.textContent=label+" ▾";typeOptions.hidden=true;}));
         typeOptions.hidden=true;typeChoice.append(typeButton,typeOptions);
         const key=input("Sua chave Pix"),recipient=input("Nome do titular"),city=input("Cidade do titular"),consent=input("","checkbox");
        if(m.settings){if(!bankLoaded){selectedBank=m.settings.bank;bankLoaded=true;render();return;}if(m.settings.bank===selectedBank){type.value=m.settings.key_type;typeButton.textContent=({"CPF":"CPF","CNPJ":"CNPJ","EMAIL":"E-mail","PHONE":"Telefone (+55)","EVP":"Chave aleatória"}[type.value]||"CPF")+" ▾";key.value=m.settings.pix_key;recipient.value=m.settings.recipient;city.value=m.settings.merchant_city||"";}}
        status.textContent=m.settings?.enabled&&m.settings.bank===selectedBank?"Pix manual cadastrado para "+bankNames[selectedBank]+" — sem conexão bancária automática":"Banco ainda não cadastrado";
        content.append(field("Tipo de chave",typeChoice),field("Chave Pix",key),field("Titular da conta",recipient),field("Cidade do titular",city),field("Autorizo mostrar a chave privadamente aos compradores",consent),button("Salvar Pix manual",async()=>{
          await api("/api/commerce/manual-pix",{store_id:ZYNOX.store.id,bank:selectedBank,key_type:type.value,pix_key:key.value,recipient:recipient.value,merchant_city:city.value,accept_disclosure:consent.checked});toast("Pix manual salvo. Não é uma conexão bancária automática.",true);bankLoaded=true;render();
        }));
        if(m.settings?.enabled)content.append(button("Desativar Pix manual",async()=>{await api("/api/commerce/manual-pix",{store_id:ZYNOX.store.id,enabled:false});render();}));
      }).catch(e=>toast(e.message));
    }
    box.append(nav,content);main.append(box);render();return;
  }

  if (["sales","customers","coupons","tickets","reports"].includes(page)) {
    const descriptions={sales:"Acompanhe os pedidos e as vendas da sua loja.",customers:"Consulte seus clientes e o histórico de compras.",coupons:"Gerencie os cupons da sua loja.",tickets:"Acompanhe os chamados registrados.",reports:"Indicadores de pedidos e vendas da loja."};
    const box=panel(pageNames[page],descriptions[page]);
    const stores=select([["","Selecione a loja"]]),status=node("p","Carregando lojas..."),list=node("div");
    box.append(status,list);main.append(box);
    const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n||0)/100);
    const labels={pending:"Pendente",paid:"Vendido — entrega pendente",delivering:"Vendido — entrega em andamento",delivered:"Vendido — entregue",cancelled:"Cancelado",expired:"Expirado",open:"Aberto",closed:"Fechado"};
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
        const chooser=node("div"),form=node("div"),products=await api("/api/commerce/products?store="+encodeURIComponent(id));
        const active=products.products.filter(p=>p.status!=="archived");
        list.append(node("h3","Escolha um produto para aplicar desconto"),chooser,form);
        if(!active.length){chooser.append(node("p","Cadastre um produto primeiro."));return;}
        const productSelect=select([["","Selecione um produto"],...active.map(p=>[p.id,p.name])]);
        const showForm=()=>{
          form.replaceChildren();
          if(!productSelect.value)return;
          const p=active.find(x=>x.id===productSelect.value);
          const code=input("Ex.: PROMO10"),discount=input("Desconto %","number");discount.min="1";discount.max="100";
          form.append(node("h3","Criar cupom para "+p.name),field("Código do cupom",code),field("Desconto (%)",discount),button("Criar cupom",async()=>{await api("/api/commerce/coupons",{store_id:id,product_id:p.id,code:code.value,discount:Number(discount.value)});await load();}));
        };
        productSelect.addEventListener("change",showForm);
        chooser.append(field("Produto",productSelect));
        list.append(node("h3","Cupons cadastrados"));
        for(const c of d.coupons){
          const p=active.find(x=>x.id===c.product_id);
          list.append(card(c.code,"Produto: "+(p?.name||"Cupom antigo sem produto definido"),"Desconto: "+c.discount+"%","Status: "+(c.active?"Ativo":"Inativo"),"Usos: "+c.uses));
        }
        if(!d.coupons.length)list.append(node("p","Nenhum cupom cadastrado."));
        list.append(node("p","A aplicação do desconto no carrinho ainda não está habilitada."));
      }else{
        const announcements=node("div"),editor=node("div");
        const channels=await api("/api/store/channels?store="+encodeURIComponent(id));
        const available=channels.channels.filter(c=>c.available);
        const panelData=await api("/api/commerce/ticket-panels?store="+encodeURIComponent(id));
        list.append(button("+ Criar anúncio de ticket",()=>openTicketEditor()),announcements,editor);
        function openTicketEditor(existing=null){
          editor.replaceChildren();
          const form=panel(existing?"Editar anúncio":"Novo anúncio de tickets","Configure a mensagem e as opções de atendimento.");
          const channel=select([["","Selecione o canal"],...available.map(c=>[c.id,"#"+c.name])]);
          const title=input("Título do anúncio"),description=node("textarea");description.className="control-input";description.rows=4;description.placeholder="Mensagem que aparece no Discord";
          const mode=select([["buttons","Botões"],["select","Tabelinha (menu suspenso)"]]),items=node("div");
          title.value=existing?.title||"Central de atendimento";description.value=existing?.description||"Selecione uma opção para abrir seu ticket.";
          if(existing){channel.value=existing.channel_id;channel.disabled=true;mode.value=existing.mode;}
          const rows=[];
          function addOption(data={label:"",color:"roxo",description:""}){
            if(rows.length>=5){toast("Máximo de cinco opções.");return;}
            const wrapper=node("div",undefined,"control-item"),label=input("Ex.: Suporte ou Receber produto"),color=select([["roxo","Roxo"],["cinza","Cinza"],["verde","Verde"],["vermelho","Vermelho"]]),desc=input("Descrição curta (opcional)");
            label.value=data.label||"";color.value=data.color||"roxo";desc.value=data.description||"";
            const row={wrapper,label,color,desc};rows.push(row);
            wrapper.append(field("Nome do botão/opção",label),field("Cor do botão",color),field("Descrição",desc),button("Remover opção",()=>{rows.splice(rows.indexOf(row),1);wrapper.remove();},true));items.append(wrapper);
          }
          for(const option of existing?.options||[{label:"Suporte",color:"roxo"},{label:"Receber produto",color:"verde"}])addOption(option);
          form.append(field("Canal de anúncio",channel),field("Título",title),field("Mensagem",description),field("Formato",mode),node("h3","Botões ou opções"),items,button("+ Adicionar opção",()=>addOption()),button(existing?"Salvar alterações no Discord":"Publicar anúncio no Discord",async()=>{
            await api("/api/commerce/ticket-panels",{store_id:id,panel_id:existing?.id,channel_id:channel.value,title:title.value,description:description.value,mode:mode.value,options:rows.map(x=>({label:x.label.value,color:x.color.value,description:x.desc.value}))});
            toast("Anúncio publicado no Discord.",true);await load();
          }),button("Cancelar",()=>editor.replaceChildren()));
          editor.append(form);
        }
        for(const p of panelData.panels)announcements.append(card(p.title,"Canal: "+(available.find(c=>c.id===p.channel_id)?.name||p.channel_id),"Formato: "+(p.mode==="buttons"?"Botões":"Tabelinha")),button("Editar anúncio",()=>openTicketEditor(p)));
        if(!panelData.panels.length)announcements.append(node("p","Nenhum anúncio de ticket publicado."));
        list.append(node("h3","Tickets abertos"));
        for(const t of d.tickets)list.append(card(t.subject||"Ticket","Status: "+(labels[t.status]||t.status),"Data: "+formatDate(t.created_at),"Canal: "+t.channel_id));
        if(!d.tickets.length)list.append(node("p","Nenhum ticket registrado."));
        list.append(node("p","As cores seguem as quatro opções permitidas pelo Discord. O bot precisa de Gerenciar Canais para criar tickets privados."));
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
    const box=panel("Suporte ZYNOX","Precisa de ajuda? Entre no servidor oficial da ZYNOX e abra um ticket para falar com nossa equipe.");
    box.append(node("p","Você também poderá entrar em contato diretamente pelo WhatsApp quando o número oficial for configurado."));
    const discord=window.ZYNOX_SUPPORT_DISCORD_URL,whatsapp=window.ZYNOX_SUPPORT_WHATSAPP_URL;
    for(const [label,url] of [["Entrar no Discord",discord],["Falar no WhatsApp",whatsapp]]){
      if(url&&/^https:\/\//.test(url)){const link=node("a",label,"control-button");link.href=url;link.target="_blank";link.rel="noopener noreferrer";box.append(link);}
      else{const b=button(label+" — aguardando link oficial",()=>{});b.disabled=true;box.append(b);}
    }
    main.append(box);return;
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
    box.append(status,content);main.append(box);
    const card=(title,...lines)=>{const c=node("div",undefined,"control-item");c.append(node("h3",title),...lines.map(x=>node("p",x)));return c;};
    async function load(){const id=stores.value;content.replaceChildren();if(!id)return;status.textContent="Carregando...";
      const d=await api("/api/commerce/"+page+"?store="+encodeURIComponent(id));if(stores.value!==id)return;status.textContent="Dados atualizados.";
      if(page==="settings"){
        const name=input("Nome da loja");name.value=d.store.name;name.maxLength=100;content.append(field("Nome da loja",name),node("p","Servidor Discord: "+d.store.guild_id),button("Salvar alterações",async()=>{const result=await api("/api/commerce/settings",{store_id:id,name:name.value});ZYNOX.store.name=result.name;updateProfile();status.textContent="Configurações salvas."; }),node("h3","Gerenciar conexão do bot"),node("p","A remoção do bot não apaga o histórico de vendas ou produtos."),button("Remover bot do servidor",async()=>{if(!await confirmInApp("Deseja realmente remover a ZYNOX deste servidor?"))return;await api("/api/server-controls/action",{store_id:id,action:"leave",confirm:true});ZYNOX.store=null;navigate("servers");},true));
      }else if(page==="integrations"){
        content.append(card("Discord","Servidor vinculado: "+d.discord.guild_id,d.discord.bot_configured?"Token do bot configurado":"Token do bot não configurado"),button("Gerenciar servidores",()=>navigate("servers")),node("h3","Provedores de pagamento"));for(const g of d.gateways)content.append(card(g.provider,g.status+(g.is_primary?" — principal":"")));if(!d.gateways.length)content.append(node("p","Nenhum provedor conectado."));content.append(button("Gerenciar gateways",()=>navigate("gateways")),card("ZYNOX Wallet","EM BREVE !"),card("Zynox AI","Ainda não disponível"),node("p","Pagamentos reais não habilitados."));
      }else{
        content.append(card("Entrega por DM",d.delivery.configured?"Credenciais configuradas":"Credenciais pendentes","Entrega de estoque finito após pagamento verificado. Estoque infinito ainda não suportado."),card("Pagamento Pix",d.payments.sandbox_enabled?"Ambiente de testes habilitado":"Cobranças desativadas"),node("h3","Últimos pedidos pagos"));for(const o of d.rows)content.append(card(o.product_name,o.status==="delivered"?"Entregue":"Entrega pendente","Pagamento: "+formatDate(o.paid_at),"Entrega: "+formatDate(o.delivered_at),"Pedido: "+o.id));if(!d.rows.length)content.append(node("p","Nenhuma entrega registrada."));content.append(node("p","A configuração de novas regras automáticas ainda está em desenvolvimento."));
      }
    }
    stores.addEventListener("change",()=>load().catch(e=>status.textContent=e.message));api("/api/store/channels").then(d=>{for(const s of d.stores.filter(s=>s.id===ZYNOX.store?.id))stores.append(new Option(s.name,s.id));if(ZYNOX.store){stores.value=ZYNOX.store.id;stores.disabled=true;}status.textContent="Servidor selecionado.";if(ZYNOX.store)return load();}).catch(e=>status.textContent=e.message);return;
  }

  if (page === "servers") {
    const wrapper=node("section",undefined,"server-entry");
    const head=node("div",undefined,"server-entry-head");
    head.append(node("span","✦ ZYNOX / GERENCIAMENTO","server-eyebrow"),node("h1","Seus servidores"),node("p","Selecione onde deseja gerenciar suas vendas, produtos e automações."));
    const actions=node("div",undefined,"server-entry-actions");
    const invite=node("a","Usar bot oficial da ZYNOX","control-button");
    invite.href="https://discord.com/oauth2/authorize?client_id=1575192990132076637&permissions=85008&scope=bot%20applications.commands";
    invite.target="_blank";invite.rel="noopener noreferrer";
    const refresh=button("Atualizar",()=>load());actions.append(invite,button("Conectar meu próprio bot",()=>navigate("bot")),refresh);
    const notice=node("p",undefined,"server-entry-notice"),list=node("div",undefined,"server-grid");
    const foot=node("div",undefined,"server-entry-footer");
    foot.append(button("Minha conta",()=>navigate("account")));
    if(isAdmin())foot.append(button("ZYNOX CONTROL",()=>navigate("control")));
    wrapper.append(head,actions,notice,list,foot);main.append(wrapper);
    async function load(){
      notice.textContent="Carregando servidores...";
      list.replaceChildren();
      let data;
      try{data=await api("/api/server-controls");}
      catch(e){notice.textContent="Não foi possível carregar os servidores: "+e.message;list.append(button("Tentar novamente",load));return;}
      notice.textContent=data.controls_ready?"Escolha um servidor para continuar.":"Seus servidores estão disponíveis. Os controles de pausa e remoção precisam da atualização do banco D1.";
      for(const server of data.stores){
        if(server.removed_at)continue;
        const card=node("article",undefined,"server-card");
        const badge=node("span",server.enabled?"● Ativo":"● Pausado","server-status"+(server.enabled?"":" is-paused"));
        const icon=node("div",server.name?.slice(0,2).toUpperCase()||"ZY","server-avatar");
        if(server.icon_url){
          const img=node("img");img.src=server.icon_url;img.alt="Ícone do servidor "+server.name;img.loading="lazy";img.referrerPolicy="no-referrer";img.addEventListener("error",()=>img.remove());icon.append(img);
        }
        const top=node("div",undefined,"server-card-top");top.append(icon,badge);
        card.append(top,node("h2",server.name),node("p","Servidor conectado ao Discord"),node("p",server.enabled_since?"Ativo desde "+formatDate(server.enabled_since):"Adicionado em "+formatDate(server.created_at),"server-date"));
        const controls=node("div",undefined,"server-card-actions");
        controls.append(button("Gerenciar servidor",()=>{ZYNOX.store=server;try{sessionStorage.setItem("zynox:store:"+ZYNOX.user.id,JSON.stringify({id:server.id,name:server.name,guild_id:server.guild_id}));}catch{}updateProfile();navigate("home");}));
        if(data.controls_ready){
          controls.append(button(server.enabled?"Pausar":"Reativar",async()=>{await api("/api/server-controls/action",{store_id:server.id,action:server.enabled?"pause":"resume"});await load();}));
          controls.append(button("Remover",async()=>{if(!await confirmInApp("Remover o bot do servidor? Os registros serão preservados."))return;await api("/api/server-controls/action",{store_id:server.id,action:"leave",confirm:true});if(ZYNOX.store?.id===server.id){ZYNOX.store=null;try{sessionStorage.removeItem("zynox:store:"+ZYNOX.user.id);}catch{}}await load();},true));
        }
        card.append(controls);list.append(card);
      }
      if(!data.stores.some(s=>!s.removed_at)){
        const empty=node("div",undefined,"server-empty");
        empty.append(node("h2","Nenhum servidor conectado"),node("p","Escolha o bot oficial da ZYNOX ou conecte seu próprio bot para começar."));
        list.append(empty);
      }
      try{
        const discord=await api("/api/discord/servers");
        if(discord.needsDiscord)list.append(button("Vincular minha conta Discord",()=>location.href="/auth/discord/link"));
        for(const g of discord.servers||[]){
          const existing=data.stores.find(x=>x.guild_id===g.id);
          if(existing&&!existing.removed_at)continue;
          const card=node("article",undefined,"server-card");
          card.append(node("span","DISPONÍVEL PARA VINCULAR","server-eyebrow"),node("h2",g.name),button("Vincular servidor",async()=>{await api("/api/discord/store/link",{guild_id:g.id,name:g.name});await load();}));
          list.append(card);
        }
      }catch(e){notice.textContent+=" Não foi possível atualizar a lista do Discord; os servidores já vinculados continuam acessíveis.";}
    }
    load();return;
  }

  if (page === "bot" || page === "bot-settings") {
    const configuring=page==="bot-settings";
    const box=panel(configuring?"Configurar bot":"Meus bots",configuring?"Personalize o perfil do seu bot.":"Gerencie os bots conectados à ZYNOX.");
    box.classList.add("bot-settings-compact");main.append(box);
    const content=node("div",undefined,"bot-workspace");box.append(content);
    const status=node("p","Carregando bots...","bot-inline-status");content.append(status);
    const labels={online:"Online",connecting:"Conectando",offline:"Offline",unavailable:"Indisponível"};
    const imageFile=async file=>{if(!file)return null;if(file.size>1024*1024)throw Error("Imagem de até 1 MB.");return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error("Falha ao ler imagem."));reader.readAsDataURL(file);});};
    let generation=0;
    function onboarding(){
      content.replaceChildren();
      const form=node("div",undefined,"bot-workspace");
      const server=select([["","Carregando servidores..."]]),token=input("Token do bot","password");token.autocomplete="off";
      const message=node("p","","bot-inline-status"),authorize=button("Autorizar servidores",()=>location.href="/auth/discord/link");authorize.hidden=true;
      const guide=node("a","Criar bot no Discord Developer","bot-subtle-link");guide.href="https://discord.com/developers/applications";guide.target="_blank";guide.rel="noopener noreferrer";
      let validated=null,invited=false;
      const action=button("Validar token",async()=>{
        if(!server.value||!token.value.trim())throw Error("Escolha o servidor e informe o token.");
        if(!validated){validated=await api("/api/custom-bot/validate",{guild_id:server.value,token:token.value.trim()});action.textContent="Adicionar bot";message.textContent="Token validado: "+validated.name;return;}
        if(!invited){window.open(validated.invite_url,"_blank","noopener,noreferrer");invited=true;action.textContent="Concluir conexão";message.textContent="Autorize o convite no Discord e volte para concluir.";return;}
        const result=await api("/api/custom-bot/link",{guild_id:server.value,token:token.value.trim()});
        if(result.needs_install){invited=false;action.textContent="Adicionar bot";message.textContent="Convite ainda não concluído.";return;}
        token.value="";toast("Bot conectado.",true);ZYNOX.botSettingsId=result.store_id;navigate("bot-settings");
      });
      const reset=()=>{validated=null;invited=false;action.textContent="Validar token";message.textContent="";};
      server.addEventListener("change",reset);token.addEventListener("input",reset);
      form.append(button("← Meus bots",()=>navigate("bot")),field("Servidor Discord",server),authorize,field("Token do bot",token),guide,message,action);
      content.append(form);
      api("/api/discord/my-guilds").then(result=>{server.replaceChildren(new Option("Escolha o servidor",""),...result.servers.map(g=>new Option(g.name,g.id)));authorize.hidden=!result.needsAuthorization;if(result.needsAuthorization)message.textContent="Autorize a consulta aos servidores.";}).catch(e=>message.textContent=e.message);
    }
    async function loadSettings(id,host){
      const version=++generation;host.replaceChildren(node("p","Consultando perfil no Discord..."));
      if(!id)return;
      const result=await api("/api/custom-bot/details?store="+encodeURIComponent(id));
      if(version!==generation)return;
      host.replaceChildren();
      const preview=node("div",undefined,"bot-profile-preview");
      const cover=node("div",undefined,"bot-profile-cover");
      if(result.banner_url){const img=node("img");img.src=result.banner_url;img.alt="Banner atual";cover.append(img);}
      const identity=node("div",undefined,"bot-profile-identity"),avatar=node("img");avatar.src=result.avatar_url||"/zynox-logo.svg";avatar.alt="Foto atual do bot";avatar.className="bot-profile-avatar";
      const name=node("div",undefined,"bot-identity");name.append(node("strong",result.name),node("small",result.nickname===null?"Apelido não consultado":result.nickname||"Sem apelido no servidor"));
      const state=result.gateway?.state||"unavailable";identity.append(avatar,name,node("span",labels[state]||"Não verificado","bot-presence "+state));preview.append(cover,identity);host.append(preview);
      const power=node("section",undefined,"bot-setting-card bot-power-card");
      const powerStatus=node("p",result.gateway?.enabled===false?"Inicialização automática desativada.":"Inicialização automática habilitada.");
      const powerActions=node("div",undefined,"bot-power-actions");
      const changePower=async action=>{
        if(action==="disable"&&!await confirmInApp("Desligar a conexão Gateway deste bot?"))return;
        for(const b of powerActions.querySelectorAll("button"))b.disabled=true;
        try{
          const response=await api("/api/custom-bot/power",{store_id:id,action});
          result.gateway=response.gateway;
          powerStatus.textContent=response.gateway.enabled===false?"Inicialização automática desativada.":"Inicialização automática habilitada.";
          const badge=identity.querySelector(".bot-presence");const state=response.gateway.state;
          badge.textContent=labels[state]||"Não verificado";badge.className="bot-presence "+state;
          toast(action==="disable"?"Gateway desligado.":"Solicitação de conexão enviada.",true);
        }finally{for(const b of powerActions.querySelectorAll("button"))b.disabled=false;}
      };
      powerActions.append(button("Ligar",()=>changePower("enable")),button("Reiniciar",()=>changePower("restart")),button("Desligar",()=>changePower("disable"),true));
      power.append(node("h3","Controle do bot"),powerStatus,powerActions);host.append(power);
      if(result.gateway?.reason)power.append(node("p","Diagnóstico: "+result.gateway.reason));
      const advanced=node("details",undefined,"bot-setting-card");advanced.append(node("summary","Presença, comandos e credenciais"));
      const presence=select([["online","Online"],["idle","Ausente"],["dnd","Não perturbe"],["invisible","Invisível"]]);presence.value=result.gateway?.presence?.status||"online";
      const activity=input("Atividade do bot");activity.maxLength=100;activity.value=result.gateway?.presence?.activities?.[0]?.name||"";
      const activityType=select([["0","Jogando"],["2","Ouvindo"],["3","Assistindo"],["5","Competindo"]]);activityType.value=String(result.gateway?.presence?.activities?.[0]?.type??0);
      advanced.append(field("Presença",presence),field("Tipo de atividade",activityType),field("Atividade",activity),button("Salvar presença",async()=>{await api("/api/custom-bot/presence",{store_id:id,status:presence.value,activity:activity.value,type:Number(activityType.value)});toast("Presença configurada.",true);}),node("p","Última conexão: "+(result.gateway?.lastReady?formatDate(result.gateway.lastReady):"Não registrada")),node("p","Último heartbeat: "+(result.gateway?.lastAck?formatDate(result.gateway.lastAck):"Não registrado")),button("Registrar comandos",async()=>{const r=await api("/api/custom-bot/commands",{store_id:id});toast(r.success?"Comandos registrados.":"Alguns comandos não foram registrados.",r.success);}));
      const replacement=input("Novo token","password");replacement.autocomplete="off";
      advanced.append(field("Substituir token do mesmo bot",replacement),button("Substituir token",async()=>{try{await api("/api/custom-bot/replace-token",{store_id:id,token:replacement.value});toast("Token substituído.",true);}finally{replacement.value="";}}),button("Desconectar bot",async()=>{if(!await confirmInApp("Desconectar o bot da ZYNOX? A loja e seus registros serão preservados."))return;await api("/api/custom-bot/disconnect",{store_id:id,confirm:true});navigate("bot");},true));host.append(advanced);


      const grid=node("div",undefined,"bot-settings-grid"),pickers={};
      for(const kind of ["avatar","banner"]){
        const card=node("section",undefined,"bot-setting-card"),picker=node("input");picker.type="file";picker.accept="image/png,image/jpeg,image/gif,image/webp";picker.setAttribute("aria-label",kind==="avatar"?"Nova foto":"Novo banner");pickers[kind]=picker;
        card.append(node("h3",kind==="avatar"?"Foto de perfil":"Banner"),node("p","Até 1 MB"),picker);grid.append(card);
      }
      const bio=node("textarea");bio.value=result.bio??"";bio.maxLength=400;bio.rows=3;
      const nick=input("Apelido neste servidor");nick.value=result.nickname??"";nick.maxLength=32;
      const bioCard=node("section",undefined,"bot-setting-card"),nickCard=node("section",undefined,"bot-setting-card");
      bioCard.append(field("Biografia",bio));nickCard.append(field("Apelido",nick));grid.append(bioCard,nickCard);host.append(grid);
      const feedback=node("p",result.unavailable?.length?"Consulta parcial: "+result.unavailable.join("; ")+". Os campos não consultados podem ser preenchidos manualmente.":"","bot-inline-status");feedback.setAttribute("role","status");
      const save=button("Salvar",async()=>{
        const changes={};if(bio.value!==(result.bio??""))changes.bio=bio.value;if(nick.value!==(result.nickname??""))changes.nickname=nick.value;
        for(const kind of ["avatar","banner"]){const file=pickers[kind].files?.[0];if(file)changes[kind]=await imageFile(file);}
        if(!Object.keys(changes).length){feedback.textContent="Nenhuma alteração.";return;}
        const response=await api("/api/custom-bot/save",{store_id:id,changes});
        if(!response.success){const failed=Object.entries(response.results).filter(([,r])=>!r.ok).map(([k,r])=>({avatar:"Foto",banner:"Banner",bio:"Biografia",nickname:"Apelido"}[k]+" (HTTP "+r.status+")"));feedback.textContent="Falha em: "+failed.join(", ")+". As demais alterações podem ter sido salvas.";for(const [k,r] of Object.entries(response.results)){if(!r.ok)continue;if(k==="bio")result.bio=changes.bio;if(k==="nickname")result.nickname=changes.nickname;if(pickers[k])pickers[k].value="";}return;}
        toast("Alterações salvas.",true);if(version===generation)await loadSettings(id,host);
      });
      save.classList.add("bot-save-all");host.append(feedback,save);
    }
    api("/api/custom-bot/list").then(({bots})=>{
      content.replaceChildren();
      if(!configuring){
        const list=node("div",undefined,"bot-list");
        for(const bot of bots){const card=node("article",undefined,"bot-list-item"),identity=node("div",undefined,"bot-identity");identity.append(node("strong",bot.name),node("small",bot.store_name));card.append(identity,button("Configurar",()=>{ZYNOX.botSettingsId=bot.store_id;navigate("bot-settings");}));list.append(card);}
        if(!bots.length)list.append(node("p","Nenhum bot conectado."));
        content.append(list,button("+ Conectar outro bot",onboarding));return;
      }
      if(!bots.length){content.append(node("p","Nenhum bot conectado. Use a aba Conectar bot."));return;}
      const selector=select(bots.map(b=>[b.store_id,b.name+" · "+b.store_name])),host=node("div",undefined,"bot-workspace");
      if(bots.some(b=>b.store_id===ZYNOX.botSettingsId))selector.value=ZYNOX.botSettingsId;
      else if(bots.some(b=>b.store_id===ZYNOX.store?.id))selector.value=ZYNOX.store.id;
      const load=()=>{ZYNOX.botSettingsId=selector.value;loadSettings(selector.value,host).catch(e=>host.replaceChildren(node("p",e.message)));};
      selector.addEventListener("change",load);content.append(field("Bot conectado",selector),host);load();
    }).catch(e=>status.textContent=e.message);
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
    ZYNOX.discordProfile = null;
    try{const saved=JSON.parse(sessionStorage.getItem("zynox:store:"+ZYNOX.user.id)||"null");if(saved&&typeof saved.id==="string")ZYNOX.store=saved;}catch{}

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
    let savedPage="home";try{savedPage=sessionStorage.getItem("zynox:last-page")||"home";}catch{}
    navigate(pageNames[savedPage]?savedPage:"home");
    api("/api/me/profile").then(result=>{if(result.discord_profile){ZYNOX.discordProfile=result.discord_profile;updateProfile();if(ZYNOX.currentPage==="account")renderAccount(true);}}).catch(()=>{});

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

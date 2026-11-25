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
  control: "Zynox Control"
};

const descriptions = {
  bot: "Configure seu bot de vendas.",
  servers: "Gerencie seus servidores do Discord.",
  products: "Crie e publique seus produtos.",
  stock: "Gerencie chaves e estoque digital.",
  sales: "Acompanhe suas vendas e pedidos.",
  coupons: "Crie descontos e ofertas exclusivas.",
  customers: "Gerencie seus clientes.",
  automations: "Configure suas automações.",
  tickets: "Gerencie seus atendimentos.",
  payments: "Acompanhe seus pagamentos.",
  gateways: "Configure suas integrações financeiras.",
  wallet: "Gerencie seu saldo e movimentações.",
  ai: "Seu assistente inteligente ZYNOX.",
  reports: "Acompanhe o desempenho da sua loja.",
  integrations: "Conecte serviços externos.",
  plans: "Gerencie sua assinatura.",
  licenses: "Consulte suas licenças.",
  notifications: "Acompanhe suas notificações.",
  settings: "Personalize sua operação.",
  support: "Central de atendimento ZYNOX.",
  account: "Gerencie sua conta.",
  control: "Central administrativa ZYNOX."
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

function openMenu() {
  element("sidebar").hidden = false;
  element("overlay").hidden = false;

  document.body.classList.add("menu-open");

  element("open-menu").setAttribute(
    "aria-expanded", "true"
  );

  element("close-menu").focus();
}

function closeMenu() {
  element("sidebar").hidden = true;
  element("overlay").hidden = true;

  document.body.classList.remove("menu-open");

  element("open-menu").setAttribute(
    "aria-expanded", "false"
  );
}

function updateNavigation(page) {
  document.querySelectorAll(
    "#navigation [data-page]"
  ).forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });
}

function updateProfile() {
  const user = ZYNOX.user;

  if (!user) return;

  element("username").textContent =
    user.username;

  const welcome = element("welcome-name");

  if (welcome) {
    welcome.textContent = user.username;
  }

  let plan = ZYNOX.subscription?.plan ||
    "Sem assinatura";

  if (user.role === "owner") {
    plan = "DONO";
  }

  if (user.role === "admin") {
    plan = "ADMINISTRADOR";
  }

  element("user-plan").textContent = plan;

  element("admin-navigation").hidden =
    !isAdmin();
}

function createText(tag, className, text) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  node.textContent = text;

  return node;
}

function createPanel(title, content) {
  const panel = document.createElement("section");

  panel.className = "panel";

  panel.appendChild(
    createText("h2", "", title)
  );

  panel.appendChild(
    createText("p", "page-description", content)
  );

  return panel;
}

function renderAccount(container) {
  const user = ZYNOX.user;

  container.appendChild(
    createPanel("Nome de usuário", user.username)
  );

  container.appendChild(
    createPanel(
      "ID do Discord",
      user.discord_id || "Não vinculado"
    )
  );

  container.appendChild(
    createPanel(
      "Tipo de acesso",
      user.role === "owner"
        ? "Dono"
        : user.role === "admin"
          ? "Administrador"
          : "Assinante"
    )
  );
}

function renderPlans(container) {
  const subscription = ZYNOX.subscription;

  container.appendChild(
    createPanel(
      "Plano atual",
      subscription?.plan ||
      (isAdmin()
        ? "Acesso administrativo"
        : "Sem assinatura")
    )
  );

  if (subscription) {
    const expiration = subscription.lifetime
      ? "Vitalício"
      : subscription.expires_at
        ? new Date(
            subscription.expires_at
          ).toLocaleString("pt-BR")
        : "Não informado";

    container.appendChild(
      createPanel("Validade", expiration)
    );
  }
}

function renderControl(container) {
  container.appendChild(
    createPanel(
      "Gerenciamento de assinantes",
      "Integração administrativa em desenvolvimento."
    )
  );

  if (ZYNOX.user.role === "owner") {
    container.appendChild(
      createPanel(
        "Gerador de licenças",
        "Área exclusiva do proprietário."
      )
    );

    container.appendChild(
      createPanel(
        "Gerenciamento de administradores",
        "Área exclusiva do proprietário."
      )
    );
  }
}

function navigate(page) {
  if (!Object.hasOwn(pageNames, page)) return;

  if (page === "control" && !isAdmin()) {
    return;
  }

  ZYNOX.currentPage = page;

  const container = element("main-content");

  closeMenu();
  updateNavigation(page);

  if (page === "home" || page === "dashboard") {
    container.innerHTML = homeContent;

    updateProfile();

    window.scrollTo(0, 0);

    return;
  }

  container.replaceChildren();

  container.appendChild(
    createText(
      "h1",
      "page-title",
      pageNames[page]
    )
  );

  container.appendChild(
    createText(
      "p",
      "page-description",
      descriptions[page] || ""
    )
  );

  if (page === "account") {
    renderAccount(container);

  } else if (page === "plans") {
    renderPlans(container);

  } else if (page === "control") {
    renderControl(container);

  } else {
    container.appendChild(
      createText(
        "div",
        "empty-state",
        "Esta funcionalidade está em desenvolvimento."
      )
    );
  }

  window.scrollTo(0, 0);
}

async function logout() {
  try {
    const response = await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error("Falha ao sair");
    }

    window.location.replace("/");

  } catch (error) {
    alert("Não foi possível sair da conta.");
  }
}

function setupEvents() {
  element("open-menu").addEventListener(
    "click", openMenu
  );

  element("close-menu").addEventListener(
    "click", closeMenu
  );

  element("overlay").addEventListener(
    "click", closeMenu
  );

  element("logout").addEventListener(
    "click", logout
  );

  document.addEventListener("click", event => {
    const button = event.target.closest(
      "[data-page]"
    );

    if (button) {
      navigate(button.dataset.page);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}

async function initialize() {
  try {
    const response = await fetch("/api/me", {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (response.status === 401) {
      window.location.replace("/");
      return;
    }

    if (!response.ok) {
      throw new Error("Servidor indisponível");
    }

    const data = await response.json();

    if (!data.authenticated || !data.user) {
      window.location.replace("/");
      return;
    }

    ZYNOX.user = data.user;
    ZYNOX.subscription = data.subscription;

    if (!isAdmin() && !ZYNOX.subscription) {
      window.location.replace("/plans");
      return;
    }

    homeContent =
      element("main-content").innerHTML;

    setupEvents();
    updateProfile();
    updateNavigation("home");

    element("loading").hidden = true;
    element("app").hidden = false;

  } catch (error) {
    element("loading").replaceChildren();

    element("loading").appendChild(
      createText("h1", "", "ZYNOX")
    );

    element("loading").appendChild(
      createText(
        "p",
        "",
        "Não foi possível conectar ao servidor."
      )
    );

    const retry = createText(
      "button",
      "primary-button",
      "Tentar novamente"
    );

    retry.addEventListener("click", () => {
      window.location.reload();
    });

    element("loading").appendChild(retry);
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initialize
);

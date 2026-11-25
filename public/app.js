const ZYNOX = {
  name: "ZYNOX",
  version: "1.1.0",
  selectedPlan: null,
  selectedDuration: null,
  user: null,
  subscription: null
};

const pages = [
  "landing",
  "login",
  "access",
  "duration"
];

const plans = {
  starter: {
    name: "Starter",
    prices: [4.90, 8.90, 14.90, 39.90, 129.90, 199.90]
  },
  pro: {
    name: "Pro",
    prices: [7.90, 14.90, 24.90, 64.90, 219.90, 349.90]
  },
  premium: {
    name: "Premium",
    prices: [12.90, 24.90, 39.90, 99.90, 349.90, 549.90]
  }
};

const durations = [
  "7 dias",
  "15 dias",
  "30 dias",
  "90 dias",
  "1 ano",
  "Vitalício"
];

function showPage(page) {
  pages.forEach(id => {
    const element = document.getElementById(id);

    if (element) {
      element.hidden = id !== page;
    }
  });

  window.scrollTo(0, 0);
}

function openLogin() {
  showPage("login");
}

function openAccess() {
  showPage("access");
}

function goHome() {
  showPage("landing");
}

function discordLogin() {
  window.location.href = "/auth/discord";
}

function formatPrice(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function selectPlan(plan) {
  const key = String(plan).toLowerCase();
  const selected = plans[key];

  if (!selected) return;

  ZYNOX.selectedPlan = key;

  const title = document.getElementById("selected-plan");
  const container = document.getElementById("duration-options");

  if (title) {
    title.textContent = "Plano " + selected.name;
  }

  if (container) {
    container.innerHTML = "";

    durations.forEach((duration, index) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "duration-option";

      const name = document.createElement("strong");
      name.textContent = duration;

      const price = document.createElement("span");
      price.textContent = formatPrice(selected.prices[index]);

      button.appendChild(name);
      button.appendChild(price);

      button.addEventListener("click", () => {
        selectDuration(index);
      });

      container.appendChild(button);
    });

    const notice = document.createElement("p");

    notice.textContent =
      "Valores provisórios. Pagamentos ainda indisponíveis.";

    container.appendChild(notice);
  }

  showPage("duration");
}

function selectDuration(index) {
  const plan = plans[ZYNOX.selectedPlan];

  if (!plan || !durations[index]) return;

  ZYNOX.selectedDuration = {
    duration: durations[index],
    price: plan.prices[index]
  };

  openLogin();
}

async function checkServer() {
  try {
    const response = await fetch("/api/status", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Servidor indisponível");
    }

    const data = await response.json();

    console.log("ZYNOX:", data);

    return data;

  } catch (error) {
    console.error("ZYNOX: servidor indisponível.");
    return null;
  }
}

async function checkSession() {
  try {
    const response = await fetch("/api/me", {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.authenticated) {
      ZYNOX.user = data.user;
      ZYNOX.subscription = data.subscription;

      return data;
    }

    return null;

  } catch (error) {
    return null;
  }
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

    ZYNOX.user = null;
    ZYNOX.subscription = null;

    window.location.href = "/";

  } catch (error) {
    alert("Não foi possível encerrar a sessão.");
  }
}

function setupAccessForm() {
  const form = document.getElementById("access-form");
  const message = document.getElementById("login-message");

  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();

    if (message) {
      message.textContent =
        "Login administrativo ainda indisponível.";
    }

    const password = document.getElementById("password");

    if (password) {
      password.value = "";
    }
  });
}

function setupFAQ() {
  const items = document.querySelectorAll("details");

  items.forEach(item => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;

      items.forEach(other => {
        if (other !== item) {
          other.open = false;
        }
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupAccessForm();
  setupFAQ();
  checkServer();
  checkSession();
});

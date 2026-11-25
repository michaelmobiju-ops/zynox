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

const ZYNOX = {
  user: null,
  selectedPlan: null,
  selectedDuration: null,
  activating: false
};

function element(id) {
  return document.getElementById(id);
}

function formatPrice(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function selectPlan(key) {
  const plan = plans[key];

  if (!plan) return;

  ZYNOX.selectedPlan = key;

  element("selected-plan").textContent =
    "Plano " + plan.name;

  const container = element("duration-options");

  container.replaceChildren();

  durations.forEach((duration, index) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "duration-option";

    const title = document.createElement("strong");

    title.textContent = duration;

    const price = document.createElement("span");

    price.textContent =
      formatPrice(plan.prices[index]);

    button.appendChild(title);
    button.appendChild(price);

    button.addEventListener("click", () => {
      selectDuration(index);
    });

    container.appendChild(button);
  });

  element("duration-panel").hidden = false;

  element("duration-panel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function selectDuration(index) {
  const plan = plans[ZYNOX.selectedPlan];

  if (!plan || !durations[index]) return;

  ZYNOX.selectedDuration = {
    duration: durations[index],
    price: plan.prices[index]
  };

  alert(
    "Plano: " + plan.name +
    "\nDuração: " + durations[index] +
    "\nValor provisório: " +
    formatPrice(plan.prices[index]) +
    "\n\nPagamentos ainda indisponíveis."
  );
}

function showMessage(message, type = "") {
  const container = element("license-message");

  container.textContent = message;
  container.className = type;
}

async function activateLicense(event) {
  event.preventDefault();

  if (ZYNOX.activating) return;

  const input = element("license-key");
  const button = element("activate-license");

  const key = input.value.trim().toUpperCase();

  if (key.length < 12 || key.length > 128) {
    showMessage(
      "Insira uma chave de ativação válida.",
      "error"
    );

    return;
  }

  ZYNOX.activating = true;

  button.disabled = true;
  button.textContent = "Validando licença...";

  showMessage("Verificando sua KEY...");

  try {
    const response = await fetch(
      "/api/licenses/redeem",
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ key })
      }
    );

    if (response.status === 401) {
      window.location.replace("/");
      return;
    }

    if (
      response.status === 404 ||
      response.status === 501
    ) {
      showMessage(
        "O sistema de licenças ainda está indisponível.",
        "error"
      );

      return;
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      showMessage(
        data.error || "Não foi possível ativar a licença.",
        "error"
      );

      return;
    }

    input.value = "";

    showMessage(
      "Licença ativada com sucesso!",
      "success"
    );

    window.location.replace("/dashboard");

  } catch (error) {
    showMessage(
      "Erro de conexão. Tente novamente.",
      "error"
    );

  } finally {
    ZYNOX.activating = false;

    button.disabled = false;
    button.textContent = "Ativar licença";
  }
}

async function logout() {
  try {
    const response = await fetch(
      "/auth/logout",
      {
        method: "POST",
        credentials: "same-origin"
      }
    );

    if (!response.ok) {
      throw new Error("Falha ao sair");
    }

    window.location.replace("/");

  } catch (error) {
    alert("Não foi possível sair da conta.");
  }
}

function setupEvents() {
  document.querySelectorAll(
    "[data-plan]"
  ).forEach(button => {
    button.addEventListener("click", () => {
      selectPlan(button.dataset.plan);
    });
  });

  element("close-duration").addEventListener(
    "click",
    () => {
      element("duration-panel").hidden = true;

      document.querySelector(".plans")
        .scrollIntoView({
          behavior: "smooth"
        });
    }
  );

  element("license-form").addEventListener(
    "submit",
    activateLicense
  );

  element("logout").addEventListener(
    "click",
    logout
  );
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

    const admin = ["owner", "admin"].includes(
      data.user.role
    );

    if (admin || data.subscription) {
      window.location.replace("/dashboard");
      return;
    }

    element("username").textContent =
      data.user.username;

    setupEvents();

    element("loading").hidden = true;
    element("app").hidden = false;

  } catch (error) {
    const loading = element("loading");

    loading.replaceChildren();

    const title = document.createElement("h2");
    title.textContent = "ZYNOX";

    const message = document.createElement("p");

    message.textContent =
      "Não foi possível conectar ao servidor.";

    const retry = document.createElement("button");

    retry.textContent = "Tentar novamente";

    retry.addEventListener("click", () => {
      window.location.reload();
    });

    loading.appendChild(title);
    loading.appendChild(message);
    loading.appendChild(retry);
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initialize
);

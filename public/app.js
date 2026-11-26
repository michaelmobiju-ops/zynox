const ZYNOX = {
  name: "ZYNOX",
  version: "1.4.0",
  selectedPlan: null,
  selectedDuration: null,
  user: null,
  subscription: null
};

const pages = [
  "landing",
  "login",
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
  showPage("login");
}

function goHome() {
  showPage("landing");
}

function discordLogin() {
  window.location.href = "/auth/discord";
}

function formatPrice(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function selectPlan(planName) {
  const key = String(planName).toLowerCase();
  const plan = plans[key];

  if (!plan) return;

  ZYNOX.selectedPlan = key;

  const title = document.getElementById(
    "selected-plan"
  );

  const options = document.getElementById(
    "duration-options"
  );

  if (title) {
    title.textContent = plan.name;
  }

  if (options) {
    options.replaceChildren();

    durations.forEach((duration, index) => {
      const button = document.createElement(
        "button"
      );

      button.type = "button";
      button.className = "duration-option";

      button.textContent =
        duration + " — " +
        formatPrice(plan.prices[index]);

      button.addEventListener("click", () => {
        selectDuration(duration);
      });

      options.appendChild(button);
    });

    const notice = document.createElement("p");

    notice.textContent =
      "Valores provisórios. Pagamentos em breve.";

    options.appendChild(notice);
  }

  showPage("duration");
}

function selectDuration(duration) {
  ZYNOX.selectedDuration = duration;
  openLogin();
}

async function checkServer() {
  try {
    const response = await fetch(
      "/api/status",
      { cache: "no-store" }
    );

    if (!response.ok) return;

    const data = await response.json();

    console.log("ZYNOX:", data.status);

  } catch {
    console.warn("Servidor indisponível.");
  }
}

async function checkSession() {
  try {
    const response = await fetch(
      "/api/me",
      {
        credentials: "same-origin",
        cache: "no-store"
      }
    );

    if (!response.ok) return;

    const data = await response.json();

    if (data.authenticated) {
      ZYNOX.user = data.user;
      ZYNOX.subscription = data.subscription;
    }

  } catch {
    console.warn("Sessão indisponível.");
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
      throw new Error("Falha ao sair.");
    }

    window.location.replace("/");

  } catch {
    alert("Não foi possível encerrar a sessão.");
  }
}

function setupAccessForm() {
  const form = document.getElementById(
    "access-form"
  );

  const message = document.getElementById(
    "login-message"
  );

  if (!form) return;

  form.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const usernameInput =
        document.getElementById("username");

      const passwordInput =
        document.getElementById("password");

      const button = form.querySelector(
        'button[type="submit"]'
      );

      if (button?.disabled) return;

      const username = usernameInput
        .value.trim().toLowerCase();

      const password = passwordInput.value;

      function showMessage(text, color) {
        if (message) {
          message.textContent = text;
          message.style.color = color;
        }
      }

      if (
        !/^[a-z0-9_.-]{3,40}$/.test(username) ||
        password.length < 12 ||
        password.length > 128
      ) {
        showMessage(
          "Usuário ou senha inválidos.",
          "#FF667D"
        );

        return;
      }

      const originalText = button?.textContent;

      if (button) {
        button.disabled = true;
        button.textContent = "Entrando...";
      }

      showMessage(
        "Verificando credenciais...",
        "#C084FC"
      );

      try {
        const response = await fetch(
          "/api/auth/admin",
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              username,
              password
            })
          }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          showMessage(
            data.error ||
            "Não foi possível entrar.",
            "#FF667D"
          );

          return;
        }

        showMessage(
          "Acesso autorizado!",
          "#4ADE80"
        );

        window.location.replace("/dashboard");

      } catch {
        showMessage(
          "Erro de conexão com o servidor.",
          "#FF667D"
        );

      } finally {
        passwordInput.value = "";

        if (button) {
          button.disabled = false;
          button.textContent = originalText;
        }
      }
    }
  );
}

function setupFAQ() {
  const questions =
    document.querySelectorAll("details");

  questions.forEach(question => {
    question.addEventListener("toggle", () => {
      if (!question.open) return;

      questions.forEach(other => {
        if (other !== question) {
          other.open = false;
        }
      });
    });
  });
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    setupAccessForm();
    const toggle = document.getElementById("toggle-password");
    const password = document.getElementById("password");
    toggle?.addEventListener("click", () => {
      const visible = password.type === "password";
      password.type = visible ? "text" : "password";
      toggle.textContent = visible ? "Ocultar" : "Mostrar";
      toggle.setAttribute("aria-pressed", String(visible));
      toggle.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
    });
    setupFAQ();
    checkServer();
    checkSession();
  }
);

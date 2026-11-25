const ZYNOX = {
  name: "ZYNOX",
  version: "1.0.0",
  selectedPlan: null
};

const pages = [
  "landing",
  "login",
  "access",
  "duration"
];

function showPage(page) {
  pages.forEach(id => {
    const element = document.getElementById(id);

    if (element) {
      element.hidden = id !== page;
    }
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
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
  alert(
    "A autenticação com Discord será disponibilizada após a configuração do servidor."
  );
}

const plans = {
  Starter: [
    4.90,
    8.90,
    14.90,
    39.90,
    129.90,
    199.90
  ],
  Pro: [
    7.90,
    14.90,
    24.90,
    64.90,
    219.90,
    349.90
  ],
  Premium: [
    12.90,
    24.90,
    39.90,
    99.90,
    349.90,
    549.90
  ]
};

const durations = [
  "7 dias",
  "15 dias",
  "30 dias",
  "90 dias",
  "1 ano",
  "Vitalício"
];

function formatMoney(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function selectPlan(plan) {
  if (!Object.hasOwn(plans, plan)) {
    return;
  }

  ZYNOX.selectedPlan = plan;

  document.getElementById(
    "selected-plan"
  ).textContent = "Plano " + plan;

  const container = document.getElementById(
    "duration-options"
  );

  container.replaceChildren();

  const warning = document.createElement("p");

  warning.textContent =
    "Valores demonstrativos. Contratação ainda indisponível.";

  container.appendChild(warning);

  durations.forEach((duration, index) => {
    const button = document.createElement("button");

    button.className = "button secondary";

    button.textContent =
      duration +
      " — " +
      formatMoney(plans[plan][index]);

    button.addEventListener("click", () => {
      selectDuration(plan, duration);
    });

    container.appendChild(button);
  });

  showPage("duration");
}

function selectDuration(plan, duration) {
  ZYNOX.selectedPlan = plan;
  ZYNOX.selectedDuration = duration;

  openLogin();
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    const form = document.getElementById(
      "access-form"
    );

    if (form) {
      form.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          const message =
            document.getElementById(
              "login-message"
            );

          message.textContent =
            "O sistema de autenticação administrativa ainda não está disponível.";

          document.getElementById(
            "password"
          ).value = "";
        }
      );
    }

    const questions =
      document.querySelectorAll("#faq details");

    questions.forEach(question => {
      question.addEventListener(
        "toggle",
        () => {
          if (question.open) {
            questions.forEach(other => {
              if (other !== question) {
                other.open = false;
              }
            });
          }
        }
      );
    });

    checkServer();
  }
);

async function checkServer() {
  try {
    const response = await fetch(
      "/api/status"
    );

    if (!response.ok) {
      throw new Error("Servidor indisponível");
    }

    const data = await response.json();

    console.log(
      "ZYNOX:",
      data.status
    );
  } catch (error) {
    console.warn(
      "Não foi possível consultar o servidor."
    );
  }
}

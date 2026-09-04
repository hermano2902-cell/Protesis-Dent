const API_URL = "https://protesis-dent-api.onrender.com/api";
const profilePanel = document.querySelector("#profilePanel");
const profileBackdrop = document.querySelector("#profileBackdrop");
const profileForm = document.querySelector("#profileForm");
const profileName = document.querySelector("#profileName");
const profileEmail = document.querySelector("#profileEmail");
const profilePassword = document.querySelector("#profilePassword");
const profileSubmit = document.querySelector("#profileSubmit");
const authToggle = document.querySelector("#authToggle");
const profileUser = document.querySelector("#profileUser");
const profileControls = document.querySelector("#profileControls");
const quoteHistory = document.querySelector("#quoteHistory");
let authMode = "login";
let currentUser = null;

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo completar la solicitud");
  return data;
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  profileName.required = registering;
  profileName.hidden = !registering;
  profilePassword.autocomplete = registering ? "new-password" : "current-password";
  profileSubmit.textContent = registering ? "Crear cuenta" : "Iniciar sesión";
  authToggle.textContent = registering ? "Ya tengo una cuenta" : "Crear una cuenta nueva";
}

function renderProfile() {
  const signedIn = !!currentUser;
  profileForm.hidden = signedIn;
  profileUser.hidden = !signedIn;
  profileControls.hidden = !signedIn;
  profileUser.textContent = signedIn ? `Sesión activa: ${currentUser.email}` : "";
  if (signedIn) loadQuotes();
  else {
    quoteHistory.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Inicia sesión para consultar tus cotizaciones.";
    quoteHistory.append(empty);
  }
}

async function loadSession() {
  try { currentUser = (await api("/auth/me")).user; } catch { currentUser = null; }
  renderProfile();
}

async function loadQuotes() {
  quoteHistory.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = "Historial de cotizaciones";
  quoteHistory.append(heading);
  try {
    const { quotes } = await api("/quotes");
    if (!quotes.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "Aún no tienes cotizaciones guardadas.";
      quoteHistory.append(empty);
      return;
    }
    quotes.forEach(quote => {
      const item = document.createElement("article");
      item.className = "quote-record";
      const title = document.createElement("strong");
      title.textContent = quote.folio;
      const date = document.createElement("time");
      date.dateTime = quote.created_at;
      date.textContent = new Date(quote.created_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
      const total = document.createElement("b");
      total.textContent = money(Number(quote.total));
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Ver productos";
      const list = document.createElement("ul");
      (quote.items || []).forEach(product => {
        const line = document.createElement("li");
        line.textContent = `${product.quantity} x ${product.name}`;
        list.append(line);
      });
      details.append(summary, list);
      item.append(title, date, total, details);
      quoteHistory.append(item);
    });
  } catch (error) {
    const failure = document.createElement("p");
    failure.className = "history-empty";
    failure.textContent = error.message;
    quoteHistory.append(failure);
  }
}

function openProfile() {
  renderProfile();
  profileBackdrop.hidden = false;
  profilePanel.setAttribute("aria-hidden", "false");
  profilePanel.classList.add("open");
  document.body.style.overflow = "hidden";
  if (!currentUser) profileEmail.focus();
}

function closeProfile() {
  profileBackdrop.hidden = true;
  profilePanel.setAttribute("aria-hidden", "true");
  profilePanel.classList.remove("open");
  document.body.style.overflow = "";
}

async function saveQuote() {
  if (!currentUser) {
    closeCart();
    openProfile();
    toast("Inicia sesión para guardar la cotización");
    return;
  }
  const items = Object.entries(cart).filter(([id, quantity]) => productById.has(Number(id)) && Number.isSafeInteger(quantity) && quantity > 0).map(([id, quantity]) => {
    const product = productById.get(Number(id));
    return { productId: product.id, name: product.name, price: product.price, quantity };
  });
  if (!items.length) return;
  try {
    const { quote } = await api("/quotes", { method: "POST", body: JSON.stringify({ items }) });
    toast(`✓ Cotización ${quote.folio} guardada`);
    loadQuotes();
  } catch (error) { toast(error.message); }
}

profileForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!profileForm.reportValidity()) return;
  profileSubmit.disabled = true;
  try {
    const path = authMode === "register" ? "/auth/register" : "/auth/login";
    const body = { email: profileEmail.value.trim().toLowerCase(), password: profilePassword.value };
    if (authMode === "register") body.name = profileName.value.trim();
    const data = await api(path, { method: "POST", body: JSON.stringify(body) });
    currentUser = data.user;
    profilePassword.value = "";
    renderProfile();
    closeProfile();
    toast(authMode === "register" ? "✓ Cuenta creada correctamente" : "✓ Sesión iniciada");
  } catch (error) { toast(error.message); }
  finally { profileSubmit.disabled = false; }
});
authToggle.addEventListener("click", () => setAuthMode(authMode === "login" ? "register" : "login"));
document.querySelector("#openProfile").addEventListener("click", openProfile);
document.querySelector("#closeProfile").addEventListener("click", closeProfile);
profileBackdrop.addEventListener("click", closeProfile);
document.querySelector("#saveQuote").addEventListener("click", saveQuote);
document.querySelector("#changeProfile").addEventListener("click", async () => { try { await api("/auth/logout", { method: "POST" }); } catch {} currentUser = null; setAuthMode("login"); renderProfile(); profileForm.hidden = false; profileEmail.focus(); toast("Puedes iniciar sesión con otra cuenta"); });
document.querySelector("#logoutProfile").addEventListener("click", async () => { try { await api("/auth/logout", { method: "POST" }); } catch {} currentUser = null; renderProfile(); toast("Sesión cerrada"); });
document.querySelector("#deleteProfileData").addEventListener("click", async () => { if (!confirm("¿Eliminar definitivamente tu cuenta y cotizaciones?")) return; try { await api("/auth/me", { method: "DELETE" }); currentUser = null; renderProfile(); toast("Cuenta y datos eliminados"); } catch (error) { toast(error.message); } });
document.addEventListener("keydown", event => { if (event.key === "Escape" && profilePanel.classList.contains("open")) closeProfile(); });
setAuthMode("login");
loadSession();

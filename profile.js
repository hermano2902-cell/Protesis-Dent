const profileStorageKey = "protesisDentProfile";
const quotesStorageKey = "protesisDentQuotes";
const profilePanel = document.querySelector("#profilePanel");
const profileBackdrop = document.querySelector("#profileBackdrop");
const profileForm = document.querySelector("#profileForm");
const profileEmail = document.querySelector("#profileEmail");
const profileUser = document.querySelector("#profileUser");
const quoteHistory = document.querySelector("#quoteHistory");

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function getEmail() {
  const email = readStorage(profileStorageKey, "");
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function getQuotes() {
  const quotes = readStorage(quotesStorageKey, []);
  return Array.isArray(quotes) ? quotes : [];
}

function setProfile(email) {
  try {
    localStorage.setItem(profileStorageKey, JSON.stringify(email));
  } catch {
    toast("No se pudo guardar el perfil en este dispositivo");
  }
}

function renderProfile() {
  const email = getEmail();
  profileEmail.value = email;
  profileUser.hidden = !email;
  profileUser.textContent = email ? `Perfil activo: ${email}` : "";
  profileForm.hidden = !!email;
  const quotes = getQuotes().filter(quote => quote.email === email);
  quoteHistory.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = "Historial de cotizaciones";
  quoteHistory.append(heading);
  if (!quotes.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = email ? "Aún no tienes cotizaciones guardadas." : "Guarda un perfil para comenzar.";
    quoteHistory.append(empty);
    return;
  }
  quotes.slice().reverse().forEach(quote => {
    const item = document.createElement("article");
    item.className = "quote-record";
    const title = document.createElement("strong");
    title.textContent = quote.id;
    const date = document.createElement("time");
    date.dateTime = quote.date;
    date.textContent = new Date(quote.date).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
    const total = document.createElement("b");
    total.textContent = money(quote.total);
    item.append(title, date, total);
    quoteHistory.append(item);
  });
}

function openProfile() {
  renderProfile();
  profileBackdrop.hidden = false;
  profilePanel.setAttribute("aria-hidden", "false");
  profilePanel.classList.add("open");
  document.body.style.overflow = "hidden";
  profileEmail.focus();
}

function closeProfile() {
  profileBackdrop.hidden = true;
  profilePanel.setAttribute("aria-hidden", "true");
  profilePanel.classList.remove("open");
  document.body.style.overflow = "";
}

function saveQuote() {
  const email = getEmail();
  const entries = Object.entries(cart).filter(([id, quantity]) => productById.has(Number(id)) && Number.isSafeInteger(quantity) && quantity > 0);
  if (!email) {
    openProfile();
    toast("Agrega tu correo para guardar la cotización");
    return;
  }
  if (!entries.length) return;
  const total = entries.reduce((sum, [id, quantity]) => sum + productById.get(Number(id)).price * quantity, 0);
  const quote = {
    id: `PD-${Date.now().toString(36).toUpperCase()}`,
    date: new Date().toISOString(),
    email,
    total,
    items: entries.map(([id, quantity]) => ({ id: Number(id), quantity }))
  };
  const quotes = getQuotes().filter(item => item.email !== email);
  quotes.push(...getQuotes().filter(item => item.email === email), quote);
  try {
    localStorage.setItem(quotesStorageKey, JSON.stringify(quotes.slice(-50)));
    renderProfile();
    toast(`✓ Cotización ${quote.id} guardada`);
  } catch {
    toast("No se pudo guardar la cotización en este dispositivo");
  }
}

profileForm.addEventListener("submit", event => {
  event.preventDefault();
  const email = profileEmail.value.trim().toLowerCase();
  if (!profileForm.reportValidity()) return;
  setProfile(email);
  renderProfile();
  closeProfile();
  toast("✓ Perfil guardado correctamente");
});
document.querySelector("#openProfile").addEventListener("click", openProfile);
document.querySelector("#closeProfile").addEventListener("click", closeProfile);
profileBackdrop.addEventListener("click", closeProfile);
document.querySelector("#saveQuote").addEventListener("click", saveQuote);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && profilePanel.classList.contains("open")) closeProfile();
});

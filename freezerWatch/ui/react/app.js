const START = "2019-01-25T00:00";
const END = "2019-02-08T23:00";

const state = {
  at: START,
  building: null,
  freezer: null,
  playing: false,
  timer: null,
  data: null,
};

const $ = (id) => document.getElementById(id);

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  });
  (children || []).forEach((child) => node.append(child));
  return node;
}

function hourLabel(at) {
  const [date, time] = at.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = days[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${months[month - 1]} ${day}, ${year} · ${time}`;
}

function shift(at, delta) {
  const [date, time] = at.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour] = time.split(":").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day, hour + delta));
  const pad = (value) => String(value).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T${pad(next.getUTCHours())}:00`;
}

let requestId = 0;

function signedOut(response) {
  if (response.status !== 401) return false;
  location.replace("/login");
  return true;
}

async function load(options) {
  const id = ++requestId;
  if (!state.data || (options && options.loading)) setLoading();
  const params = new URLSearchParams({ at: state.at });
  if (state.building) params.set("building", state.building);
  const response = await fetch(`/api/state?${params}`);
  if (signedOut(response) || id !== requestId) return;
  state.data = await response.json();
  state.building = state.data.selectedId;
  render();
  if (state.freezer) loadSeries(state.freezer);
}

function setLoading() {
  $("hour").textContent = "Loading…";
  $("summary").textContent = "Loading…";
  $("map").textContent = "Loading…";
  $("detail").textContent = "Loading…";
  $("queue").textContent = "Loading…";
}

function render() {
  const data = state.data;
  $("hour").textContent = hourLabel(data.at);
  const air = [];
  if (data.weather && data.weather.tempF !== null) air.push(`${data.weather.tempF.toFixed(1)}°F outside`);
  if (data.weather && data.weather.precipIn) air.push(`${data.weather.precipIn.toFixed(2)} in precip`);
  $("air").textContent = air.join(" · ");
  renderControls();
  renderUser();
  renderSummary(data.summary);
  renderMap(data.buildings, data.selectedId);
  renderDetail(data.detail, data.user);
  renderQueue(data.plans, data.user, data.selectedId);
}

function renderControls() {
  const box = $("controls");
  box.replaceChildren();
  const add = (label, className, onClick, disabled) => {
    const button = el("button", { type: "button", class: className || "", text: label });
    button.disabled = Boolean(disabled);
    button.addEventListener("click", onClick);
    box.append(button);
  };
  add("Back", "", () => go(shift(state.at, -1)), state.at === START);
  add(state.playing ? "Pause" : "Play", "primary", togglePlay);
  add("Forward", "", () => go(shift(state.at, 1)), state.at === END);
  add("Jan 30 deep freeze", "", () => go(state.data.jumps.deepFreeze, { pickRiskiest: true }));
  add("Feb 1 Chemistry outage", "", () => go(state.data.jumps.outage, { pickRiskiest: true }));
  add("Feb 3 thaw", "", () => go(state.data.jumps.thaw, { pickRiskiest: true }));
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  location.replace("/login");
}

function renderUser() {
  const box = $("user");
  box.replaceChildren(
    el("span", { text: state.data.user.name }),
    el("span", { class: "tag", text: state.data.user.roleLabel || state.data.user.role }),
  );
  const button = el("button", { type: "button", class: "text", text: "Log out" });
  button.addEventListener("click", logout);
  box.append(button);
}

function renderSummary(summary) {
  const item = (label, value, tag) => {
    const kids = [el("span", { text: label }), el("strong", { text: value })];
    if (tag) kids.push(el("span", { class: "tag", text: tag }));
    return el("div", { class: "stat" }, kids);
  };
  $("summary").replaceChildren(
    item("Red buildings", String(summary.red)),
    item("Dollars at risk", summary.dollars, "Simulated"),
    item("Pending plans", String(summary.pending)),
  );
}

function project(buildings) {
  const lats = buildings.map((row) => row.latitude);
  const lons = buildings.map((row) => row.longitude);
  const minLat = Math.min(...lats) - 0.0012;
  const maxLat = Math.max(...lats) + 0.0012;
  const minLon = Math.min(...lons) - 0.0015;
  const maxLon = Math.max(...lons) + 0.0025;
  return (row) => ({
    x: ((row.longitude - minLon) / (maxLon - minLon)) * 600 + 28,
    y: ((maxLat - row.latitude) / (maxLat - minLat)) * 460 + 28,
  });
}

function renderMap(buildings, selectedId) {
  const host = $("map");
  host.replaceChildren();
  if (!buildings.length) {
    host.append(el("p", { class: "empty", text: "No scores for this hour" }));
    return;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 660 600");
  svg.setAttribute("class", "map");
  const place = project(buildings);
  const spots = buildings.map((row) => ({ ...row, ...place(row) }));
  spots.sort((a, b) => a.y - b.y || a.x - b.x);
  spots.forEach((spot, index) => {
    for (let earlier = 0; earlier < index; earlier += 1) {
      const other = spots[earlier];
      if (Math.abs(spot.x - other.x) < 120 && Math.abs(spot.y - other.y) < 36) {
        spot.y = other.y + 36;
      }
    }
  });
  spots.forEach((spot) => {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("tabindex", "0");
    group.style.cursor = "pointer";
    const choose = () => {
      state.building = spot.id;
      state.freezer = null;
      load();
    };
    group.addEventListener("click", choose);
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") choose();
    });
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", spot.x);
    dot.setAttribute("cy", spot.y);
    dot.setAttribute("r", spot.id === selectedId ? 9 : 7);
    dot.setAttribute("fill", spot.level === "red" ? "#e25b48" : spot.level === "yellow" ? "#e2b340" : "#2f9d66");
    dot.setAttribute("stroke", spot.id === selectedId ? "#e7c98a" : "rgba(255,255,255,0.85)");
    dot.setAttribute("stroke-width", spot.id === selectedId ? 3 : 2);
    const leftOfPin = spot.x > 580;
    const name = document.createElementNS("http://www.w3.org/2000/svg", "text");
    name.setAttribute("x", leftOfPin ? spot.x - 12 : spot.x + 12);
    name.setAttribute("y", spot.y - 2);
    name.setAttribute("text-anchor", leftOfPin ? "end" : "start");
    name.setAttribute("class", "pin-label");
    const shortNames = {
      chemistry: "Chemistry",
      vilas: "Vilas",
      grainger: "Grainger",
      birge: "Birge",
      van_vleck: "Van Vleck",
      biochemistry: "Biochem",
      microbial: "Microbial",
      discovery: "Discovery",
      engineering_centers: "Engr Centers",
      hslc: "HSLC",
      msc: "Med Sci",
      bock: "Bock",
    };
    name.textContent = shortNames[spot.id] || spot.name;
    const level = document.createElementNS("http://www.w3.org/2000/svg", "text");
    level.setAttribute("x", leftOfPin ? spot.x - 12 : spot.x + 12);
    level.setAttribute("y", spot.y + 12);
    level.setAttribute("text-anchor", leftOfPin ? "end" : "start");
    level.setAttribute("class", "pin-level");
    level.setAttribute("fill", spot.level === "red" ? "#ffb0a1" : spot.level === "yellow" ? "#f6d36b" : "#8ee0b4");
    level.textContent = `${spot.levelText} ${spot.score}`;
    group.append(dot, name, level);
    svg.append(group);
  });
  host.append(svg);
}

function renderDetail(detail, user) {
  const host = $("detail");
  host.replaceChildren();
  if (!detail) {
    host.append(el("p", { class: "empty", text: "Select a building" }));
    return;
  }
  const head = el("div", { class: "detail-head" }, [
    el("h3", { text: detail.name }),
    el("div", { class: "score", text: String(detail.score) }),
  ]);
  const level = el("span", { class: `badge level-${detail.level}`, text: detail.levelText });
  const generator = el("span", { class: "tag", text: detail.onGenerator ? "Generator · assumed" : "No generator · assumed" });
  const reasons = el("ul", { class: "reasons" });
  detail.reasons.forEach((reason) => reasons.append(el("li", { text: reason })));
  if (!detail.reasons.length) reasons.append(el("li", { text: "No risk rules fired" }));
  const meta = el("div", { class: "meta" }, [level, generator]);
  host.append(head, meta, reasons);
  host.append(el("p", { class: "dollars", text: `Dollars at risk ${detail.dollars}` }));
  host.append(el("span", { class: "tag", text: "Simulated values" }));
  if (detail.damaged2019 === "true") {
    const link = el("a", {
      class: "damage",
      href: detail.damageSourceUrl,
      target: "_blank",
      rel: "noreferrer",
      text: `Damaged in Feb 2019 · ${detail.damageType}`,
    });
    host.append(el("div", {}, [link]));
    host.append(el("p", { class: "chart-caption", text: detail.damageSource }));
  }
  if (detail.freezerMessage) {
    host.append(el("p", { class: "empty", text: detail.freezerMessage }));
    return;
  }
  const table = el("table");
  const header = el("tr");
  ["Freezer", "Lab", "Latest temp", "Value", "Flag"].forEach((label) => header.append(el("th", { text: label })));
  table.append(header);
  detail.freezers.forEach((freezer) => {
    const row = el("tr", { class: state.freezer === freezer.id ? "clickable selected" : "clickable" });
    row.append(el("td", { text: freezer.id }));
    row.append(el("td", { text: freezer.lab }));
    row.append(el("td", { text: freezer.temp }));
    row.append(el("td", { text: freezer.value }));
    row.append(el("td", {}, [el("span", { class: freezer.flagged ? "flag" : "calm", text: freezer.flagged ? "FLAGGED" : "OK" })]));
    row.addEventListener("click", () => loadSeries(freezer.id));
    table.append(row);
  });
  host.append(table);
  host.append(el("div", { id: "chart" }));
}

async function loadSeries(freezerId) {
  state.freezer = freezerId;
  const chart = $("chart");
  if (!chart) return;
  chart.replaceChildren(el("p", { class: "loading", text: "Loading…" }));
  const response = await fetch(`/api/series?freezer=${encodeURIComponent(freezerId)}&at=${encodeURIComponent(state.at)}`);
  if (signedOut(response)) return;
  const payload = await response.json();
  drawChart(payload);
  document.querySelectorAll("#detail tr").forEach((row) => {
    row.classList.toggle("selected", row.firstChild && row.firstChild.textContent === freezerId);
  });
}

function drawChart(payload) {
  const chart = $("chart");
  if (!chart) return;
  chart.replaceChildren();
  if (!payload.points.length) {
    chart.append(el("p", { class: "empty", text: "No freezers you can view" }));
    return;
  }
  const width = 520;
  const height = 180;
  const pad = 28;
  const temps = payload.points.map((point) => point.c);
  const min = Math.min(-82, ...temps);
  const max = Math.max(-40, ...temps);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "chart");
  const x = (index) => pad + (index / (payload.points.length - 1)) * (width - pad * 2);
  const y = (temp) => pad + ((max - temp) / (max - min)) * (height - pad * 2);
  const line = (temp, dashed) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "line");
    node.setAttribute("x1", pad);
    node.setAttribute("x2", width - pad);
    node.setAttribute("y1", y(temp));
    node.setAttribute("y2", y(temp));
    node.setAttribute("stroke", dashed ? "#ff8f7a" : "rgba(246,241,230,0.18)");
    node.setAttribute("stroke-dasharray", dashed ? "4 4" : "0");
    return node;
  };
  svg.append(line(-50, true));
  const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#f6f1e6");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("points", payload.points.map((point, index) => `${x(index)},${y(point.c)}`).join(" "));
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", pad);
  label.setAttribute("y", y(-50) - 4);
  label.setAttribute("fill", "#ffb0a1");
  label.setAttribute("font-size", "11");
  label.textContent = "-50°C";
  svg.append(path, label);
  chart.append(svg);
  chart.append(el("p", { class: "chart-caption", text: `${payload.freezerId} · 48 hours · simulated readings · dashed line is -50°C` }));
}

function renderQueue(plans, user, selectedId) {
  const host = $("queue");
  host.replaceChildren();
  if (!plans.length) {
    host.append(el("p", { class: "empty", text: "No pending plans" }));
  }
  plans.forEach((plan) => {
    const card = el("article", { class: plan.buildingId === selectedId ? "card current" : "card" });
    card.append(el("header", {}, [
      el("strong", { text: `${plan.rank}. ${plan.buildingName}` }),
      el("span", { text: plan.dollars }),
    ]));
    const list = el("ol");
    plan.steps.forEach((step) => {
      const item = el("li", { text: step.text });
      const chips = el("div", { class: "chips" });
      step.citations.forEach((citation) => chips.append(el("span", { class: "chip", text: citation })));
      item.append(chips);
      list.append(item);
    });
    card.append(list);
    if (user.canDecide) {
      const actions = el("div", { class: "actions" });
      const approve = el("button", { type: "button", class: "primary", text: "Approve" });
      approve.addEventListener("click", () => act("/api/approve", plan.id));
      const reject = el("button", { type: "button", class: "danger", text: "Reject" });
      const reason = el("input", { type: "text", placeholder: "Reason" });
      reject.addEventListener("click", () => act("/api/reject", plan.id, reason.value));
      actions.append(approve, reject, reason);
      card.append(actions);
    }
    host.append(card);
  });
  const decided = state.data.decided || [];
  if (!decided.length) return;
  host.append(el("h3", { class: "subhead", text: "Decided" }));
  decided.forEach((row) => {
    host.append(el("p", { class: "decided", text: `${row.buildingName} · ${row.status} · ${row.decidedBy}` }));
  });
}

async function act(path, planId, reason) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId, reason: reason || "" }),
  });
  if (signedOut(response)) return;
  if (!response.ok) {
    const payload = await response.json();
    $("queue").prepend(el("p", { class: "empty", text: payload.error || "Request failed" }));
    return;
  }
  load();
}

function go(at, options) {
  if (at < START) at = START;
  if (at > END) at = END;
  state.at = at;
  state.freezer = null;
  if (options && options.pickRiskiest) state.building = null;
  load();
}

function togglePlay() {
  state.playing = !state.playing;
  if (state.timer) clearInterval(state.timer);
  if (state.playing) {
    state.timer = setInterval(() => {
      if (state.at === END) {
        state.playing = false;
        clearInterval(state.timer);
        renderControls();
        return;
      }
      state.at = shift(state.at, 1);
      state.freezer = null;
      load();
    }, 1000);
  }
  renderControls();
}

fetch("/api/me").then((response) => {
  if (signedOut(response)) return;
  load();
});

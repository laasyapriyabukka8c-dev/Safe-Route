const sourceSelect = document.querySelector("#source");
const destinationSelect = document.querySelector("#destination");
const routeForm = document.querySelector("#route-form");
const routeButton = document.querySelector("#route-button");
const routeMessage = document.querySelector("#route-message");
const routeSummary = document.querySelector("#route-summary");
const routeOptions = document.querySelector("#route-options");
const routeModeSelect = document.querySelector("#route-mode");
const roadList = document.querySelector("#road-list");
const roadFilter = document.querySelector("#road-filter");
const locationSearch = document.querySelector("#location-search");

let city = null;
let routes = [];
let selectedRouteIndex = 0;
let preferences = null;
let user = null;
let map;
let roadLayer;
let routeLayer;
let placeLayer;
let toastTimer;
let routeRequestId = 0;

const routeColors = ["#1683ed", "#8956d8", "#0c9b78"];
const incidentLabels = {
  normal: "Normal",
  blocked: "Blocked",
  accident: "Accident",
  congestion: "Heavy congestion"
};
const incidentValues = ["normal", "blocked", "accident", "congestion"];

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }
  if (response.status === 401) {
    window.location.assign("/");
    throw new Error(result.error || "Please sign in again.");
  }
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function showToast(message, isError = false) {
  const toast = document.querySelector("#map-toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3800);
}

function initialsFor(name) {
  return name.split(/\s+/).slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase()).join("") || "SR";
}

function makeMarkerIcon(kind) {
  const label = kind === "start-endpoint" ? "S" :
    kind === "destination-endpoint" ? "D" : "";
  return L.divIcon({
    className: `place-marker ${kind}`,
    html: `<span>${label}</span>`,
    iconSize: kind === "hospital" ? [22, 22] : [26, 30],
    iconAnchor: kind === "hospital" ? [11, 11] : [13, 27]
  });
}

function initializeMap() {
  map = L.map("city-map", { zoomControl: false });
  L.control.zoom({ position: "topright" }).addTo(map);
  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
  }).addTo(map);
  roadLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  placeLayer = L.layerGroup().addTo(map);
}

function nodeFor(id) {
  return city.nodes.find((node) => node.id === id);
}

function selectedRoute() {
  return routes[selectedRouteIndex] || null;
}

function addIncidentMarker(road, from, to) {
  if (road.incident === "normal") return;
  const marker = L.marker(
    [(from.latitude + to.latitude) / 2, (from.longitude + to.longitude) / 2],
    {
      icon: L.divIcon({
        className: `incident-marker ${road.incident}`,
        html: `<span>${road.incident === "blocked" ? "!" : road.incident === "accident" ? "A" : "≋"}</span>`,
        iconSize: [27, 27],
        iconAnchor: [13, 13]
      }),
      title: `${incidentLabels[road.incident]}: ${road.name}`,
      keyboard: true
    }
  ).addTo(placeLayer);
  marker.bindTooltip(`${incidentLabels[road.incident]} · ${road.name}`, { direction: "top" });
}

function drawMap() {
  roadLayer.clearLayers();
  routeLayer.clearLayers();
  placeLayer.clearLayers();
  if (!city) return;

  const routeRoadIds = new Set(routes.flatMap((route) => route.roads));
  for (const road of city.roads) {
    const from = nodeFor(road.from);
    const to = nodeFor(road.to);
    const incident = road.incident || (road.blocked ? "blocked" : "normal");
    const onRoute = routeRoadIds.has(road.id);
    if (preferences && !preferences.showRoads) {
      addIncidentMarker({ ...road, incident }, from, to);
      continue;
    }
    const roadLine = L.polyline(
      [[from.latitude, from.longitude], [to.latitude, to.longitude]],
      {
        color: incident === "blocked" ? "#d34f55" :
          incident === "accident" ? "#e17b27" :
          incident === "congestion" ? "#d39a1e" : onRoute ? "#1380e5" : "#378f6c",
        weight: onRoute ? 4 : 2.5,
        opacity: incident === "normal" ? (onRoute ? 0.8 : 0.5) : 0.92,
        dashArray: incident === "blocked" ? "7 6" : null,
        bubblingMouseEvents: false
      }
    ).addTo(roadLayer);
    roadLine.on("click", () => openRoadPopup(roadLine, road, from, to));
    roadLine.bindTooltip(`${road.name} · ${road.time} min base estimate · ${incidentLabels[incident]}`, {
      sticky: true,
      direction: "top"
    });
    addIncidentMarker({ ...road, incident }, from, to);
  }

  for (const route of routes) {
    if (route.nodes.length < 2) continue;
    const coordinates = route.nodes.map((id) => {
      const node = nodeFor(id);
      return [node.latitude, node.longitude];
    });
    const index = routes.indexOf(route);
    L.polyline(coordinates, {
      color: "#fff",
      weight: index === selectedRouteIndex ? 11 : 8,
      opacity: 0.92,
      lineCap: "round",
      lineJoin: "round",
      interactive: false
    }).addTo(routeLayer);
    L.polyline(coordinates, {
      color: routeColors[index % routeColors.length],
      weight: index === selectedRouteIndex ? 7 : 4,
      opacity: index === selectedRouteIndex ? 1 : 0.58,
      lineCap: "round",
      lineJoin: "round",
      dashArray: index === selectedRouteIndex ? null : "9 7",
      interactive: false
    }).addTo(routeLayer);
  }

  for (const node of city.nodes) {
    const isStart = node.id === Number(sourceSelect.value);
    const isDestination = node.id === Number(destinationSelect.value);
    const isHospital = node.facilityType === "hospital";
    if (isHospital && preferences && !preferences.showHospitals &&
        !isStart && !isDestination) continue;
    const kind = isStart ? "start-endpoint" :
      isDestination ? "destination-endpoint" : isHospital ? "hospital" : "";
    const marker = L.marker([node.latitude, node.longitude], {
      icon: makeMarkerIcon(kind),
      keyboard: true,
      title: node.name
    }).addTo(placeLayer);
    const tooltip = document.createElement("span");
    tooltip.textContent = isHospital ? `Hospital · ${node.name}` : node.name;
    marker.bindTooltip(tooltip, { direction: "top", offset: [0, -6] });
  }
}

function fitRoute(route) {
  const points = route
    ? route.nodes.map((id) => nodeFor(id))
    : [nodeFor(Number(sourceSelect.value)), nodeFor(Number(destinationSelect.value))];
  const coordinates = points.filter(Boolean)
    .map((node) => [node.latitude, node.longitude]);
  if (coordinates.length === 0) return;
  if (coordinates.length === 1 ||
      (coordinates.length === 2 &&
       coordinates[0][0] === coordinates[1][0] &&
       coordinates[0][1] === coordinates[1][1])) {
    map.flyTo(coordinates[0], 15, { duration: 0.65 });
    return;
  }
  map.flyToBounds(L.latLngBounds(coordinates), {
    paddingTopLeft: [42, 105],
    paddingBottomRight: [58, 52],
    maxZoom: 15,
    duration: 0.65
  });
}

function incidentSelect(road, className = "incident-select") {
  const select = document.createElement("select");
  select.className = className;
  select.setAttribute("aria-label", `Set simulated condition for ${road.name}`);
  for (const incident of incidentValues) {
    const option = document.createElement("option");
    option.value = incident;
    option.textContent = incidentLabels[incident];
    select.append(option);
  }
  select.value = road.incident || (road.blocked ? "blocked" : "normal");
  select.addEventListener("change", () => setRoadIncident(road, select.value, select));
  return select;
}

function openRoadPopup(line, road, from, to) {
  const content = document.createElement("div");
  const title = document.createElement("div");
  title.className = "popup-title";
  title.textContent = road.name;
  const meta = document.createElement("div");
  meta.className = "popup-meta";
  meta.textContent = `${from.name} ↔ ${to.name} · ${road.time} min base estimate`;
  const label = document.createElement("label");
  label.className = "popup-condition";
  label.textContent = "Simulated condition";
  label.append(incidentSelect(road, "popup-incident-select"));
  content.append(title, meta, label);
  line.bindPopup(content).openPopup();
}

function populateLocations() {
  for (const node of city.nodes) {
    const option = document.createElement("option");
    option.value = node.id;
    option.textContent = node.name;
    sourceSelect.append(option.cloneNode(true));
    destinationSelect.append(option);
    const searchOption = document.createElement("option");
    searchOption.value = node.name;
    document.querySelector("#location-options").append(searchOption);
  }
  sourceSelect.value = "0";
  destinationSelect.value = "13";
}

function renderRoads() {
  const filter = roadFilter.value.trim().toLowerCase();
  roadList.replaceChildren();
  const visibleRoads = city.roads.filter((road) => {
    const from = nodeFor(road.from);
    const to = nodeFor(road.to);
    return `${road.id} ${road.name} ${from.name} ${to.name}`
      .toLowerCase().includes(filter);
  });

  for (const road of visibleRoads) {
    const from = nodeFor(road.from);
    const to = nodeFor(road.to);
    const incident = road.incident || (road.blocked ? "blocked" : "normal");
    const item = document.createElement("div");
    item.className = `road-item ${incident}`;
    const code = document.createElement("span");
    code.className = "road-code";
    code.textContent = road.id;
    const info = document.createElement("div");
    info.className = "road-info";
    const name = document.createElement("div");
    name.className = "road-name";
    name.textContent = road.name;
    const meta = document.createElement("div");
    meta.className = "road-meta";
    meta.textContent = `${from.name} ↔ ${to.name} · ${road.time} min base · ${incidentLabels[incident]}`;
    info.append(name, meta);
    item.append(code, info, incidentSelect(road));
    roadList.append(item);
  }

  if (visibleRoads.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-roads";
    empty.textContent = "No roads match this search.";
    roadList.append(empty);
  }
  const incidentCount = city.roads.filter((road) =>
    (road.incident || (road.blocked ? "blocked" : "normal")) !== "normal").length;
  document.querySelector("#road-count").textContent =
    `${city.roads.length} ROADS · ${incidentCount} INCIDENTS`;
}

function renderRouteDetails(route) {
  if (!route) {
    routeSummary.hidden = true;
    return;
  }
  const names = route.nodes.map((id) => nodeFor(id).name);
  document.querySelector("#travel-time").textContent = route.totalTime;
  document.querySelector("#distance").textContent = route.distanceKm.toFixed(1);
  document.querySelector("#route-endpoints").textContent = names.join("  →  ");
  const routeStatus = document.querySelector("#route-status");
  routeStatus.textContent = routeModeSelect.value === "ambulance" && route.recommended
    ? "AMBULANCE"
    : route.recommended ? "RECOMMENDED" : "ALTERNATIVE";
  routeStatus.classList.toggle("alternate", !route.recommended);
  const steps = document.querySelector("#route-steps");
  steps.replaceChildren();
  route.roads.forEach((roadId, index) => {
    const road = city.roads.find((item) => item.id === roadId);
    const step = document.createElement("div");
    step.className = "route-step";
    const marker = document.createElement("span");
    marker.className = "step-marker";
    marker.textContent = String(index + 1).padStart(2, "0");
    const detail = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = road.name;
    const condition = incidentLabels[road.incident || "normal"];
    detail.append(label, document.createTextNode(
      ` · ${road.time} min base · ${condition}`
    ));
    step.append(marker, detail);
    steps.append(step);
  });
  routeSummary.hidden = false;
}

function renderRoutes(nextRoutes, fit = true) {
  routes = nextRoutes;
  selectedRouteIndex = Math.min(selectedRouteIndex, Math.max(0, routes.length - 1));
  routeOptions.replaceChildren();
  routes.forEach((route, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `route-option${index === selectedRouteIndex ? " selected" : ""}`;
    button.style.setProperty("--route-color", routeColors[index % routeColors.length]);
    button.setAttribute("aria-pressed", String(index === selectedRouteIndex));
    const heading = document.createElement("span");
    heading.className = "route-option-heading";
    const label = document.createElement("strong");
    label.textContent = route.recommended
      ? routeModeSelect.value === "ambulance"
        ? "Ambulance route"
        : preferences.routePreference === "shortest" ? "Shortest route" : "Fastest route"
      : `Alternative ${index}`;
    const tag = document.createElement("i");
    tag.textContent = route.recommended ? "RECOMMENDED" : `ROUTE ${index + 1}`;
    heading.append(label, tag);
    const summary = document.createElement("span");
    summary.className = "route-option-summary";
    summary.textContent = `${route.totalTime} min · ${route.distanceKm.toFixed(1)} km · ${route.segmentCount} segments`;
    button.append(heading, summary);
    button.addEventListener("click", () => {
      selectedRouteIndex = index;
      renderRoutes(routes, true);
    });
    routeOptions.append(button);
  });

  const route = selectedRoute();
  if (route) {
    renderRouteDetails(route);
    routeMessage.textContent = routeModeSelect.value === "ambulance"
      ? `${routes.length} ambulance route${routes.length === 1 ? "" : "s"} · simulated incident-weighted costs from the C backend.`
      : `${routes.length} distinct route${routes.length === 1 ? "" : "s"} · costed by the C backend.`;
    routeMessage.classList.remove("error");
  } else {
    routeSummary.hidden = true;
    routeMessage.textContent = "No route is available while these roads are blocked.";
    routeMessage.classList.add("error");
  }
  drawMap();
  if (fit) fitRoute(route);
}

async function calculateRoute(fit = true) {
  if (!city || sourceSelect.value === "" || destinationSelect.value === "") return false;
  const requestId = ++routeRequestId;
  routes = [];
  selectedRouteIndex = 0;
  routeOptions.replaceChildren();
  routeSummary.hidden = true;
  drawMap();
  routeMessage.textContent = "Calculating distinct emergency routes…";
  routeMessage.classList.remove("error");
  routeButton.disabled = true;
  routeButton.firstElementChild.textContent = "Calculating…";
  try {
    const result = await requestJson("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: Number(sourceSelect.value),
        destination: Number(destinationSelect.value),
        preference: document.querySelector("#route-preference").value,
        priority: document.querySelector("#emergency-priority").value,
        mode: routeModeSelect.value
      })
    });
    if (requestId === routeRequestId) {
      renderRoutes(result.routes, fit);
      return true;
    }
  } catch (error) {
    if (requestId === routeRequestId) {
      routeMessage.textContent = error.message;
      routeMessage.classList.add("error");
      routeSummary.hidden = true;
    }
    return false;
  } finally {
    if (requestId === routeRequestId) {
      routeButton.disabled = false;
      routeButton.firstElementChild.textContent = "Find best routes";
    }
  }
}

async function setRoadIncident(road, incident, control) {
  if (control) control.disabled = true;
  try {
    const previousRoute = selectedRoute();
    const previousRoadIds = new Set(previousRoute?.roads || []);
    await requestJson(`/api/roads/${encodeURIComponent(road.id)}/incident`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incident })
    });
    city = await requestJson("/api/map");
    const updatedRoad = city.roads.find((item) => item.id === road.id);
    renderRoads();
    const label = incidentLabels[incident].toLowerCase();
    const calculated = await calculateRoute(true);
    if (!calculated) return;
    let message = incident === "normal"
      ? `${road.name} restored to normal.`
      : `${road.name}: simulated ${label}.`;
    if (routes.length && previousRoadIds.has(road.id) && !selectedRoute().roads.includes(road.id)) {
      message += " The selected route now avoids this segment.";
    } else if (incident === "blocked" && routes.length) {
      message += " Routes were recalculated without the blocked segment.";
    } else if (updatedRoad && incident !== "normal") {
      message += previousRoute && previousRoute.roads.some((id) => id !== road.id) && routes.length
        ? " Alternatives were recalculated using the updated incident costs."
        : " Incident delay is simulated.";
    }
    routeMessage.textContent = message;
    routeMessage.classList.toggle("error", routes.length === 0);
    if (preferences.notifyIncidents && incident !== "normal") {
      showToast(`${road.name}: ${incidentLabels[incident].toLowerCase()} simulated. Routes refreshed.`);
    }
  } catch (error) {
    if (control) control.value = road.incident || "normal";
    showToast(error.message, true);
  } finally {
    if (control) control.disabled = false;
  }
}

function searchLocation() {
  const query = locationSearch.value.trim().toLowerCase();
  if (!query) {
    showToast("Enter a Hyderabad location to search.", true);
    return;
  }
  const match = city.nodes.find((node) => node.name.toLowerCase() === query) ||
    city.nodes.find((node) => node.name.toLowerCase().includes(query));
  if (!match) {
    showToast("No matching location in the modeled dispatch network.", true);
    return;
  }
  locationSearch.value = match.name;
  map.flyTo([match.latitude, match.longitude], 15, { duration: 0.8 });
  const marker = placeLayer.getLayers()
    .find((layer) => layer.options.title === match.name);
  if (marker) marker.openTooltip();
}

function fillPreferencesForm() {
  document.querySelector("#appearance-setting").value = preferences.appearance;
  document.querySelector("#map-view-setting").value = preferences.mapView;
  document.querySelector("#show-hospitals-setting").checked = preferences.showHospitals;
  document.querySelector("#show-roads-setting").checked = preferences.showRoads;
  document.querySelector("#notify-incidents-setting").checked = preferences.notifyIncidents;
  document.querySelector("#preferred-facility-setting").value = preferences.facilityType;
  document.querySelector("#preferred-route-setting").value = preferences.routePreference;
  document.querySelector("#preferred-priority-setting").value = preferences.emergencyPriority;
  document.querySelector("#route-preference").value = preferences.routePreference;
  document.querySelector("#emergency-priority").value = preferences.emergencyPriority;
  document.querySelector("#facility-type").value = preferences.facilityType;
  document.body.classList.toggle("theme-dark", preferences.appearance === "dark");
}

function showProfile(userData) {
  user = userData;
  document.querySelector("#user-name").textContent = user.name;
  document.querySelector(".user-avatar").textContent = initialsFor(user.name);
  document.querySelector("#profile-menu-name").textContent = user.name;
  document.querySelector("#profile-menu-email").textContent = user.email;
  document.querySelector("#profile-name").value = user.name;
  document.querySelector("#profile-email").value = user.email;
}

function openSettings() {
  document.querySelector("#profile-menu").hidden = true;
  document.querySelector("#profile-button").setAttribute("aria-expanded", "false");
  fillPreferencesForm();
  document.querySelector("#settings-backdrop").hidden = false;
  document.querySelector("#settings-close").focus();
}

async function savePreferences(patch) {
  const result = await requestJson("/api/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  preferences = result.preferences;
  fillPreferencesForm();
  drawMap();
  if (patch.routePreference || patch.emergencyPriority) await calculateRoute(false);
  if (patch.mapView === "city") {
    map.fitBounds(city.nodes.map((node) => [node.latitude, node.longitude]), {
      paddingTopLeft: [28, 82],
      paddingBottomRight: [28, 35]
    });
  } else if (patch.mapView === "network" && selectedRoute()) {
    fitRoute(selectedRoute());
  }
  showToast("Preferences saved.");
}

async function loadSession() {
  const [session, savedPreferences] = await Promise.all([
    requestJson("/api/session"),
    requestJson("/api/preferences")
  ]);
  if (!session.authenticated) {
    window.location.replace("/");
    return false;
  }
  preferences = savedPreferences.preferences;
  showProfile(session.user);
  return true;
}

async function start() {
  try {
    if (!(await loadSession())) return;
    fillPreferencesForm();
    initializeMap();
    city = await requestJson("/api/map");
    populateLocations();
    renderRoads();
    drawMap();
    map.fitBounds(city.nodes.map((node) => [node.latitude, node.longitude]), {
      paddingTopLeft: [28, 82],
      paddingBottomRight: [28, 35]
    });
    await calculateRoute(preferences.mapView === "network");
  } catch (error) {
    showToast(error.message, true);
  }
}

routeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  calculateRoute(true);
});
sourceSelect.addEventListener("change", () => calculateRoute(true));
destinationSelect.addEventListener("change", () => calculateRoute(true));
document.querySelector("#swap-button").addEventListener("click", () => {
  const source = sourceSelect.value;
  sourceSelect.value = destinationSelect.value;
  destinationSelect.value = source;
  calculateRoute(true);
});
document.querySelector("#route-preference").addEventListener("change", async (event) => {
  try {
    await savePreferences({ routePreference: event.target.value });
  } catch (error) {
    showToast(error.message, true);
  }
});
document.querySelector("#emergency-priority").addEventListener("change", async (event) => {
  try {
    await savePreferences({ emergencyPriority: event.target.value });
  } catch (error) {
    showToast(error.message, true);
  }
});
routeModeSelect.addEventListener("change", () => calculateRoute(true));
document.querySelector("#facility-type").addEventListener("change", async (event) => {
  try {
    await savePreferences({ facilityType: event.target.value });
  } catch (error) {
    showToast(error.message, true);
  }
});
document.querySelector("#nearest-facility-button").addEventListener("click", async () => {
  const type = document.querySelector("#facility-type").value;
  try {
    const result = await requestJson("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: Number(sourceSelect.value),
        nearestFacility: type,
        preference: document.querySelector("#route-preference").value,
        priority: document.querySelector("#emergency-priority").value,
        mode: routeModeSelect.value
      })
    });
    const nearest = result.routes[0];
    if (!nearest) {
      showToast("No reachable facility of this type is in the modeled network.", true);
      return;
    }
    destinationSelect.value = String(nearest.nodes[nearest.nodes.length - 1]);
    await calculateRoute(true);
  } catch (error) {
    showToast(error.message, true);
  }
});
roadFilter.addEventListener("input", renderRoads);
document.querySelector("#search-button").addEventListener("click", searchLocation);
locationSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchLocation();
  }
});
document.querySelector("#locate-button").addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("Location is not supported by this browser.", true);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => map.flyTo([coords.latitude, coords.longitude], 14, { duration: 0.8 }),
    () => showToast("Could not access your location. Check browser permissions.", true),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

document.querySelector("#profile-button").addEventListener("click", () => {
  const menu = document.querySelector("#profile-menu");
  const open = menu.hidden;
  menu.hidden = !open;
  document.querySelector("#profile-button").setAttribute("aria-expanded", String(open));
});
document.querySelector("#profile-menu").addEventListener("click", (event) => {
  const action = event.target.closest("[data-profile-action]")?.dataset.profileAction;
  if (action === "profile" || action === "settings") openSettings();
});
document.addEventListener("click", (event) => {
  const area = document.querySelector(".user-area");
  if (!area.contains(event.target)) {
    document.querySelector("#profile-menu").hidden = true;
    document.querySelector("#profile-button").setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelector("#profile-menu").hidden = true;
    document.querySelector("#profile-button").setAttribute("aria-expanded", "false");
    document.querySelector("#settings-backdrop").hidden = true;
  }
});
document.querySelector("#settings-close").addEventListener("click", () => {
  document.querySelector("#settings-backdrop").hidden = true;
});
document.querySelector("#settings-backdrop").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.hidden = true;
});
document.querySelector("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    const result = await requestJson("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.querySelector("#profile-name").value.trim(),
        email: document.querySelector("#profile-email").value.trim()
      })
    });
    showProfile(result.user);
    showToast("Profile updated.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#preferences-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    await savePreferences({
      appearance: document.querySelector("#appearance-setting").value,
      mapView: document.querySelector("#map-view-setting").value,
      showHospitals: document.querySelector("#show-hospitals-setting").checked,
      showRoads: document.querySelector("#show-roads-setting").checked,
      notifyIncidents: document.querySelector("#notify-incidents-setting").checked,
      facilityType: document.querySelector("#preferred-facility-setting").value,
      routePreference: document.querySelector("#preferred-route-setting").value,
      emergencyPriority: document.querySelector("#preferred-priority-setting").value
    });
    document.querySelector("#facility-type").value = preferences.facilityType;
    document.querySelector("#route-preference").value = preferences.routePreference;
    document.querySelector("#emergency-priority").value = preferences.emergencyPriority;
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await requestJson("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  } catch (error) {
    showToast(error.message, true);
  }
});

start();

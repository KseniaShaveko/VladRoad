const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQxY2Q2MGIzNTFmODQzMzJiZmUzMmU1YmI3ZTc1OWRkIiwiaCI6Im11cm11cjY0In0=";

const params = new URLSearchParams(window.location.search);
const readyRouteId = params.get("ready_route");
const poiLat = params.get("poi_lat");
const poiLng = params.get("poi_lng");
const poiName = params.get("poi_name");

let map = L.map("map", {
    maxZoom: 18,
    minZoom: 11,
    attributionControl: true
}).setView([43.1155, 131.8855], 12);

map.attributionControl.setPrefix(false);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "OpenStreetMap"
}).addTo(map);

let bounds = L.latLngBounds([42.7, 131.5], [43.6, 132.3]);
map.setMaxBounds(bounds);

map.on("drag", function () {
    map.panInsideBounds(bounds, { animate: false });
});

let points = [];
let markers = [];
let routeLines = [];
let segmentTypes = [];
let poiMarkers = [];
let poiCache = null;

let adminPoiMarkers = [];
let adminPoiCache = null;
let currentRouteId = null;
let editingPointIndex = null;

window.currentRouteDistance = 0;
window.currentRouteDuration = 0;

let localFavoriteIds = new Set();
let cachedUserRoutes = [];

function getElement(id) {
    return document.getElementById(id);
}

function saveLocalFavorites() {
    // больше не нужно — избранное хранится на сервере
}


function formatSearchTitle(item) {
    const address = item.address || {};

    return (
        address.road ||
        address.pedestrian ||
        address.footway ||
        address.attraction ||
        address.tourism ||
        address.amenity ||
        address.building ||
        address.suburb ||
        address.neighbourhood ||
        item.name ||
        "Найденное место"
    );
}

function formatSearchAddress(item) {
    const rawParts = String(item.display_name || "")
        .split(",")
        .map(part => part.trim())
        .filter(Boolean);

    const excluded = new Set([
        "Владивосток",
        "Владивостокский городской округ",
        "Приморский край",
        "Дальневосточный федеральный округ",
        "Россия"
    ]);

    const filtered = rawParts.filter(part => !excluded.has(part));
    const shortAddress = filtered.slice(0, 3).join(", ");

    return shortAddress || "Владивосток";
}

function setSearchResultsVisible(isVisible) {
    const results = getElement("addressSearchResults");
    if (!results) return;

    results.classList.toggle("hidden", !isVisible);
}

function renderSearchMessage(text, type = "loading") {
    const results = getElement("addressSearchResults");
    if (!results) return;

    results.innerHTML = `<div class="search-result-${type}">${text}</div>`;
    setSearchResultsVisible(true);
}

function renderSearchResults(items) {
    const results = getElement("addressSearchResults");
    if (!results) return;

    results.innerHTML = "";

    if (!items.length) {
        renderSearchMessage("Ничего не найдено. Попробуйте уточнить запрос.", "empty");
        return;
    }

    items.forEach(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "search-result-item";

        const title = formatSearchTitle(item);
        const address = formatSearchAddress(item);

        button.innerHTML = `
            <span class="search-result-title">${title}</span>
            <span class="search-result-address">${address}</span>
        `;

        button.addEventListener("click", () => selectSearchResult(item));
        results.appendChild(button);
    });

    setSearchResultsVisible(true);
}

async function searchAddress() {
    const input = getElement("addressSearchInput");
    if (!input) return;

    const query = input.value.trim();

    if (query.length < 2) {
        setSearchResultsVisible(false);
        return;
    }

    renderSearchMessage("Идёт поиск по Владивостоку...");

    const params = new URLSearchParams({
        format: "jsonv2",
        q: `${query}, Владивосток`,
        addressdetails: "1",
        limit: "6",
        countrycodes: "ru",
        viewbox: "131.5,43.6,132.3,42.7",
        bounded: "1",
        accept_language: "ru"
    });

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
        if (!response.ok) throw new Error("search error");

        const data = await response.json();
        renderSearchResults(data || []);
    } catch {
        renderSearchMessage("Не удалось выполнить поиск. Проверьте подключение к интернету.", "empty");
    }
}

function selectSearchResult(item) {
    const input = getElement("addressSearchInput");
    const lat = Number(item.lat);
    const lon = Number(item.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        showToast("Не удалось определить координаты места.", "error");
        return;
    }

    const latlng = L.latLng(lat, lon);

    if (input) {
        input.value = formatSearchTitle(item);
        updateSearchClearButton();
    }

    setSearchResultsVisible(false);
    map.setView(latlng, 15);
    addPoint(latlng, true);
    showToast("Точка добавлена в маршрут.", "success");
}

function clearAddressSearch() {
    const input = getElement("addressSearchInput");
    const results = getElement("addressSearchResults");

    if (input) input.value = "";
    if (results) results.innerHTML = "";

    setSearchResultsVisible(false);
    updateSearchClearButton();
}

function updateSearchClearButton() {
    const input = getElement("addressSearchInput");
    const clear = getElement("addressSearchClear");

    if (!input || !clear) return;

    clear.classList.toggle("hidden", input.value.trim().length === 0);
}

function initAddressSearch() {
    const input = getElement("addressSearchInput");
    const button = getElement("addressSearchButton");
    const clear = getElement("addressSearchClear");
    const panel = getElement("mapSearchPanel");

    if (!input || !button) return;

    let searchTimer = null;

    input.addEventListener("input", () => {
        updateSearchClearButton();

        clearTimeout(searchTimer);
        searchTimer = setTimeout(searchAddress, 450);
    });

    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            searchAddress();
        }

        if (event.key === "Escape") {
            setSearchResultsVisible(false);
        }
    });

    button.addEventListener("click", searchAddress);

    if (clear) {
        clear.addEventListener("click", clearAddressSearch);
    }

    document.addEventListener("click", event => {
        if (panel && !panel.contains(event.target)) {
            setSearchResultsVisible(false);
        }
    });

    updateSearchClearButton();
}

function updateRouteStats(routes = null) {
    const createdCount = getElement("createdRoutesCount");
    const favoriteCount = getElement("favoriteRoutesCount");
    const readyCount = getElement("readyRoutesCount");
    const readyList = getElement("readyRouteList");
    const sourceRoutes = Array.isArray(routes) ? routes : cachedUserRoutes;

    if (createdCount) {
        createdCount.innerText = sourceRoutes.length;
    }

    if (favoriteCount) {
        const realFavoriteCount = sourceRoutes.filter(route => localFavoriteIds.has(String(route[0]))).length;
        favoriteCount.innerText = realFavoriteCount;
    }

    if (readyCount && readyList) {
        readyCount.innerText = readyList.querySelectorAll("li").length;
    }
}

function getDefaultRouteType() {
    const select = getElement("routeType");
    return select ? select.value : "driving";
}

function setRouteInfo(text) {
    const block = getElement("routeInfo");
    if (block) block.innerText = text;
}

function setRouteTitle(title) {
    const block = getElement("routeTitleDisplay");
    if (!block) return;

    block.innerText = title || "Новый маршрут";
    block.title = title || "Новый маршрут";
}

function updateRouteNameCounter() {
    const input = getElement("routeName");
    const counter = getElement("routeNameCounter");

    if (!input || !counter) return;

    counter.innerText = `${input.value.length}/80`;
    setRouteTitle(input.value.trim() || "Новый маршрут");
}

function showToast(message, type = "info") {
    const container = getElement("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button type="button" aria-label="Закрыть">×</button>
    `;

    toast.querySelector("button").addEventListener("click", () => toast.remove());
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3500);
}

function showConfirm(title, text) {
    return new Promise(resolve => {
        const modal = getElement("confirmModal");
        const titleEl = getElement("confirmTitle");
        const textEl = getElement("confirmText");
        const cancel = getElement("confirmCancel");
        const accept = getElement("confirmAccept");

        if (!modal || !cancel || !accept) {
            resolve(confirm(text));
            return;
        }

        titleEl.innerText = title;
        textEl.innerText = text;
        modal.classList.remove("hidden");

        const close = result => {
            modal.classList.add("hidden");
            cancel.onclick = null;
            accept.onclick = null;
            resolve(result);
        };

        cancel.onclick = () => close(false);
        accept.onclick = () => close(true);
    });
}

function animateHeartButton(button) {
    if (!button) return;

    button.classList.remove("heart-pop");
    void button.offsetWidth;
    button.classList.add("heart-pop");

    setTimeout(() => {
        button.classList.remove("heart-pop");
    }, 520);
}

function getSegmentIcon(type) {
    if (type === "foot") {
        return `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="4.5" r="2"></circle>
                <path d="M10.8 8.5l-1.3 4.2 2.7 2.2-1.2 5.1"></path>
                <path d="M13.2 8.5l2.4 2.2"></path>
                <path d="M9.6 12.2l-2.6 2.4"></path>
                <path d="M12.4 14.8l3.8 2.7"></path>
            </svg>
        `;
    }

    return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 16l1.2-5.2A2 2 0 0 1 8.2 9h7.6a2 2 0 0 1 2 1.8L19 16"></path>
            <path d="M4 16h16"></path>
            <path d="M7 16v2"></path>
            <path d="M17 16v2"></path>
            <circle cx="7.5" cy="16.5" r="1.5"></circle>
            <circle cx="16.5" cy="16.5" r="1.5"></circle>
        </svg>
    `;
}

function getHeartIcon(isFavorite) {
    return `
        <svg viewBox="0 0 24 24" fill="${isFavorite ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.8 4.6c-1.7-1.7-4.5-1.7-6.2 0L12 7.2 9.4 4.6c-1.7-1.7-4.5-1.7-6.2 0s-1.7 4.5 0 6.2L12 19.6l8.8-8.8c1.7-1.7 1.7-4.5 0-6.2z"></path>
        </svg>
    `;
}

function getEditIcon() {
    return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
        </svg>
    `;
}

function getTrashIcon() {
    return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"></path>
            <path d="M8 6V4h8v2"></path>
            <path d="M19 6l-1 14H6L5 6"></path>
            <path d="M10 11v5"></path>
            <path d="M14 11v5"></path>
        </svg>
    `;
}

map.on("click", function (event) {
    if (editingPointIndex !== null) {
        map.removeLayer(markers[editingPointIndex]);
        markers[editingPointIndex] = L.marker(event.latlng).addTo(map);
        points[editingPointIndex] = event.latlng;
        editingPointIndex = null;

        updatePointLabels();
        renderSegments();
        drawRoute();

        if (currentRouteId) {
            fetch(`/update_route_points/${currentRouteId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ points: points.map(p => [p.lat, p.lng]) })
            }).catch(() => showToast("Не удалось сохранить изменения точки.", "error"));
        }
        return;
    }

    if (points.length >= 4) {
        showToast("Можно выбрать не более четырёх точек маршрута.", "info");
        return;
    }

    addPoint(event.latlng, true);
});

function addPoint(latlng, shouldDraw = true) {
    const marker = L.marker(latlng).addTo(map);

    markers.push(marker);
    points.push(latlng);

    if (points.length > 1) {
        segmentTypes.push(getDefaultRouteType());
    }

    updatePointLabels();
    renderSegments();

    if (points.length >= 2 && shouldDraw) {
        drawRoute();
    } else if (points.length === 1) {
        setRouteInfo("Выберите вторую точку, чтобы построить маршрут.");
    }
}

function renderSegments() {
    const container = getElement("segments");

    if (!container) return;

    container.innerHTML = "";

    if (points.length < 2) {
        container.innerHTML = `
            <div class="empty-segment-card">
                Участки появятся после выбора второй точки.
            </div>
        `;
        return;
    }

    for (let i = 0; i < points.length - 1; i++) {
        const type = segmentTypes[i] || "driving";
        const isFoot = type === "foot";

        const div = document.createElement("div");
        div.className = "route-segment-card";

        div.innerHTML = `
            <div class="route-segment-top">
                <p class="route-segment-title">Участок ${i + 1}</p>

                <button
                    type="button"
                    class="segment-switch ${isFoot ? "segment-switch-foot" : "segment-switch-driving"}"
                    onclick="toggleSegmentType(${i})"
                    title="${isFoot ? "Пешком" : "Транспорт"}"
                    aria-label="${isFoot ? "Пешком" : "Транспорт"}"
                >
                    <span class="segment-switch-thumb">${getSegmentIcon(type)}</span>
                </button>
            </div>

            <div class="route-segment-actions">
                <button type="button" class="segment-edit-btn" onclick="editPointPlaceholder(${i})">
                    Изменить
                </button>

                <button type="button" class="segment-delete-btn" onclick="deletePointPlaceholder(${i})">
                    Удалить
                </button>
            </div>
        `;

        container.appendChild(div);
    }
}

function toggleSegmentType(index) {
    const current = segmentTypes[index] || "driving";
    segmentTypes[index] = current === "foot" ? "driving" : "foot";

    renderSegments();
    drawRoute();

    if (currentRouteId) {
        fetch(`/update_route_segments/${currentRouteId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ segmentTypes })
        }).catch(() => showToast("Не удалось сохранить изменения участка.", "error"));
    }
}

function editPointPlaceholder(pointIndex) {
    editingPointIndex = pointIndex;
    showToast(`Кликните на карте, чтобы выбрать новое место для точки ${pointIndex + 1}.`, "info");
}

function deletePointPlaceholder(pointIndex) {
    if (points.length <= 2) {
        showToast("Маршрут должен содержать минимум две точки.", "info");
        return;
    }

    map.removeLayer(markers[pointIndex]);
    markers.splice(pointIndex, 1);
    points.splice(pointIndex, 1);

    if (pointIndex < segmentTypes.length) {
        segmentTypes.splice(pointIndex, 1);
    } else {
        segmentTypes.splice(pointIndex - 1, 1);
    }

    updatePointLabels();
    renderSegments();
    drawRoute();
}

function drawFallbackSegment(start, end, type) {
    const color = type === "foot" ? "#16a34a" : "#2563eb";

    const line = L.polyline(
        [
            [start.lat, start.lng],
            [end.lat, end.lng]
        ],
        {
            color,
            weight: 5,
            opacity: 0.8,
            dashArray: "8 8"
        }
    ).addTo(map);

    routeLines.push(line);

    const distance = map.distance(start, end);
    const speed = type === "foot" ? 1.4 : 8.3;

    return {
        distance,
        duration: distance / speed
    };
}

async function drawRoute() {
    routeLines.forEach(line => map.removeLayer(line));
    routeLines = [];

    if (points.length < 2) {
        setRouteInfo("Выберите минимум две точки, чтобы построить маршрут.");
        return;
    }

    let totalDistance = 0;
    let totalDuration = 0;
    let usedFallback = false;

    setRouteInfo("Построение маршрута...");

    for (let i = 0; i < points.length - 1; i++) {
        const type = segmentTypes[i] || "driving";
        const profile = type === "foot" ? "foot-walking" : "driving-car";

        const coords = [
            [points[i].lng, points[i].lat],
            [points[i + 1].lng, points[i + 1].lat]
        ];

        try {
            const response = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
                method: "POST",
                headers: {
                    "Authorization": ORS_API_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ coordinates: coords })
            });

            if (!response.ok) throw new Error("route service error");

            const data = await response.json();
            if (!data.features || !data.features.length) throw new Error("empty route");

            const route = data.features[0];
            const latlngs = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            const color = type === "foot" ? "#16a34a" : "#2563eb";

            const line = L.polyline(latlngs, {
                color,
                weight: 5,
                opacity: 0.88
            }).addTo(map);

            routeLines.push(line);
            totalDistance += route.properties.summary.distance;
            totalDuration += route.properties.summary.duration;
        } catch (error) {
            const fallback = drawFallbackSegment(points[i], points[i + 1], type);

            totalDistance += fallback.distance;
            totalDuration += fallback.duration;
            usedFallback = true;
        }
    }

    window.currentRouteDistance = totalDistance;
    window.currentRouteDuration = totalDuration;

    if (routeLines.length > 0) {
        const group = L.featureGroup(routeLines);
        map.fitBounds(group.getBounds(), { padding: [30, 30] });

        setRouteInfo(
            `Расстояние: ${(totalDistance / 1000).toFixed(2)} км\nВремя: ${Math.round(totalDuration / 60)} мин${usedFallback ? "\nЧасть маршрута показана прямой линией" : ""}`
        );
    } else {
        setRouteInfo("Маршрут не построен.");
    }
}

function updatePointLabels() {
    const pointA = getElement("pointA");
    const pointB = getElement("pointB");

    if (pointA) {
        pointA.innerText = points[0]
            ? `${points[0].lat.toFixed(5)}, ${points[0].lng.toFixed(5)}`
            : "Не выбрана";
    }

    if (pointB) {
        pointB.innerText = points.length > 1
            ? `${points[points.length - 1].lat.toFixed(5)}, ${points[points.length - 1].lng.toFixed(5)}`
            : "Не выбрана";
    }
}

function clearRoute() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    points = [];
    segmentTypes = [];

    routeLines.forEach(line => map.removeLayer(line));
    routeLines = [];

    window.currentRouteDistance = 0;
    window.currentRouteDuration = 0;
    currentRouteId = null;
    editingPointIndex = null;

    const segments = getElement("segments");
    if (segments) segments.innerHTML = "";

    const pointA = getElement("pointA");
    const pointB = getElement("pointB");

    if (pointA) pointA.innerText = "Не выбрана";
    if (pointB) pointB.innerText = "Не выбрана";

    const routeName = getElement("routeName");
    if (routeName) {
        routeName.value = "";
        updateRouteNameCounter();
    }

    setRouteTitle("Новый маршрут");
    setRouteInfo("Нажмите на карту или найдите адрес, чтобы добавить точки.");
    renderSegments();
    renderPOI(poiCache || []);
    renderAdminPOI(adminPoiCache || []);
}

async function routeNameExists(name) {
    try {
        const response = await fetch("/get_routes");
        if (!response.ok) return false;

        const routes = await response.json();
        const normalized = name.trim().toLowerCase();

        return routes.some(route => String(route[1] || "").trim().toLowerCase() === normalized);
    } catch {
        return false;
    }
}

async function saveRoute() {
    const input = getElement("routeName");

    if (!input) {
        showToast("Войдите, чтобы сохранять маршруты.", "info");
        return;
    }

    const name = input.value.trim();

    if (!name) {
        showToast("Введите название маршрута.", "error");
        return;
    }

    if (points.length < 2) {
        showToast("Выберите минимум две точки маршрута.", "error");
        return;
    }

    const exists = await routeNameExists(name);

    if (exists) {
        showToast("Маршрут с таким названием уже существует.", "error");
        return;
    }

    const data = {
        name,
        points: points.map(point => [point.lat, point.lng]),
        segmentTypes,
        distance: ((window.currentRouteDistance || 0) / 1000).toFixed(1),
        duration: Math.round((window.currentRouteDuration || 0) / 60)
    };

    fetch("/save_route", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    })
        .then(response => {
            if (!response.ok) throw new Error("save error");
            return response.json().catch(() => ({}));
        })
        .then(() => {
            showToast("Маршрут сохранён.", "success");
            renderPOI(poiCache || []);
            renderAdminPOI(adminPoiCache || []);
            input.value = "";
            updateRouteNameCounter();
            loadRouteList();
        })
        .catch(() => {
            showToast("Не удалось сохранить маршрут.", "error");
        });
}

function createRouteListItem(route, options = {}) {
    const id = route[0];
    const name = route[1] || "Без названия";
    const isFavorite = localFavoriteIds.has(String(id));
    const isFavoriteList = Boolean(options.favoriteList);

    const li = document.createElement("li");
    li.className = "route-list-item";

    const head = document.createElement("div");
    head.className = "route-item-head";

    const title = document.createElement("p");
    title.className = "route-item-title";
    title.textContent = name;
    title.title = name;

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = `route-icon-btn route-favorite-heart ${isFavorite ? "active" : ""}`;
    favoriteButton.innerHTML = getHeartIcon(isFavorite);
    favoriteButton.title = isFavorite ? "Убрать из избранного" : "Добавить в избранное";
    favoriteButton.setAttribute("aria-label", favoriteButton.title);
    favoriteButton.addEventListener("click", () => toggleFavorite(id, favoriteButton));

    head.appendChild(title);
    head.appendChild(favoriteButton);

    const actions = document.createElement("div");
    actions.className = isFavoriteList ? "route-actions favorite-route-actions" : "route-actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "btn-open";
    openButton.textContent = "Открыть";
    openButton.addEventListener("click", () => loadRoute(id, name));

    actions.appendChild(openButton);

    if (isFavoriteList) {
        actions.classList.add("favorite-route-actions");
    } else {
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "route-icon-btn route-edit-btn";
        editButton.innerHTML = getEditIcon();
        editButton.title = "Редактировать название";
        editButton.setAttribute("aria-label", "Редактировать название");
        editButton.addEventListener("click", () => {
            const currentLi = editButton.closest(".route-list-item");
            const titleEl = currentLi.querySelector(".route-item-title");
            const currentName = titleEl.textContent;

            const editInput = document.createElement("input");
            editInput.type = "text";
            editInput.value = currentName;
            editInput.className = "map-input";
            editInput.style.cssText = "font-size:13px;padding:4px 8px;height:auto;";
            editInput.maxLength = 80;

            titleEl.replaceWith(editInput);
            editInput.focus();
            editInput.select();

            const save = () => {
                const trimmed = editInput.value.trim();
                if (!trimmed) {
                    showToast("Название не может быть пустым.", "error");
                    editInput.replaceWith(titleEl);
                    return;
                }

                fetch(`/rename_route/${id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: trimmed })
                })
                    .then(response => {
                    if (!response.ok) throw new Error();
                    showToast("Название изменено.", "success");

                    if (currentRouteId === id) {
                        setRouteTitle(trimmed);
                    }

                    loadRouteList();
                })
                    .catch(() => {
                        showToast("Не удалось переименовать маршрут.", "error");
                        editInput.replaceWith(titleEl);
                    });
            };

            editInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") editInput.replaceWith(titleEl);
            });

            editInput.addEventListener("blur", () => {
                setTimeout(() => editInput.isConnected && editInput.replaceWith(titleEl), 150);
            });
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "route-icon-btn route-delete-icon-btn";
        deleteButton.innerHTML = getTrashIcon();
        deleteButton.title = "Удалить маршрут";
        deleteButton.setAttribute("aria-label", "Удалить маршрут");
        deleteButton.addEventListener("click", () => deleteRoute(id));

        actions.appendChild(editButton);
        actions.appendChild(deleteButton);
    }

    li.appendChild(head);
    li.appendChild(actions);

    return li;
}

function renderCreatedRouteList(routes) {
    const list = getElement("routeList");
    if (!list) return;

    list.innerHTML = "";

    if (!routes.length) {
        list.innerHTML = `
            <li class="route-empty-item">
                <p class="route-item-title">Созданных маршрутов пока нет.</p>
            </li>
        `;
        return;
    }

    routes.forEach(route => {
        list.appendChild(createRouteListItem(route));
    });
}

function renderFavoriteRouteList(routes) {
    const list = getElement("favoriteRouteList");
    if (!list) return;

    const favoriteRoutes = routes.filter(route => localFavoriteIds.has(String(route[0])));
    list.innerHTML = "";

    if (!favoriteRoutes.length) {
        list.innerHTML = `
            <li class="route-empty-item">
                <p class="route-item-title">Избранных маршрутов пока нет.</p>
            </li>
        `;
        return;
    }

    favoriteRoutes.forEach(route => {
        list.appendChild(createRouteListItem(route, { favoriteList: true }));
    });
}

function renderRouteLists(routes) {
    cachedUserRoutes = Array.isArray(routes) ? routes : [];

    localFavoriteIds = new Set(
        cachedUserRoutes.filter(route => Number(route[2]) === 1).map(route => String(route[0]))
    );

    renderCreatedRouteList(cachedUserRoutes);
    renderFavoriteRouteList(cachedUserRoutes);
    updateRouteStats(cachedUserRoutes);
}

function loadRouteList() {
    const createdList = getElement("routeList");
    const favoriteList = getElement("favoriteRouteList");
    if (!createdList && !favoriteList) return;

    fetch("/get_routes")
        .then(response => response.json())
        .then(routes => {
            renderRouteLists(routes || []);
        })
        .catch(() => {
            showToast("Не удалось загрузить список маршрутов.", "error");
        });
}

function loadRoute(id, routeName = "") {
    fetch(`/load_route/${id}`)
        .then(response => {
            if (!response.ok) throw new Error("load error");
            return response.json();
        })
        .then(data => {
            clearRoute();

            if (data.points && data.points.length) {
                data.points.forEach(point => {
                    addPoint(L.latLng(point[0], point[1]), false);
                });
            }

            segmentTypes = data.segmentTypes || [];
            renderSegments();
            drawRoute();
            renderPOI(poiCache || []);
            renderAdminPOI(adminPoiCache || []);

            const input = getElement("routeName");
            if (input) {
                input.value = routeName;
                updateRouteNameCounter();
            }

            setRouteTitle(routeName || "Сохранённый маршрут");
            currentRouteId = id;
            showToast("Маршрут открыт.", "success");
        })
        .catch(() => showToast("Не удалось открыть маршрут.", "error"));
}

async function deleteRoute(id) {
    const confirmed = await showConfirm(
        "Удалить маршрут?",
        "Маршрут будет удалён из списка. Это действие нельзя отменить."
    );

    if (!confirmed) return;

    fetch(`/delete_route/${id}`, {
        method: "POST"
    })
        .then(response => {
            if (!response.ok) throw new Error("delete error");

            localFavoriteIds.delete(String(id));
            saveLocalFavorites();
            showToast("Маршрут удалён.", "success");
            loadRouteList();
        })
        .catch(() => {
            showToast("Не удалось удалить маршрут.", "error");
        });
}

async function toggleFavorite(id, button) {
    try {
        const response = await fetch(`/toggle_favorite/${id}`, { method: "POST" });
        if (!response.ok) throw new Error();

        const key = String(id);
        const isNowFavorite = !localFavoriteIds.has(key);

        if (isNowFavorite) {
            localFavoriteIds.add(key);
            showToast("Маршрут добавлен в избранное.", "success");
        } else {
            localFavoriteIds.delete(key);
            showToast("Маршрут убран из избранного.", "success");
        }

        if (button) {
            button.classList.toggle("active", isNowFavorite);
            button.innerHTML = getHeartIcon(isNowFavorite);
            button.title = isNowFavorite ? "Убрать из избранного" : "Добавить в избранное";
            button.setAttribute("aria-label", button.title);
            animateHeartButton(button);
        }

        loadRouteList();
    } catch {
        showToast("Не удалось обновить избранное.", "error");
    }
}

function getIcon(type) {
    let className = "poi-icon";
    let label = "М";

    if (type === "cafe") {
        className += " poi-icon-cafe";
        label = "К";
    } else if (type === "restaurant") {
        className += " poi-icon-restaurant";
        label = "Р";
    } else if (type === "attraction") {
        className += " poi-icon-attraction";
        label = "Д";
    }

    return L.divIcon({
        className: "",
        html: `<div class="${className}">${label}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -28]
    });
}

function normalizePOIType(element) {
    if (!element.tags) return null;

    if (element.tags.amenity === "cafe") return "cafe";
    if (element.tags.amenity === "restaurant") return "restaurant";
    if (element.tags.tourism === "attraction") return "attraction";

    return null;
}

function getPOILabel(type) {
    if (type === "cafe") return "Кафе";
    if (type === "restaurant") return "Ресторан";
    if (type === "attraction") return "Достопримечательность";
    return "Объект";
}

function isTypeEnabled(type) {
    return (
        (type === "cafe" && getElement("filterCafe")?.checked) ||
        (type === "restaurant" && getElement("filterRestaurant")?.checked) ||
        (type === "attraction" && getElement("filterAttraction")?.checked)
    );
}

function clearPOI() {
    poiMarkers.forEach(marker => map.removeLayer(marker));
    poiMarkers = [];
}

function isNearRoute(lat, lng, radiusMeters = 50) {
    if (!points.length) return true;
    return points.some(p => map.distance([lat, lng], [p.lat, p.lng]) <= radiusMeters);
}

function renderPOI(elements) {
    clearPOI();

    elements.forEach(element => {
        if (!element.lat || !element.lon) return;

        const type = normalizePOIType(element);
        if (!type || !isTypeEnabled(type) || !isNearRoute(element.lat, element.lon)) return;

        const name = element.tags?.name || "Без названия";

        const marker = L.marker([element.lat, element.lon], {
            icon: getIcon(type)
        }).addTo(map);

        marker.bindPopup(`
            <b>${name}</b>
            <br>
            <span>${getPOILabel(type)}</span>
            <br>
            <button onclick="addPOIToRoute(${element.lat}, ${element.lon})">
                Добавить в маршрут
            </button>
        `);

        poiMarkers.push(marker);
    });
}

function renderAdminPOI(pois) {
    adminPoiMarkers.forEach(marker => map.removeLayer(marker));
    adminPoiMarkers = [];

    pois.forEach(poi => {
        if (!isTypeEnabled(poi.category) || !isNearRoute(poi.lat, poi.lng)) return;

        const marker = L.marker([poi.lat, poi.lng], { icon: getIcon(poi.category) }).addTo(map);
        marker.bindPopup(`
            <b>${poi.name}</b><br>
            <span>${poi.description || ""}</span><br>
            <button onclick="addPOIToRoute(${poi.lat}, ${poi.lng})">Добавить в маршрут</button>
        `);
        adminPoiMarkers.push(marker);
    });
}

async function loadAdminPOI() {
    if (adminPoiCache) {
        renderAdminPOI(adminPoiCache);
        return;
    }

    try {
        const response = await fetch("/get_pois");
        if (!response.ok) throw new Error();
        adminPoiCache = await response.json();
        renderAdminPOI(adminPoiCache);
    } catch {
        showToast("Не удалось загрузить пользовательские объекты.", "error");
    }
}

async function loadPOI() {
    if (poiCache) {
        renderPOI(poiCache);
        return;
    }

    const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"cafe|restaurant"](42.7,131.5,43.6,132.3);
      node["tourism"="attraction"](42.7,131.5,43.6,132.3);
    );
    out body;
    `;

    try {
        const response = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: query
        });

        const data = await response.json();
        poiCache = data.elements || [];

        renderPOI(poiCache);
    } catch {
        showToast("Не удалось загрузить объекты карты.", "error");
    }
}

function addPOIToRoute(lat, lon) {
    if (points.length >= 4) {
        showToast("Можно выбрать не более четырёх точек маршрута.", "info");
        return;
    }

    addPoint(L.latLng(lat, lon), true);
}

function isMobileMapLayout() {
    return window.matchMedia("(max-width: 760px)").matches;
}

function setMobileRoutePanel(panelName = "created") {
    const panels = document.querySelectorAll("[data-route-panel]");
    const tabs = document.querySelectorAll("[data-route-tab]");

    if (!panels.length) return;

    const availablePanels = Array.from(panels).map(panel => panel.dataset.routePanel);
    const targetName = availablePanels.includes(panelName) ? panelName : availablePanels[0];

    panels.forEach(panel => {
        const isActive = panel.dataset.routePanel === targetName;
        panel.classList.toggle("mobile-route-panel-active", isActive);

        if (isMobileMapLayout()) {
            panel.open = isActive;
        }
    });

    tabs.forEach(tab => {
        tab.classList.toggle("active", tab.dataset.routeTab === targetName);
    });
}

function closeMobileSheets() {
    const sidebar = document.querySelector(".map-sidebar");
    const rightPanel = document.querySelector(".map-right-panel");
    const backdrop = getElement("mobileSheetBackdrop");

    sidebar?.classList.remove("mobile-active");
    rightPanel?.classList.remove("mobile-active");
    backdrop?.classList.remove("mobile-active");
}

function openMobileSheet(sheetName, panelName = "") {
    if (!isMobileMapLayout()) return;

    const sidebar = document.querySelector(".map-sidebar");
    const rightPanel = document.querySelector(".map-right-panel");
    const backdrop = getElement("mobileSheetBackdrop");

    sidebar?.classList.toggle("mobile-active", sheetName === "route");
    rightPanel?.classList.toggle("mobile-active", sheetName === "routes");
    backdrop?.classList.add("mobile-active");

    if (sheetName === "routes") {
        setMobileRoutePanel(panelName || "created");
    }
}

function initMobileSheets() {
    document.querySelectorAll("[data-mobile-sheet]").forEach(button => {
        button.addEventListener("click", () => {
            openMobileSheet(button.dataset.mobileSheet, button.dataset.mobilePanel || "");
        });
    });

    document.querySelectorAll("[data-route-tab]").forEach(button => {
        button.addEventListener("click", () => {
            setMobileRoutePanel(button.dataset.routeTab || "created");
        });
    });

    document.querySelectorAll("[data-close-mobile-sheet]").forEach(button => {
        button.addEventListener("click", closeMobileSheets);
    });

    getElement("mobileSheetBackdrop")?.addEventListener("click", closeMobileSheets);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMobileSheets();
        }
    });

    window.addEventListener("resize", () => {
        if (!isMobileMapLayout()) {
            closeMobileSheets();
        }
    });
}

document.addEventListener("DOMContentLoaded", function () {
    setTimeout(() => map.invalidateSize(), 100);

    const input = getElement("routeName");

    if (input) {
        input.addEventListener("input", updateRouteNameCounter);
        updateRouteNameCounter();
    }

    ["filterCafe", "filterRestaurant", "filterAttraction"].forEach(id => {
        const checkbox = getElement(id);

        if (checkbox) {
            checkbox.addEventListener("change", () => renderPOI(poiCache || []));
        }
    });

    initAddressSearch();
    initMobileSheets();
    setMobileRoutePanel("created");
    updateRouteStats();
    renderSegments();
    loadPOI();
    loadRouteList();
    loadAdminPOI();
    loadRouteList();

    // Загрузка готовых маршрутов в список
    fetch("/get_ready_routes")
        .then(r => r.json())
        .then(routes => {
            const list = getElement("readyRouteList");
            const count = getElement("readyRoutesCount");
            if (count) count.innerText = routes.length;
            if (!list) return;
            list.innerHTML = "";
            if (!routes.length) {
                list.innerHTML = `<li class="route-empty-item"><p class="route-item-title">Готовых маршрутов пока нет.</p></li>`;
                return;
            }
            routes.forEach(route => {
                const li = document.createElement("li");
                li.className = "route-list-item";
                li.innerHTML = `
                    <p class="route-item-title" title="${route.title}">${route.title}</p>
                    <button type="button" class="btn-open">Открыть</button>
                `;
                li.querySelector("button").addEventListener("click", () => {
                    clearRoute();
                    route.points.forEach(p => addPoint(L.latLng(p.lat, p.lng), false));
                    segmentTypes = route.segmentTypes || [];
                    renderSegments();
                    drawRoute();
                    renderPOI(poiCache || []);
                    renderAdminPOI(adminPoiCache || []);
                    setRouteTitle(route.title || "Готовый маршрут");
                    showToast("Готовый маршрут открыт.", "success");
                });
                list.appendChild(li);
            });
        })
        .catch(() => showToast("Не удалось загрузить готовые маршруты.", "error"));

    // Обработка URL-параметров
    const urlParams = new URLSearchParams(window.location.search);
    const readyRouteId = urlParams.get("ready_route");
    const poiLat = urlParams.get("poi_lat");
    const poiLng = urlParams.get("poi_lng");
    const poiName = urlParams.get("poi_name");

    if (readyRouteId) {
        fetch(`/load_ready_route/${readyRouteId}`)
            .then(r => r.json())
            .then(data => {
                clearRoute();
                data.points.forEach(p => addPoint(L.latLng(p.lat, p.lng), false));
                segmentTypes = data.segmentTypes || [];
                renderSegments();
                drawRoute();
                renderPOI(poiCache || []);
                renderAdminPOI(adminPoiCache || []);
                setRouteTitle(data.title || "Готовый маршрут");
            });
    }

    const routeId = urlParams.get("route_id");

    if (routeId) {
        fetch(`/load_route/${routeId}`)
            .then(r => {
                if (!r.ok) throw new Error();
                return r.json();
            })
            .then(data => {
                clearRoute();
                if (data.points && data.points.length) {
                    data.points.forEach(p => addPoint(L.latLng(p[0], p[1]), false));
                }
                segmentTypes = data.segmentTypes || [];
                renderSegments();
                drawRoute().then(() => {
                    renderPOI(poiCache || []);
                    renderAdminPOI(adminPoiCache || []);
                });
                currentRouteId = parseInt(routeId);
                showToast("Маршрут открыт.", "success");
            })
            .catch(() => showToast("Не удалось загрузить маршрут.", "error"));
    }

    if (poiLat && poiLng) {
        const lat = parseFloat(poiLat);
        const lng = parseFloat(poiLng);
        const name = poiName ? decodeURIComponent(poiName) : "Достопримечательность";
        map.setView([lat, lng], 17);
        addPoint(L.latLng(lat, lng), false);
        L.marker([lat, lng]).addTo(map).bindPopup(`<b>${name}</b>`).openPopup();
        setRouteInfo("Выберите вторую точку, чтобы построить маршрут.");
    }


    window.addEventListener("resize", function () {
        setTimeout(() => map.invalidateSize(), 100);
    });
});
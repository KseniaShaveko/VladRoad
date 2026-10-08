const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQxY2Q2MGIzNTFmODQzMzJiZmUzMmU1YmI3ZTc1OWRkIiwiaCI6Im11cm11cjY0In0=";

let map = L.map("map", {
    maxZoom: 18,
    minZoom: 11,
    attributionControl: true
}).setView([43.1155, 131.8855], 12);

const params = new URLSearchParams(window.location.search);

const readyRouteId = params.get("ready_route");

if (readyRouteId) {

    fetch(`/load_ready_route/${readyRouteId}`)

        .then(response => response.json())

        .then(data => {

            clearRoute();

            data.points.forEach(point => {

                addPoint(
                    L.latLng(
                        point.lat,
                        point.lng
                    ),
                    false
                );
            });

            segmentTypes =
                data.segmentTypes || [];

            const input = getElement("routeName");

            renderSegments();
            drawRoute();

            if (input) {
                input.value = data.title || "";
                updateRouteNameCounter();
            }

            setRouteTitle(data.title || "Готовый маршрут");
        });
}

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
let adminPoiMarkers = [];

let poiCache = null;
let adminPoiCache = null;

window.currentRouteDistance = 0;
window.currentRouteDuration = 0;

let localFavoriteIds = new Set(JSON.parse(localStorage.getItem("vladroadFavoriteRoutes") || "[]"));

function getElement(id) {
    return document.getElementById(id);
}

function saveLocalFavorites() {
    localStorage.setItem("vladroadFavoriteRoutes", JSON.stringify(Array.from(localFavoriteIds)));
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
}

function editPointPlaceholder(pointIndex) {
    showToast(`Изменение точки ${pointIndex + 1} будет доступно после обновления базы данных.`, "info");
}

function deletePointPlaceholder(pointIndex) {
    showToast(`Удаление отдельной точки ${pointIndex + 1} будет доступно после обновления базы данных.`, "info");
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
            `Расстояние: ${(totalDistance / 1000).toFixed(2)} км | Время: ${Math.round(totalDuration / 60)} мин${usedFallback ? " | часть маршрута показана прямой линией" : ""}`
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
    setRouteInfo("Нажмите на карту, чтобы добавить точки.");
    renderSegments();
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
            input.value = "";
            updateRouteNameCounter();
            loadRouteList();
        })
        .catch(() => {
            showToast("Не удалось сохранить маршрут.", "error");
        });
}

function loadRouteList() {
    const list = getElement("routeList");
    if (!list) return;

    fetch("/get_routes")
        .then(response => response.json())
        .then(routes => {
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
                const id = route[0];
                const name = route[1] || "Без названия";
                const isFavorite = localFavoriteIds.has(String(id));

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
                actions.className = "route-actions";

                const openButton = document.createElement("button");
                openButton.type = "button";
                openButton.className = "btn-open";
                openButton.textContent = "Открыть";
                openButton.addEventListener("click", () => loadRoute(id, name));

                const editButton = document.createElement("button");
                editButton.type = "button";
                editButton.className = "route-icon-btn route-edit-btn";
                editButton.innerHTML = getEditIcon();
                editButton.title = "Редактировать название";
                editButton.setAttribute("aria-label", "Редактировать название");
                editButton.addEventListener("click", () => {
                    showToast("Редактирование будет доступно после обновления базы данных.", "info");
                });

                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "route-icon-btn route-delete-icon-btn";
                deleteButton.innerHTML = getTrashIcon();
                deleteButton.title = "Удалить маршрут";
                deleteButton.setAttribute("aria-label", "Удалить маршрут");
                deleteButton.addEventListener("click", () => deleteRoute(id));

                actions.appendChild(openButton);
                actions.appendChild(editButton);
                actions.appendChild(deleteButton);

                li.appendChild(head);
                li.appendChild(actions);
                list.appendChild(li);
            });
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

            const input = getElement("routeName");

            if (input) {
                input.value = routeName;
                updateRouteNameCounter();
            }

            setRouteTitle(routeName || "Сохранённый маршрут");
            showToast("Маршрут открыт.", "success");
        })
        .catch(() => {
            showToast("Не удалось открыть маршрут.", "error");
        });
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

function toggleFavorite(id, button) {
    const key = String(id);
    const isNowFavorite = !localFavoriteIds.has(key);

    if (isNowFavorite) {
        localFavoriteIds.add(key);
        showToast("Маршрут добавлен в избранное.", "success");
    } else {
        localFavoriteIds.delete(key);
        showToast("Маршрут убран из избранного.", "success");
    }

    saveLocalFavorites();

    if (button) {
        button.classList.toggle("active", isNowFavorite);
        button.innerHTML = getHeartIcon(isNowFavorite);
        button.title = isNowFavorite ? "Убрать из избранного" : "Добавить в избранное";
        button.setAttribute("aria-label", button.title);
        animateHeartButton(button);
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

function renderPOI(elements) {
    clearPOI();

    elements.forEach(element => {
        if (!element.lat || !element.lon) return;

        const type = normalizePOIType(element);
        if (!type || !isTypeEnabled(type)) return;

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

async function loadAdminPOI() {

    if (adminPoiCache) {

        renderAdminPOI(adminPoiCache);
        return;
    }

    try {

        const response = await fetch("/get_pois");

        if (!response.ok) {
            throw new Error("Ошибка загрузки");
        }

        const pois = await response.json();

        adminPoiCache = pois;

        renderAdminPOI(adminPoiCache);

    } catch (error) {

        console.error("Ошибка загрузки админских POI:", error);

        showToast(
            "Не удалось загрузить пользовательские объекты.",
            "error"
        );
    }
}

function renderAdminPOI(pois) {

    adminPoiMarkers.forEach(marker => {

        map.removeLayer(marker);
    });

    adminPoiMarkers = [];

    pois.forEach(poi => {

        if (!isTypeEnabled(poi.category)) {
            return;
        }

        const marker = L.marker(
            [poi.lat, poi.lng],
            {
                icon: getIcon(poi.category)
            }
        ).addTo(map);

        marker.bindPopup(`
            <b>${poi.name}</b>
            <br>
            <span>${poi.description}</span>
            <br>
            <button onclick="addPOIToRoute(${poi.lat}, ${poi.lng})">
                Добавить в маршрут
            </button>
        `);

        adminPoiMarkers.push(marker);
    });
}

function addPOIToRoute(lat, lon) {
    if (points.length >= 4) {
        showToast("Можно выбрать не более четырёх точек маршрута.", "info");
        return;
    }

    addPoint(L.latLng(lat, lon), true);
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
            checkbox.addEventListener("change", () => {

                renderPOI(poiCache || []);

                renderAdminPOI(adminPoiCache || []);
            });
        }
    });

    renderSegments();
    loadPOI();

    loadAdminPOI();

    loadRouteList();

    window.addEventListener("resize", function () {
        setTimeout(() => map.invalidateSize(), 100);
    });
});


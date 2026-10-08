console.log("MAP JS LOADED");

// ---------------- ИНИЦИАЛИЗАЦИЯ ----------------
let map = L.map('map', {
    maxZoom: 18,
    minZoom: 11,
    attributionControl: true
}).setView([43.1155, 131.8855], 12);

map.attributionControl.setPrefix(false);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: 'OpenStreetMap'
}).addTo(map);

// ---------------- ГРАНИЦЫ ----------------
let bounds = L.latLngBounds(
    [42.7, 131.5],
    [43.6, 132.3]
);

map.setMaxBounds(bounds);

map.on('drag', function () {
    map.panInsideBounds(bounds, { animate: false });
});

L.rectangle(bounds, {
    color: "#ff7800",
    weight: 1,
    fillOpacity: 0.05
}).addTo(map);

// ---------------- ДАННЫЕ ----------------
let points = [];
let markers = [];
let routeLines = [];
let segmentTypes = [];

let totalDistance = 0;
let totalDuration = 0;

// ---------------- КЛИК ПО КАРТЕ ----------------
map.on('click', function(e) {

    if (adminAddMode) {

        createPOI(
            e.latlng.lat,
            e.latlng.lng
        );

        adminAddMode = false;
        return;
    }

    if (points.length >= 4) return;

    addPoint(e.latlng);
});

// ---------------- ДОБАВЛЕНИЕ ТОЧКИ ----------------
function addPoint(latlng) {

    let marker = L.marker(latlng).addTo(map);

    markers.push(marker);
    points.push(latlng);

    if (points.length > 1) {
        segmentTypes.push(document.getElementById("routeType").value);
    }

    updatePointLabels();
    renderSegments();

    if (points.length >= 2) {
        drawRoute();
    }
}

// ---------------- СЕГМЕНТЫ UI ----------------
function renderSegments() {

    let container = document.getElementById("segments");
    container.innerHTML = "";

    for (let i = 0; i < points.length - 1; i++) {

        let div = document.createElement("div");

        div.innerHTML = `
            <b>Отрезок ${i+1}</b>:
            <select onchange="changeSegmentType(${i}, this.value)">
                <option value="driving" ${segmentTypes[i] === "driving" ? "selected" : ""}>🚗 Авто</option>
                <option value="foot" ${segmentTypes[i] === "foot" ? "selected" : ""}>🚶 Пешком</option>
            </select>
        `;

        container.appendChild(div);
    }
}

function changeSegmentType(index, value) {
    segmentTypes[index] = value;
    drawRoute();
}

// ---------------- МАРШРУТ ----------------
async function drawRoute() {

    // очистка старых линий
    routeLines.forEach(l => map.removeLayer(l));
    routeLines = [];

    totalDistance = 0;
    totalDuration = 0;

    for (let i = 0; i < points.length - 1; i++) {

        let type = segmentTypes[i];
        let profile = (type === "foot") ? "foot-walking" : "driving-car";

        let coords = [
            [points[i].lng, points[i].lat],
            [points[i+1].lng, points[i+1].lat]
        ];

        try {
            let res = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
                method: "POST",
                headers: {
                    "Authorization": "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQxY2Q2MGIzNTFmODQzMzJiZmUzMmU1YmI3ZTc1OWRkIiwiaCI6Im11cm11cjY0In0=",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ coordinates: coords })
            });

            let data = await res.json();

            if (!data.features || !data.features.length) continue;

            let route = data.features[0];

            let latlngs = route.geometry.coordinates.map(c => [c[1], c[0]]);

            let color = (type === "foot") ? "green" : "blue";

            let segmentLine = L.polyline(latlngs, {color: color}).addTo(map);
            routeLines.push(segmentLine);

            totalDistance += route.properties.summary.distance;
            totalDuration += route.properties.summary.duration;

        } catch (err) {
            console.error("Ошибка сегмента:", err);
        }
    }

    if (routeLines.length > 0) {
        let group = L.featureGroup(routeLines);
        map.fitBounds(group.getBounds());
    }

    routeDistance = totalDistance;
    routeDuration = totalDuration;

    document.getElementById("routeInfo").innerText =
        `Расстояние: ${(totalDistance/1000).toFixed(2)} км | Время: ${Math.round(totalDuration/60)} мин`;
}

// ---------------- ТЕКСТ ----------------
function updatePointLabels() {

    document.getElementById("pointA").innerText =
        points[0] ? `${points[0].lat.toFixed(5)}, ${points[0].lng.toFixed(5)}` : "не выбрана";

    document.getElementById("pointB").innerText =
        points[1] ? `${points[1].lat.toFixed(5)}, ${points[1].lng.toFixed(5)}` : "не выбрана";
}

// ---------------- ОЧИСТКА ----------------
function clearRoute() {

    markers.forEach(m => map.removeLayer(m));
    markers = [];
    points = [];
    segmentTypes = [];

    routeLines.forEach(l => map.removeLayer(l));
    routeLines = [];

    document.getElementById("segments").innerHTML = "";

    document.getElementById("pointA").innerText = "не выбрана";
    document.getElementById("pointB").innerText = "не выбрана";
    document.getElementById("routeInfo").innerText = "";
}

//-----------------SAVE---------------
function saveRoute() {

    if (!document.getElementById("routeName")) {
        alert("Войдите, чтобы сохранять маршруты");
        return;
    }

    let name = document.getElementById("routeName").value.trim();

    if (!name) {
        alert("Введите название маршрута");
        return;
    }

    let data = {
        name: name,
        points: points.map(p => [p.lat, p.lng]),
        segmentTypes: segmentTypes,
        distance: totalDistance,
        duration: totalDuration
    };

    fetch("/save_route", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(() => {

        alert("Маршрут сохранён");

        loadRouteList();

        document.getElementById("routeName").value = "";
    })
    .catch(err => {
        console.error(err);
        alert("Ошибка сохранения");
    });
}

//----------------LOAD--------------
function loadRouteList() {

    let list = document.getElementById("routeList");

    if (!list) return;

    fetch("/get_routes")
        .then(res => res.json())
        .then(data => {

            list.innerHTML = "";

            if (data.length === 0) {

                list.innerHTML = `
                    <li class="route-empty">
                        У вас пока нет сохранённых маршрутов
                    </li>
                `;

                return;
            }

            data.forEach(route => {

                let id = route[0];
                let name = route[1];
                let favorite = route[2];

                let li = document.createElement("li");

                li.className = "route-item";

                li.innerHTML = `
                    <div class="route-item-top">
                        <span>
                            ${favorite ? "⭐" : "☆"}
                            <strong>${name}</strong>
                        </span>
                    </div>

                    <div class="route-actions">

                        <button onclick="loadRoute(${id})">
                            📍 Открыть
                        </button>

                        <button onclick="toggleFavorite(${id})">
                            ${favorite ? "💔" : "❤️"}
                        </button>

                        <button onclick="deleteRoute(${id})">
                            🗑
                        </button>

                    </div>
                `;

                list.appendChild(li);
            });

        })
        .catch(err => {
            console.error(err);
        });
}

function loadRoute(id) {

    fetch(`/load_route/${id}`)
        .then(res => res.json())
        .then(data => {

            clearRoute();

            data.points.forEach(p => {
                addPoint(L.latLng(p[0], p[1]));
            });

            segmentTypes = data.segmentTypes;

            renderSegments();
            drawRoute();
        });
}

//-----------------DELETE ROAD---------
function deleteRoute(id) {

    if (!confirm("Удалить маршрут?")) {
        return;
    }

    fetch(`/delete_route/${id}`, {
        method: "POST"
    })
    .then(res => res.json())
    .then(() => {
        loadRouteList();
    })
    .catch(err => {
        console.error(err);
    });
}

//----------------FAVORITE ROAD----------
function toggleFavorite(id) {

    fetch(`/toggle_favorite/${id}`, {
        method: "POST"
    })
    .then(res => res.json())
    .then(() => {
        loadRouteList();
    })
    .catch(err => {
        console.error(err);
    });
}

// ---------------- POI ----------------
let osmMarkers = [];
let adminMarkers = []
let poiCache = null;
let adminAddMode = false;

function getIcon(type) {

    let iconUrl = "";

    if (type === "cafe") {
        iconUrl = "https://cdn-icons-png.flaticon.com/512/2965/2965567.png";
    } 
    else if (type === "restaurant") {
        iconUrl = "https://cdn-icons-png.flaticon.com/512/3075/3075977.png";
    } 
    else if (type === "attraction") {
        iconUrl = "https://cdn-icons-png.flaticon.com/512/684/684908.png";
    } 
    else {
        iconUrl = "https://cdn-icons-png.flaticon.com/512/854/854878.png";
    }

    return L.icon({
        iconUrl: iconUrl,
        iconSize: [26, 26],
        iconAnchor: [13, 26],
        popupAnchor: [0, -26]
    });
}

function isTypeEnabled(type) {
    return (
        (type === "cafe" && document.getElementById("filterCafe")?.checked) ||
        (type === "restaurant" && document.getElementById("filterRestaurant")?.checked) ||
        (type === "attraction" && document.getElementById("filterAttraction")?.checked)
    );
}

function clearPOI() {
    osmMarkers.forEach(m => map.removeLayer(m));
    osmMarkers = [];
}

function renderPOI(elements) {

    clearPOI();

    elements.forEach(el => {

        if (!el.tags) return;

        let type = el.tags.amenity || el.tags.tourism;

        if (!isTypeEnabled(type)) return;

        let name = el.tags.name || "Без названия";

        let marker = L.marker([el.lat, el.lon], {
            icon: getIcon(type)
        }).addTo(map);

        marker.bindPopup(`
            <b>${name}</b><br>${type}<br>
            <button onclick="addPOIToRoute(${el.lat}, ${el.lon})">
                Добавить в маршрут
            </button>
        `);

        osmMarkers.push(marker);
    });
}

async function loadPOI() {

    if (poiCache) {
        renderPOI(poiCache);
        return;
    }

    let query = `
    [out:json][timeout:25];
    (
      node["amenity"~"cafe|restaurant"](42.7,131.5,43.6,132.3);
      node["tourism"="attraction"](42.7,131.5,43.6,132.3);
    );
    out body;
    `;

    try {
        let res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: query
        });

        let data = await res.json();

        poiCache = data.elements;
        renderPOI(poiCache);

    } catch (err) {
        console.error("Ошибка POI:", err);
    }
}

async function loadAdminPOI() {

    try {

        let res = await fetch("/get_pois");

        let pois = await res.json();

        console.log("ADMIN POI:");
        console.log(pois);

        pois.forEach(poi => {

            console.log(
                "Добавляю маркер:",
                poi.name,
                poi.lat,
                poi.lng
            );

            let marker = L.marker(
                [poi.lat, poi.lng],
                {
                    icon: getIcon(poi.category)
                }
            ).addTo(map);

            marker.bindPopup(`
                <b>${poi.name}</b><br>
                ${poi.description}<br>

                <button onclick="addPOIToRoute(${poi.lat}, ${poi.lng})">
                    Добавить в маршрут
                </button>
            `);

            adminMarkers.push(marker);
        });

    } catch(err) {
        console.error(err);
    }
}

function startAddPOI() {

    adminAddMode = true;

    alert("Кликните по карте в месте размещения POI");
}

async function createPOI(lat, lng) {

    let data = {
        name: document.getElementById("poiName").value,
        description: document.getElementById("poiDescription").value,
        category: document.getElementById("poiCategory").value,
        lat: lat,
        lng: lng
    };

    try {

        let res = await fetch("/admin/add_poi", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        let result = await res.json();

        if (result.status === "ok") {

            alert("POI успешно добавлен");

            poiCache = null;
            await loadAdminPOI();
        }

    } catch(err) {
        console.error(err);
    }
}

// добавление POI в маршрут
function addPOIToRoute(lat, lon) {
    if (points.length >= 4) return;
    addPoint(L.latLng(lat, lon));
}

// ---------------- СТАРТ ----------------
document.addEventListener("DOMContentLoaded", function () {

    document.getElementById("filterCafe")
        ?.addEventListener("change", () => renderPOI(poiCache || []));

    document.getElementById("filterRestaurant")
        ?.addEventListener("change", () => renderPOI(poiCache || []));

    document.getElementById("filterAttraction")
        ?.addEventListener("change", () => renderPOI(poiCache || []));

    console.log("DOM LOADED");

    loadPOI();

    console.log("BEFORE loadAdminPOI");

    loadAdminPOI();

    console.log("AFTER loadAdminPOI");

    if (document.getElementById("routeList")) {
        loadRouteList();
    }
});
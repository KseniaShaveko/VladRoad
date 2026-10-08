const { createApp, nextTick } = Vue;

createApp({
    delimiters: ["[[", "]]"],

    data() {
        return {
            activeTab: "overview",

            tabs: [
                { id: "overview", title: "Обзор" },
                { id: "routes", title: "Готовые маршруты" },
                { id: "poi", title: "Точки интереса" },
                { id: "users", title: "Пользователи" }
            ],

            stats: {
                users: 0,
                admins: 0,
                user_routes: 0,
                ready_routes: 0,
                poi: 0,
                attractions: 0,
                cafes: 0,
                restaurants: 0
            },

            users: [],
            userSearch: "",

            pois: [],
            poiCategoryOptions: [
                { value: "attraction", label: "Достопримечательности" },
                { value: "cafe", label: "Кафе" },
                { value: "restaurant", label: "Рестораны" }
            ],
            activePoiCategories: ["attraction", "cafe", "restaurant"],

            poiForm: {
                id: null,
                name: "",
                description: "",
                category: "attraction",
                lat: null,
                lng: null
            },

            readyRoutes: [],

            routeForm: {
                title: "",
                description: "",
                cover_image: ""
            },

            routePoints: [],
            routeSegments: [],
            routeDistance: 0,
            routeDuration: 0,

            routeMode: false,
            poiMode: false,

            routeMap: null,
            poiMap: null,

            routeMarkers: [],
            routeLines: [],
            poiMarkersRouteMap: [],
            poiMarkersPoiMap: [],
            poiTempMarker: null,

            toasts: [],

            confirm: {
                visible: false,
                title: "",
                text: "",
                callback: null
            }
        };
    },

    computed: {
        currentTitle() {
            const current = this.tabs.find(tab => tab.id === this.activeTab);
            return current ? current.title : "Админ-панель";
        },

        overviewCards() {
            return [
                {
                    key: "users",
                    title: "Пользователи",
                    value: this.stats.users,
                    subtitle: "всего аккаунтов"
                },
                {
                    key: "admins",
                    title: "Администраторы",
                    value: this.stats.admins,
                    subtitle: "с правами доступа"
                },
                {
                    key: "user_routes",
                    title: "Маршруты пользователей",
                    value: this.stats.user_routes,
                    subtitle: "создано на карте"
                },
                {
                    key: "ready_routes",
                    title: "Готовые маршруты",
                    value: this.stats.ready_routes,
                    subtitle: "для страницы маршрутов"
                },
                {
                    key: "attractions",
                    title: "Достопримечательности",
                    value: this.stats.attractions,
                    subtitle: "точек на карте"
                },
                {
                    key: "cafes",
                    title: "Кафе",
                    value: this.stats.cafes,
                    subtitle: "точек на карте"
                },
                {
                    key: "restaurants",
                    title: "Рестораны",
                    value: this.stats.restaurants,
                    subtitle: "точек на карте"
                },
                {
                    key: "poi",
                    title: "Все POI",
                    value: this.stats.poi,
                    subtitle: "объектов всего"
                }
            ];
        },

        filteredUsers() {
            const query = this.userSearch.toLowerCase();

            return this.users.filter(user => {
                const username = String(user.username || "").toLowerCase();
                const email = String(user.email || "").toLowerCase();

                return !query || username.includes(query) || email.includes(query);
            });
        },

        adminCount() {
            return this.users.filter(user => Number(user.is_admin) === 1).length;
        },

        routePreviewImage() {
            return this.getStaticImagePath(this.routeForm.cover_image);
        },

        routeDistanceText() {
            return `${(this.routeDistance / 1000).toFixed(1)} км`;
        },

        routeDurationText() {
            const minutes = Math.round(this.routeDuration / 60);
            return `${minutes} мин`;
        },

        routeTransportLabel() {
            if (!this.routeSegments.length) {
                return "Маршрут";
            }

            if (this.routeSegments.every(type => type === "foot")) {
                return "Пешком";
            }

            if (this.routeSegments.every(type => type === "driving")) {
                return "Авто";
            }

            return "Смешанный";
        }
    },

    mounted() {
        this.initMaps();
        this.reloadAll();

        window.adminVue = this;
    },

    methods: {
        setTab(tab) {
            this.activeTab = tab;

            nextTick(() => {
                setTimeout(() => {
                    if (this.routeMap) this.routeMap.invalidateSize();
                    if (this.poiMap) this.poiMap.invalidateSize();
                }, 150);
            });
        },

        async reloadAll() {
            await Promise.all([
                this.loadStats(),
                this.loadUsers(),
                this.loadPois(),
                this.loadReadyRoutes()
            ]);
        },

        async loadStats() {
            try {
                const response = await fetch("/admin/stats");
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Ошибка загрузки статистики");
                }

                this.stats = {
                    users: data.users || 0,
                    admins: data.admins || 0,
                    user_routes: data.user_routes || 0,
                    ready_routes: data.ready_routes || 0,
                    poi: data.poi || 0,
                    attractions: data.attractions || 0,
                    cafes: data.cafes || 0,
                    restaurants: data.restaurants || 0
                };
            } catch (error) {
                this.showToast("Не удалось загрузить статистику.", "error");
            }
        },

        async loadUsers() {
            try {
                const response = await fetch("/admin/users");
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Ошибка загрузки пользователей");
                }

                this.users = data.map(user => {
                    if (Array.isArray(user)) {
                        return {
                            id: user[0],
                            username: user[1],
                            email: user[2],
                            is_admin: user[3],
                            routes_count: user[4] || 0
                        };
                    }

                    return user;
                });
            } catch (error) {
                this.showToast("Не удалось загрузить пользователей.", "error");
            }
        },

        async makeAdmin(user) {
            try {
                const response = await fetch(`/admin/make_admin/${user.id}`, {
                    method: "POST"
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Ошибка назначения роли");
                }

                this.showToast("Пользователь назначен администратором.", "success");
                await this.loadUsers();
                await this.loadStats();
            } catch (error) {
                this.showToast(error.message, "error");
            }
        },

        requestRemoveAdmin(user) {
            if (this.adminCount <= 1) {
                this.showToast("Нельзя снять роль с единственного администратора.", "error");
                return;
            }

            const isSelf = Number(window.ADMIN_CURRENT_USER_ID) === Number(user.id);

            this.openConfirm(
                isSelf ? "Снять роль с себя?" : "Снять роль администратора?",
                isSelf
                    ? "После снятия роли вы можете потерять доступ к админ-панели."
                    : `Снять права администратора у пользователя «${user.username}»?`,
                () => this.removeAdmin(user.id)
            );
        },

        async removeAdmin(userId) {
            try {
                const response = await fetch(`/admin/remove_admin/${userId}`, {
                    method: "POST"
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Ошибка снятия роли");
                }

                this.showToast("Права администратора сняты.", "success");
                await this.loadUsers();
                await this.loadStats();
            } catch (error) {
                this.showToast(error.message, "error");
            }
        },

        async loadPois() {
            try {
                const response = await fetch("/get_pois");
                const data = await response.json();

                this.pois = data || [];

                nextTick(() => {
                    this.renderPoiMarkers();
                });
            } catch (error) {
                this.showToast("Не удалось загрузить POI.", "error");
            }
        },

        startPoiSelection() {
            this.poiMode = true;
            this.routeMode = false;
            this.setTab("poi");
            this.showToast("Кликните по карте, чтобы выбрать координаты.", "info");
        },

        async savePoi() {
            if (!this.poiForm.name) {
                this.showToast("Введите название точки интереса.", "error");
                return;
            }

            if (!this.poiForm.lat || !this.poiForm.lng) {
                this.showToast("Сначала выберите точку на карте.", "error");
                return;
            }

            const isEdit = Boolean(this.poiForm.id);

            const url = isEdit
                ? `/admin/edit_poi/${this.poiForm.id}`
                : "/admin/add_poi";

            try {
                const response = await fetch(url, {
                    method: isEdit ? "PUT" : "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        name: this.poiForm.name,
                        description: this.poiForm.description,
                        category: this.poiForm.category,
                        lat: this.poiForm.lat,
                        lng: this.poiForm.lng
                    })
                });

                const data = await response.json();

                if (!response.ok || data.status !== "ok") {
                    throw new Error(data.error || "Ошибка сохранения POI");
                }

                this.showToast("Точка интереса сохранена.", "success");
                this.resetPoiForm();
                await this.loadPois();
                await this.loadStats();
            } catch (error) {
                this.showToast(error.message, "error");
            }
        },

        editPoi(poi) {
            this.setTab("poi");

            this.poiForm = {
                id: poi.id,
                name: poi.name || "",
                description: poi.description || "",
                category: poi.category || "attraction",
                lat: poi.lat,
                lng: poi.lng
            };

            this.poiMode = true;

            if (this.poiTempMarker) {
                this.poiMap.removeLayer(this.poiTempMarker);
            }

            this.poiTempMarker = L.marker([poi.lat, poi.lng]).addTo(this.poiMap);
            this.poiMap.setView([poi.lat, poi.lng], 15);
        },

        requestDeletePoi(poi) {
            this.openConfirm(
                "Удалить точку интереса?",
                "Объект будет удалён с карты. Это действие нельзя отменить.",
                () => this.deletePoi(poi.id)
            );
        },

        async deletePoi(id) {
            try {
                const response = await fetch(`/admin/delete_poi/${id}`, {
                    method: "POST"
                });

                const data = await response.json();

                if (!response.ok || data.status !== "ok") {
                    throw new Error(data.error || "Ошибка удаления POI");
                }

                this.showToast("Точка интереса удалена.", "success");
                await this.loadPois();
                await this.loadStats();
            } catch (error) {
                this.showToast(error.message, "error");
            }
        },

        resetPoiForm() {
            this.poiForm = {
                id: null,
                name: "",
                description: "",
                category: "attraction",
                lat: null,
                lng: null
            };

            this.poiMode = false;

            if (this.poiTempMarker) {
                this.poiMap.removeLayer(this.poiTempMarker);
                this.poiTempMarker = null;
            }
        },

        selectAllPoiCategories() {
            this.activePoiCategories = this.poiCategoryOptions.map(item => item.value);
            nextTick(() => this.renderPoiMarkers());
        },

        clearPoiCategories() {
            this.activePoiCategories = [];
            nextTick(() => this.renderPoiMarkers());
        },

        renderPoiMarkers() {
            if (!this.routeMap || !this.poiMap) return;

            this.clearPoiMarkers();

            this.pois.forEach(poi => {
                if (!this.activePoiCategories.includes(poi.category)) {
                    return;
                }

                const routeMarker = L.circleMarker(
                    [poi.lat, poi.lng],
                    this.getPoiMarkerStyle(poi.category)
                ).addTo(this.routeMap);

                const poiMarker = L.circleMarker(
                    [poi.lat, poi.lng],
                    this.getPoiMarkerStyle(poi.category)
                ).addTo(this.poiMap);

                const popupHtml = this.getPoiPopupHtml(poi);

                routeMarker.bindPopup(popupHtml);
                poiMarker.bindPopup(popupHtml);

                this.poiMarkersRouteMap.push(routeMarker);
                this.poiMarkersPoiMap.push(poiMarker);
            });
        },

        clearPoiMarkers() {
            this.poiMarkersRouteMap.forEach(marker => this.routeMap.removeLayer(marker));
            this.poiMarkersPoiMap.forEach(marker => this.poiMap.removeLayer(marker));

            this.poiMarkersRouteMap = [];
            this.poiMarkersPoiMap = [];
        },

        getPoiPopupHtml(poi) {
            return `
                <div class="admin-map-popup">
                    <strong>${this.escapeHtml(poi.name)}</strong>
                    <p>${this.escapeHtml(poi.description || "")}</p>
                    <button onclick="window.adminVue.editPoiById(${poi.id})">Редактировать</button>
                    <button onclick="window.adminVue.requestDeletePoiById(${poi.id})">Удалить</button>
                </div>
            `;
        },

        editPoiById(id) {
            const poi = this.pois.find(item => Number(item.id) === Number(id));
            if (poi) {
                this.editPoi(poi);
            }
        },

        requestDeletePoiById(id) {
            const poi = this.pois.find(item => Number(item.id) === Number(id));
            if (poi) {
                this.requestDeletePoi(poi);
            }
        },

        getPoiMarkerStyle(category) {
            if (category === "cafe") {
                return {
                    radius: 7,
                    color: "#31B8FF",
                    fillColor: "#31B8FF",
                    fillOpacity: 0.9,
                    weight: 2
                };
            }

            if (category === "restaurant") {
                return {
                    radius: 7,
                    color: "#F4A62A",
                    fillColor: "#F4A62A",
                    fillOpacity: 0.9,
                    weight: 2
                };
            }

            return {
                radius: 7,
                color: "#111827",
                fillColor: "#111827",
                fillOpacity: 0.85,
                weight: 2
            };
        },

        getPoiCategoryLabel(category) {
            const labels = {
                attraction: "Достопримечательность",
                cafe: "Кафе",
                restaurant: "Ресторан"
            };

            return labels[category] || category;
        },

        startRouteCreation() {
            this.routeMode = true;
            this.poiMode = false;
            this.setTab("routes");
            this.showToast("Кликайте по карте, чтобы добавить точки маршрута.", "info");
        },

        addRoutePoint(lat, lng) {
            const marker = L.marker([lat, lng]).addTo(this.routeMap);

            this.routeMarkers.push(marker);
            this.routePoints.push({ lat, lng });

            if (this.routePoints.length > 1) {
                this.routeSegments.push("driving");
            }

            this.redrawRouteLine();
        },

        toggleRouteSegment(index) {
            this.routeSegments[index] =
                this.routeSegments[index] === "foot" ? "driving" : "foot";

            this.redrawRouteLine();
        },

        redrawRouteLine() {
            this.routeLines.forEach(line => this.routeMap.removeLayer(line));
            this.routeLines = [];

            this.routeDistance = 0;
            this.routeDuration = 0;

            if (this.routePoints.length < 2) {
                return;
            }

            for (let i = 0; i < this.routePoints.length - 1; i++) {
                const start = this.routePoints[i];
                const end = this.routePoints[i + 1];
                const type = this.routeSegments[i] || "driving";
                const color = type === "foot" ? "#22C55E" : "#31B8FF";

                const line = L.polyline(
                    [
                        [start.lat, start.lng],
                        [end.lat, end.lng]
                    ],
                    {
                        color,
                        weight: 5,
                        opacity: 0.9
                    }
                ).addTo(this.routeMap);

                this.routeLines.push(line);

                const distance = this.getApproxDistance(start.lat, start.lng, end.lat, end.lng);

                this.routeDistance += distance;
                this.routeDuration += type === "foot"
                    ? distance / 1.3
                    : distance / 9;
            }

            const group = L.featureGroup(this.routeLines);

            this.routeMap.fitBounds(group.getBounds(), {
                padding: [30, 30]
            });
        },

        confirmClearReadyRoute() {
            this.openConfirm(
                "Очистить маршрут?",
                "Все выбранные точки и участки будут удалены из текущей формы.",
                this.clearReadyRoute
            );
        },

        clearReadyRoute() {
            this.routeMarkers.forEach(marker => this.routeMap.removeLayer(marker));
            this.routeLines.forEach(line => this.routeMap.removeLayer(line));

            this.routeMarkers = [];
            this.routeLines = [];
            this.routePoints = [];
            this.routeSegments = [];
            this.routeDistance = 0;
            this.routeDuration = 0;
            this.routeMode = false;
        },

        async saveReadyRoute() {
            if (!this.routeForm.title) {
                this.showToast("Введите название маршрута.", "error");
                return;
            }

            if (this.routePoints.length < 2) {
                this.showToast("Маршрут должен содержать минимум две точки.", "error");
                return;
            }

            try {
                const response = await fetch("/admin/save_ready_route", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        title: this.routeForm.title,
                        description: this.routeForm.description,
                        cover_image: this.routeForm.cover_image,
                        points: this.routePoints,
                        segmentTypes: this.routeSegments,
                        distance: this.routeDistance / 1000,
                        duration: Math.round(this.routeDuration / 60),
                        transport: this.routeTransportLabel
                    })
                });

                const data = await response.json();

                if (!response.ok || data.status !== "ok") {
                    throw new Error(data.error || "Ошибка сохранения маршрута");
                }

                this.showToast("Готовый маршрут сохранён.", "success");

                this.routeForm = {
                    title: "",
                    description: "",
                    cover_image: ""
                };

                this.clearReadyRoute();
                await this.loadReadyRoutes();
                await this.loadStats();
            } catch (error) {
                this.showToast(error.message, "error");
            }
        },

        async loadReadyRoutes() {
            try {
                const response = await fetch("/get_ready_routes");
                const data = await response.json();

                this.readyRoutes = data || [];
            } catch (error) {
                this.showToast("Не удалось загрузить готовые маршруты.", "error");
            }
        },

        previewReadyRoute(route) {
            this.setTab("routes");
            this.clearReadyRoute();

            this.routeForm = {
                title: route.title || "",
                description: route.description || "",
                cover_image: route.cover_image || ""
            };

            this.routePoints = route.points || [];
            this.routeSegments = route.segmentTypes || [];

            this.routePoints.forEach(point => {
                const marker = L.marker([point.lat, point.lng]).addTo(this.routeMap);
                this.routeMarkers.push(marker);
            });

            this.redrawRouteLine();
        },

        requestDeleteReadyRoute(route) {
            this.openConfirm(
                "Удалить готовый маршрут?",
                "Маршрут исчезнет из списка готовых маршрутов. Это действие нельзя отменить.",
                () => this.deleteReadyRoute(route.id)
            );
        },

        async deleteReadyRoute(id) {
            try {
                const response = await fetch(`/admin/delete_ready_route/${id}`, {
                    method: "POST"
                });

                const data = await response.json();

                if (!response.ok || data.status !== "ok") {
                    throw new Error(data.error || "Ошибка удаления маршрута");
                }

                this.showToast("Готовый маршрут удалён.", "success");
                await this.loadReadyRoutes();
                await this.loadStats();
            } catch (error) {
                this.showToast(error.message, "error");
            }
        },

        initMaps() {
            this.routeMap = L.map("adminRouteMap").setView([43.1155, 131.8855], 12);
            this.poiMap = L.map("adminPoiMap").setView([43.1155, 131.8855], 12);

            const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

            L.tileLayer(tileUrl, {
                attribution: "OpenStreetMap"
            }).addTo(this.routeMap);

            L.tileLayer(tileUrl, {
                attribution: "OpenStreetMap"
            }).addTo(this.poiMap);

            this.routeMap.on("click", event => {
                if (!this.routeMode) {
                    this.showToast("Включите режим выбора точек маршрута.", "info");
                    return;
                }

                this.addRoutePoint(event.latlng.lat, event.latlng.lng);
            });

            this.poiMap.on("click", event => {
                if (!this.poiMode) {
                    this.showToast("Нажмите «Выбрать точку», затем кликните по карте.", "info");
                    return;
                }

                this.poiForm.lat = event.latlng.lat;
                this.poiForm.lng = event.latlng.lng;

                if (this.poiTempMarker) {
                    this.poiMap.removeLayer(this.poiTempMarker);
                }

                this.poiTempMarker = L.marker([this.poiForm.lat, this.poiForm.lng]).addTo(this.poiMap);

                this.showToast("Координаты выбраны.", "success");
            });
        },

        getApproxDistance(lat1, lng1, lat2, lng2) {
            const earthRadius = 6371000;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;

            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) *
                Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);

            return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        },

        getStaticImagePath(path) {
            if (!path || !path.trim()) {
                return "/static/img/routes/default.jpg";
            }

            if (path.startsWith("http") || path.startsWith("/static/")) {
                return path;
            }

            return `/static/${path.replace(/^\/+/, "")}`;
        },

        openConfirm(title, text, callback) {
            this.confirm = {
                visible: true,
                title,
                text,
                callback
            };
        },

        closeConfirm(result) {
            const callback = this.confirm.callback;

            this.confirm.visible = false;
            this.confirm.callback = null;

            if (result && typeof callback === "function") {
                callback();
            }
        },

        showToast(message, type = "info") {
            const id = Date.now() + Math.random();

            this.toasts.push({
                id,
                message,
                type
            });

            setTimeout(() => {
                this.toasts = this.toasts.filter(toast => toast.id !== id);
            }, 3500);
        },

        escapeHtml(value) {
            return String(value || "")
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");
        }
    }
}).mount("#adminApp");
const { createApp } = Vue;

createApp({
    data() {
        const initialData = window.PROFILE_INITIAL_DATA || {};

        return {
            username: initialData.username || "Пользователь",
            email: initialData.email || "",
            activeTab: "created",
            createdRoutes: this.normalizeRoutes(initialData.createdRoutes || []),
            favoriteRoutes: this.normalizeRoutes(initialData.favoriteRoutes || [])
        };
    },

    computed: {
        avatarLetter() {
            return this.username ? this.username.trim().charAt(0).toUpperCase() : "V";
        }
    },

    methods: {
        normalizeRoutes(routes) {
            if (!Array.isArray(routes)) {
                return [];
            }

            return routes.map(route => {
                if (Array.isArray(route)) {
                    return {
                        id: route[0],
                        name: route[1] || "Без названия",
                        points_count: route[2] || 0,
                        distance: route[3] || 0,
                        duration: route[4] || 0,
                        transport: route[5] || "Маршрут",
                        is_favorite: Boolean(route[6])
                    };
                }

                return {
                    id: route.id,
                    name: route.name || "Без названия",
                    points_count: route.points_count || route.pointsCount || route.points?.length || 0,
                    distance: route.distance || 0,
                    duration: route.duration || 0,
                    transport: route.transport || route.type || "Маршрут",
                    is_favorite: Boolean(route.is_favorite || route.favorite)
                };
            });
        },

        openRoute(route) {
            if (!route || !route.id) {
                window.location.href = "/map";
                return;
            }

            window.location.href = `/map?route_id=${route.id}`;
        },

        async toggleFavorite(route) {
            if (!route || !route.id) {
                return;
            }

            route.is_favorite = !route.is_favorite;

            if (route.is_favorite) {
                const exists = this.favoriteRoutes.some(item => String(item.id) === String(route.id));

                if (!exists) {
                    this.favoriteRoutes.unshift({ ...route });
                }
            } else {
                this.favoriteRoutes = this.favoriteRoutes.filter(item => String(item.id) !== String(route.id));
            }

            const createdRoute = this.createdRoutes.find(item => String(item.id) === String(route.id));

            if (createdRoute) {
                createdRoute.is_favorite = route.is_favorite;
            }

            try {
                await fetch(`/toggle_favorite/${route.id}`, {
                    method: "POST"
                });
            } catch (error) {
                console.warn("Не удалось синхронизировать избранное с сервером", error);
            }
        },

        async deleteRoute(route) {
            if (!route || !route.id) {
                return;
            }

            const confirmed = confirm(`Удалить маршрут «${route.name}»?`);

            if (!confirmed) {
                return;
            }

            this.createdRoutes = this.createdRoutes.filter(item => String(item.id) !== String(route.id));
            this.favoriteRoutes = this.favoriteRoutes.filter(item => String(item.id) !== String(route.id));

            try {
                await fetch(`/delete_route/${route.id}`, {
                    method: "POST"
                });
            } catch (error) {
                console.warn("Не удалось удалить маршрут на сервере", error);
            }
        }
    }
}).mount("#profileApp");
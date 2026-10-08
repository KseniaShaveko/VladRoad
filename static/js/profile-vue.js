(() => {
    const { createApp } = Vue;

    const rawData = window.PROFILE_DATA || {};

    function normalizeRoute(route) {
        if (Array.isArray(route)) {
            return {
                id: route[0],
                name: route[1] || 'Без названия',
                points_count: route[2] || 0,
                distance: route[3] || 0,
                duration: route[4] || 0,
                transport: route[5] || 'не указан',
                is_favorite: Boolean(route[6]),
                is_template: Boolean(route[7])
            };
        }

        return {
            id: route.id,
            name: route.name || route.title || 'Без названия',
            points_count: route.points_count ?? route.pointsCount ?? 0,
            distance: route.distance ?? 0,
            duration: route.duration ?? 0,
            transport: route.transport || 'не указан',
            is_favorite: Boolean(route.is_favorite ?? route.favorite),
            is_template: Boolean(route.is_template)
        };
    }

    createApp({
        delimiters: ['[[', ']]'],

        data() {
            const createdRoutes = (rawData.createdRoutes || []).map(normalizeRoute);
            const favoriteRoutes = (rawData.favoriteRoutes || []).map(normalizeRoute);

            return {
                activeTab: 'created',
                username: rawData.username || 'Пользователь',
                email: rawData.email || '',
                createdRoutes,
                favoriteRoutes
            };
        },

        computed: {
            avatarLetter() {
                return this.username
                    ? this.username.trim().charAt(0).toUpperCase()
                    : 'П';
            }
        },

        methods: {
            openRoute(routeId) {
                window.location.href = `/map?load=${routeId}`;
            },

            async deleteRoute(route) {
                const confirmed = window.confirm('Удалить маршрут?');

                if (!confirmed) {
                    return;
                }

                try {
                    const response = await fetch(`/delete_route/${route.id}`, {
                        method: 'POST'
                    });

                    if (!response.ok) {
                        throw new Error('Ошибка удаления маршрута');
                    }

                    this.createdRoutes = this.createdRoutes.filter(
                        item => item.id !== route.id
                    );

                    this.favoriteRoutes = this.favoriteRoutes.filter(
                        item => item.id !== route.id
                    );
                } catch (error) {
                    alert('Не удалось удалить маршрут. Попробуйте ещё раз.');
                }
            },

            async toggleFavorite(route) {
                try {
                    const response = await fetch(`/toggle_favorite/${route.id}`, {
                        method: 'POST'
                    });

                    if (!response.ok) {
                        throw new Error('Ошибка изменения избранного');
                    }

                    const result = await response.json().catch(() => ({}));
                    const isFavorite = Boolean(
                        result.favorite ?? result.is_favorite ?? !route.is_favorite
                    );

                    this.updateFavoriteState(route.id, isFavorite);
                } catch (error) {
                    alert('Не удалось изменить избранное. Попробуйте ещё раз.');
                }
            },

            updateFavoriteState(routeId, isFavorite) {
                this.createdRoutes = this.createdRoutes.map(route => {
                    if (route.id === routeId) {
                        return {
                            ...route,
                            is_favorite: isFavorite
                        };
                    }

                    return route;
                });

                const routeFromCreated = this.createdRoutes.find(
                    route => route.id === routeId
                );

                const routeFromFavorites = this.favoriteRoutes.find(
                    route => route.id === routeId
                );

                if (isFavorite) {
                    if (!routeFromFavorites) {
                        const source = routeFromCreated || routeFromFavorites;

                        if (source) {
                            this.favoriteRoutes.unshift({
                                ...source,
                                is_favorite: true
                            });
                        }
                    }

                    return;
                }

                this.favoriteRoutes = this.favoriteRoutes.filter(
                    route => route.id !== routeId
                );
            }
        }
    }).mount('#profile-app');
})();
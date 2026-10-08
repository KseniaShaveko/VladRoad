if (window.Vue && document.getElementById("readyRoutesApp")) {
    const { createApp } = Vue;

    createApp({
        delimiters: ["[[", "]]"],

        data() {
            return {
                routes: window.READY_ROUTES || [],
                isAdmin: window.IS_ADMIN || false,

                searchQuery: "",
                transportFilter: "all",
                durationFilter: "all",

                transportOptions: [
                    { value: "all", label: "Все" },
                    { value: "walk", label: "Пешком" },
                    { value: "auto", label: "Авто" },
                    { value: "mixed", label: "Смешанный" }
                ],

                durationOptions: [
                    { value: "all", label: "Любая" },
                    { value: "short", label: "До 1 часа" },
                    { value: "medium", label: "1–3 часа" },
                    { value: "long", label: "3+ часа" }
                ]
            };
        },

        computed: {
            filteredRoutes() {
                const query = this.searchQuery.toLowerCase();

                return this.routes.filter(route => {
                    const matchesSearch =
                        !query ||
                        route.title.toLowerCase().includes(query) ||
                        route.location.toLowerCase().includes(query) ||
                        route.transport.toLowerCase().includes(query);

                    const matchesTransport =
                        this.transportFilter === "all" ||
                        route.transportType === this.transportFilter;

                    const minutes = Number(route.durationMinutes) || 0;

                    const matchesDuration =
                        this.durationFilter === "all" ||
                        (this.durationFilter === "short" && minutes <= 60) ||
                        (this.durationFilter === "medium" && minutes > 60 && minutes <= 180) ||
                        (this.durationFilter === "long" && minutes > 180);

                    return matchesSearch && matchesTransport && matchesDuration;
                });
            },

            transportLabel() {
                const item = this.transportOptions.find(option => option.value === this.transportFilter);
                return item ? item.label : "Все";
            },

            durationLabel() {
                const item = this.durationOptions.find(option => option.value === this.durationFilter);
                return item ? item.label : "Любая";
            }
        },

        methods: {

            resetFilters() {
                this.searchQuery = "";
                this.transportFilter = "all";
                this.durationFilter = "all";
            },

            deleteReadyRoute(id) {
                window.deleteReadyRoute(id);
            }
        }
    }).mount("#readyRoutesApp");
}

async function deleteReadyRoute(id) {

    if (!confirm(
        "Удалить маршрут?"
    )) {
        return;
    }

    try {

        let response = await fetch(
            `/admin/delete_ready_route/${id}`,
            {
                method: "POST"
            }
        );

        if (!response.ok) {

            throw new Error();
        }

        location.reload();

    }

    catch {

        alert(
            "Не удалось удалить маршрут"
        );
    }
}

window.deleteReadyRoute = deleteReadyRoute;
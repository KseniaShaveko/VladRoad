document.addEventListener('DOMContentLoaded', () => {
    const routesSliderElement = document.querySelector('.home-routes-swiper');

    if (!routesSliderElement || typeof Swiper === 'undefined') {
        return;
    }

    const wrapper = routesSliderElement.querySelector('.swiper-wrapper');
    const emptyBlock = routesSliderElement.querySelector('.routes-empty');
    const routesUrl = routesSliderElement.dataset.readyRoutesUrl || '/get_ready_routes';
    const mapUrl = routesSliderElement.dataset.mapUrl || '/map';
    const staticBase = normalizeStaticBase(routesSliderElement.dataset.staticBase || '/static/');

    let routesSwiper = null;

    function normalizeStaticBase(base) {
        return base.endsWith('/') ? base : `${base}/`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeImagePath(path) {
        const raw = String(path || '').trim();

        if (!raw) {
            return `${staticBase}img/routes/default.jpg`;
        }

        if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/static/')) {
            return raw;
        }

        if (raw.startsWith('static/')) {
            return `/${raw}`;
        }

        return `${staticBase}${raw.replace(/^\/+/, '')}`;
    }

    function getRouteTitle(route) {
        return route.title || route.name || 'Готовый маршрут';
    }

    function getRouteDescription(route) {
        return route.location || route.description || 'Готовый маршрут';
    }

    function getRouteDuration(route) {
        if (route.durationText) {
            return route.durationText;
        }

        if (route.duration) {
            return `${route.duration} мин`;
        }

        if (route.durationMinutes) {
            return `${route.durationMinutes} мин`;
        }

        return 'Не указано';
    }

    function getRouteTransport(route) {
        return route.transport || route.transportText || 'Маршрут';
    }

    function getRouteHref(route) {
        if (route.id !== undefined && route.id !== null) {
            return `${mapUrl}?ready_route=${encodeURIComponent(route.id)}`;
        }

        return mapUrl;
    }

    function renderRoutes(routes) {
        const list = Array.isArray(routes) ? routes.filter(Boolean) : [];

        if (!wrapper) {
            return;
        }

        wrapper.innerHTML = '';

        if (list.length === 0) {
            if (emptyBlock) {
                emptyBlock.hidden = false;
            }
            routesSliderElement.classList.add('is-empty');
            return;
        }

        if (emptyBlock) {
            emptyBlock.hidden = true;
        }
        routesSliderElement.classList.remove('is-empty');

        list.forEach((route) => {
            const title = getRouteTitle(route);
            const image = normalizeImagePath(route.image || route.cover_image || route.coverImage);
            const location = getRouteDescription(route);
            const transport = getRouteTransport(route);
            const duration = getRouteDuration(route);
            const href = getRouteHref(route);

            const slide = document.createElement('div');
            slide.className = 'swiper-slide';
            slide.innerHTML = `
                <a href="${escapeHtml(href)}" class="ready-route-card">
                    <img class="ready-route-card__image" src="${escapeHtml(image)}" alt="${escapeHtml(title)}">
                    <div class="ready-route-card__body">
                        <p class="ready-route-card__place">${escapeHtml(location)}</p>
                        <h3 class="ready-route-card__title">${escapeHtml(title)}</h3>
                        <div class="ready-route-card__meta">
                            <span class="ready-route-card__badge">${escapeHtml(transport)}</span>
                            <span class="ready-route-card__badge">${escapeHtml(duration)}</span>
                        </div>
                    </div>
                </a>
            `;

            wrapper.appendChild(slide);
        });
    }

    function initSwiper() {
        if (routesSwiper) {
            routesSwiper.destroy(true, true);
        }

        const slides = wrapper ? wrapper.querySelectorAll('.swiper-slide') : [];
        if (slides.length === 0) {
            routesSliderElement.classList.add('has-one-slide');
            return;
        }

        const hasSeveralSlides = slides.length > 1;

        routesSliderElement.classList.toggle('has-one-slide', slides.length <= 1);

        routesSwiper = new Swiper(routesSliderElement, {
            loop: hasSeveralSlides,
            speed: 650,
            slidesPerView: 'auto',
            spaceBetween: 28,
            centeredSlides: false,
            watchSlidesProgress: true,
            observer: true,
            observeParents: true,
            resizeObserver: true,

            navigation: {
                nextEl: '.home-routes-button-next',
                prevEl: '.home-routes-button-prev'
            },

            autoplay: hasSeveralSlides ? {
                delay: 3600,
                disableOnInteraction: false
            } : false,

            breakpoints: {
                0: {
                    centeredSlides: true,
                    spaceBetween: 18
                },
                480: {
                    centeredSlides: true,
                    spaceBetween: 20
                },
                760: {
                    centeredSlides: false,
                    spaceBetween: 24
                },
                1280: {
                    centeredSlides: false,
                    spaceBetween: 28
                }
            }
        });

        window.addEventListener('resize', () => {
            setTimeout(() => {
                routesSwiper.update();
                if (hasSeveralSlides) {
                    routesSwiper.slideToLoop(routesSwiper.realIndex, 0);
                }
            }, 150);
        });
    }

    async function loadRoutes() {
        try {
            const response = await fetch(routesUrl, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Не удалось загрузить готовые маршруты');
            }

            const routes = await response.json();
            renderRoutes(routes);
            initSwiper();
        } catch (error) {
            console.error(error);
            renderRoutes([]);
        }
    }

    loadRoutes();
});

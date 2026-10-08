document.addEventListener('DOMContentLoaded', () => {
    const swiperEl = document.querySelector('.attractions-swiper');

    if (!swiperEl || typeof Swiper === 'undefined') {
        return;
    }

    const wrapper = swiperEl.querySelector('.swiper-wrapper');
    const emptyBlock = swiperEl.querySelector('.attractions-empty');
    const poisUrl = swiperEl.dataset.poisUrl || '/get_pois';
    const mapUrl = swiperEl.dataset.mapUrl || '/map';
    const staticBase = normalizeStaticBase(swiperEl.dataset.staticBase || '/static/');

    let attractionsSwiper = null;

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
            return '';
        }

        if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/static/')) {
            return raw;
        }

        if (raw.startsWith('static/')) {
            return `/${raw}`;
        }

        return `${staticBase}${raw.replace(/^\/+/, '')}`;
    }

    function getPoiImage(poi, index) {
        const directImage = poi.image || poi.image_url || poi.photo || poi.photo_url || poi.cover_image;
        const normalized = normalizeImagePath(directImage);

        if (normalized) {
            return normalized;
        }

        const category = String(poi.category || '').toLowerCase();
        const fallbackByCategory = {
            attraction: 'img/places/millionka.jpg',
            attractions: 'img/places/millionka.jpg',
            достопримечательность: 'img/places/millionka.jpg',
            достопримечательности: 'img/places/millionka.jpg',
            cafe: 'img/places/neptune.jpg',
            кафе: 'img/places/neptune.jpg',
            restaurant: 'img/places/admiral-fountain.jpg',
            рестораны: 'img/places/admiral-fountain.jpg',
            ресторан: 'img/places/admiral-fountain.jpg'
        };

        const rotatingFallbacks = [
            'img/places/millionka.jpg',
            'img/places/funicular.jpg',
            'img/places/neptune.jpg',
            'img/places/oceanarium.jpg',
            'img/places/admiral-fountain.jpg',
            'img/places/carousel-park.jpg',
            'img/places/church.jpg'
        ];

        return normalizeImagePath(fallbackByCategory[category] || rotatingFallbacks[index % rotatingFallbacks.length]);
    }

    function getPoiName(poi) {
        return poi.name || poi.title || 'Достопримечательность';
    }

    function getPoiHref(poi) {
        const params = new URLSearchParams();

        if (poi.lat !== undefined && poi.lng !== undefined) {
            params.set('poi_lat', poi.lat);
            params.set('poi_lng', poi.lng);
        }

        if (poi.name) {
            params.set('poi_name', poi.name);
        }

        const query = params.toString();
        return query ? `${mapUrl}?${query}` : mapUrl;
    }
    
    function renderAttractions(pois) {
        const list = Array.isArray(pois) ? pois.filter(Boolean) : [];

        if (!wrapper) {
            return;
        }

        wrapper.innerHTML = '';

        if (list.length === 0) {
            if (emptyBlock) {
                emptyBlock.hidden = false;
            }
            swiperEl.classList.add('is-empty');
            return;
        }

        if (emptyBlock) {
            emptyBlock.hidden = true;
        }
        swiperEl.classList.remove('is-empty');

        list.forEach((poi, index) => {
            const name = getPoiName(poi);
            const image = getPoiImage(poi, index);
            const href = getPoiHref(poi);

            const slide = document.createElement('a');
            slide.href = href;
            slide.className = 'swiper-slide attraction-slide';
            slide.innerHTML = `
                <img src="${escapeHtml(image)}" alt="${escapeHtml(name)}">
                <div class="attraction-overlay">
                    <h3>${escapeHtml(name)}</h3>
                </div>
            `;

            wrapper.appendChild(slide);
        });
    }

    function initSwiper() {
        if (attractionsSwiper) {
            attractionsSwiper.destroy(true, true);
        }

        const slides = wrapper ? wrapper.querySelectorAll('.swiper-slide') : [];
        if (slides.length === 0) {
            swiperEl.classList.add('has-one-slide');
            return;
        }

        const hasSeveralSlides = slides.length > 1;

        swiperEl.classList.toggle('has-one-slide', slides.length <= 1);

        attractionsSwiper = new Swiper(swiperEl, {
            loop: hasSeveralSlides,
            centeredSlides: true,
            slidesPerView: 'auto',
            spaceBetween: -90,
            speed: 1200,
            allowTouchMove: true,

            autoplay: hasSeveralSlides ? {
                delay: 3500,
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
            } : false,

            navigation: {
                nextEl: '.attractions-button-next',
                prevEl: '.attractions-button-prev',
            },

            breakpoints: {
                320: {
                    spaceBetween: -40,
                },
                700: {
                    spaceBetween: -60,
                },
                1100: {
                    spaceBetween: -90,
                }
            }
        });

        let autoplayTimeout;

        function restartAutoplay() {
            if (!attractionsSwiper.autoplay || !hasSeveralSlides) {
                return;
            }

            attractionsSwiper.autoplay.stop();
            clearTimeout(autoplayTimeout);
            autoplayTimeout = setTimeout(() => {
                attractionsSwiper.autoplay.start();
            }, 30000);
        }

        const nextButton = swiperEl.querySelector('.attractions-button-next');
        const prevButton = swiperEl.querySelector('.attractions-button-prev');

        if (nextButton) {
            nextButton.addEventListener('click', restartAutoplay);
        }

        if (prevButton) {
            prevButton.addEventListener('click', restartAutoplay);
        }
    }

    async function loadAttractions() {
        try {
            const response = await fetch(poisUrl, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Не удалось загрузить достопримечательности');
            }

            const pois = await response.json();
            renderAttractions(pois);
            initSwiper();
        } catch (error) {
            console.error(error);
            renderAttractions([]);
        }
    }

    loadAttractions();
});

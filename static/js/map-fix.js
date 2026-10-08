// Простая задержка инициализации карты
document.addEventListener('DOMContentLoaded', function() {
    // Проверяем, существует ли карта, если нет - ждём
    if (!document.getElementById('map')) return;
    
    // Небольшая задержка для гарантии
    setTimeout(function() {
        if (typeof map !== 'undefined' && map) {
            map.invalidateSize();
        }
    }, 100);
});
// Global variables
let map;
let measuring = false;
let measureMarkers = [];
let totalDistance = 0;
let lawLayer, localTrailsLayer;
let baseLayers = {};
let overlayLayers = {};
let activeBaseLayer = 'osm';
let searchHistory = [];
let favorites = [];
let routeInfoLayer; // Voor interactieve route info

// Initialize map
function initMap() {
    // Create map centered on Netherlands
    map = L.map('map').setView([52.1326, 5.2913], 7);

    // Base layers met lagere z-index
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        zIndex: 1
    });

    const topoLayer = L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png', {
        attribution: '© PDOK',
        zIndex: 1
    });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        zIndex: 1
    });

    const terrainLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        zIndex: 1
    });

    // Add default OSM layer
    osmLayer.addTo(map);

    // Base layers object
    baseLayers = {
        'osm': osmLayer,
        'topo': topoLayer,
        'satellite': satelliteLayer,
        'terrain': terrainLayer
    };

    // LAW layers from PDOK WMS met hogere z-index
    lawLayer = L.layerGroup();
    addLAWLayers();
    lawLayer.addTo(map);

    // Route info layer voor interactieve features
    routeInfoLayer = L.layerGroup();
    routeInfoLayer.addTo(map);

    // Local trails layer
    localTrailsLayer = L.layerGroup();
    addLocalTrails();

    // Overlay layers object
    overlayLayers = {
        'law': lawLayer,
        'local': localTrailsLayer,
        'routeInfo': routeInfoLayer
    };

    // Setup event listeners
    setupEventListeners();
    setupTabNavigation();
    loadStoredData();
}

// Add LAW layers from PDOK
function addLAWLayers() {
    const lawLayerNames = [
        'landelijke-wandelroutes',
        'streekpaden',
        'ns-wandelingen',
        'ov-stappers',
        'stad-te-voet'
    ];
    
    lawLayerNames.forEach(layerName => {
        const wmsLayer = L.tileLayer.wms('https://service.pdok.nl/wandelnet/landelijke-wandelroutes/wms/v1_0', {
            layers: layerName,
            format: 'image/png',
            transparent: true,
            attribution: '© PDOK Wandelnet',
            opacity: 0.8,
            zIndex: 10 // Hogere z-index dan basiskaarten
        });
        lawLayer.addLayer(wmsLayer);
    });
}

// Add local trails
function addLocalTrails() {
    const localRoutes = [
        {
            name: 'Boslus Veluwe',
            coordinates: [[52.0880, 5.6673], [52.1015, 5.7234], [52.0854, 5.7891]],
            description: 'Mooie bosroute door de Veluwe'
        },
        {
            name: 'Duinpad Zandvoort',
            coordinates: [[52.3676, 4.5309], [52.3584, 4.5198], [52.3421, 4.5067]],
            description: 'Wandeling door de duinen van Zandvoort'
        },
        {
            name: 'Kinderdijk Molens Route',
            coordinates: [[51.8838, 4.6395], [51.8776, 4.6298], [51.8834, 4.6234]],
            description: 'Route langs de beroemde molens van Kinderdijk'
        }
    ];

    localRoutes.forEach(route => {
        const polyline = L.polyline(route.coordinates, {
            color: '#ea580c',
            weight: 3,
            opacity: 0.8
        });

        polyline.bindPopup(`
            <div>
                <h4 style="margin-bottom: 8px;">${route.name}</h4>
                <p style="margin: 0; color: #64748b;">${route.description}</p>
            </div>
        `);

        localTrailsLayer.addLayer(polyline);
    });
}

// Setup tab navigation
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // Update active button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update active panel
            tabPanels.forEach(panel => panel.classList.remove('active'));
            document.getElementById(targetTab + '-panel').classList.add('active');
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    setupLayerCards();

    // Search functionality
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchLocation();
        }
    });

    // Map click event for measuring AND route info
    map.on('click', function(e) {
        if (measuring) {
            addMeasurePoint(e.latlng);
        } else {
            // Check if LAW layer is active and get route info
            if (map.hasLayer(lawLayer)) {
                getRouteInfoAtPoint(e.latlng, e.containerPoint);
            }
        }
    });
}

// Setup layer cards
function setupLayerCards() {
    // Base layer cards
    document.querySelectorAll('[data-layer]').forEach(card => {
        card.addEventListener('click', () => {
            const layerType = card.dataset.layer;
            switchBaseLayer(layerType);
            
            // Update UI
            document.querySelectorAll('[data-layer]').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        });
    });

    // Overlay layer cards
    document.querySelectorAll('[data-overlay]').forEach(card => {
        card.addEventListener('click', () => {
            const overlayType = card.dataset.overlay;
            toggleOverlay(overlayType);
            card.classList.toggle('active');
        });
    });
}

// Switch base layer
function switchBaseLayer(layerType) {
    // Remove current base layer
    if (baseLayers[activeBaseLayer]) {
        map.removeLayer(baseLayers[activeBaseLayer]);
    }
    
    // Add new base layer
    if (baseLayers[layerType]) {
        baseLayers[layerType].addTo(map);
        activeBaseLayer = layerType;
    }
}

// Toggle overlay
function toggleOverlay(overlayType) {
    const layer = overlayLayers[overlayType];
    if (map.hasLayer(layer)) {
        map.removeLayer(layer);
    } else {
        layer.addTo(map);
    }
}

// Measuring functions
function toggleMeasure() {
    measuring = !measuring;
    const btn = document.getElementById('measureBtn');
    
    if (measuring) {
        btn.innerHTML = '<i class="fas fa-stop"></i> Stop meting';
        btn.classList.add('active');
        map.getContainer().style.cursor = 'crosshair';
    } else {
        btn.innerHTML = '<i class="fas fa-ruler-combined"></i> Start meting';
        btn.classList.remove('active');
        map.getContainer().style.cursor = '';
    }
}

function addMeasurePoint(latlng) {
    const marker = L.circleMarker(latlng, {
        radius: 6,
        color: '#7c3aed',
        fillColor: '#7c3aed',
        fillOpacity: 0.8,
        weight: 2
    }).addTo(map);

    measureMarkers.push(marker);

    if (measureMarkers.length > 1) {
        // Find previous marker (not a line)
        let prevMarker = null;
        for (let i = measureMarkers.length - 2; i >= 0; i--) {
            if (measureMarkers[i].getLatLng) {
                prevMarker = measureMarkers[i];
                break;
            }
        }

        if (prevMarker) {
            const line = L.polyline([prevMarker.getLatLng(), latlng], {
                color: '#7c3aed',
                weight: 3,
                dashArray: '8, 12'
            }).addTo(map);

            measureMarkers.push(line);

            // Calculate distance
            const distance = prevMarker.getLatLng().distanceTo(latlng) / 1000; // in km
            totalDistance += distance;
            updateDistanceDisplay();
        }
    }
}

function updateDistanceDisplay() {
    const displayEl = document.getElementById('distanceDisplay');
    displayEl.querySelector('.distance-value').textContent = totalDistance.toFixed(2);
}

function clearMeasurements() {
    measureMarkers.forEach(item => {
        map.removeLayer(item);
    });
    measureMarkers = [];
    totalDistance = 0;
    updateDistanceDisplay();
}

// LAW filter functions - enhanced
function applyLAWFilters() {
    const selectedLayer = document.getElementById('lawLayerFilter').value;
    
    // Remove current LAW layer
    map.removeLayer(lawLayer);
    lawLayer.clearLayers();
    
    if (selectedLayer) {
        // Add only selected layer
        const wmsLayer = L.tileLayer.wms('https://service.pdok.nl/wandelnet/landelijke-wandelroutes/wms/v1_0', {
            layers: selectedLayer,
            format: 'image/png',
            transparent: true,
            attribution: '© PDOK Wandelnet',
            opacity: 0.8,
            zIndex: 10
        });
        lawLayer.addLayer(wmsLayer);
    } else {
        // Add all layers
        addLAWLayers();
    }
    
    lawLayer.addTo(map);
}

// Advanced filtering with WFS
function applyAdvancedFilters() {
    const layerType = document.getElementById('lawLayerFilter').value;
    const routeName = document.getElementById('routeNameFilter').value;
    const province = document.getElementById('provinceFilter').value;
    
    // Build CQL filter
    let cqlFilter = '';
    const filters = [];
    
    if (routeName) {
        filters.push(`routenaam ILIKE '%${routeName}%'`);
    }
    
    if (province) {
        filters.push(`provincie = '${province}'`);
    }
    
    cqlFilter = filters.join(' AND ');
    
    // Remove current LAW layer
    map.removeLayer(lawLayer);
    lawLayer.clearLayers();
    
    const targetLayer = layerType || 'landelijke-wandelroutes';
    
    // Add filtered layer
    const wmsLayer = L.tileLayer.wms('https://service.pdok.nl/wandelnet/landelijke-wandelroutes/wms/v1_0', {
        layers: targetLayer,
        format: 'image/png',
        transparent: true,
        attribution: '© PDOK Wandelnet',
        opacity: 0.8,
        zIndex: 10,
        cql_filter: cqlFilter || undefined
    });
    
    lawLayer.addLayer(wmsLayer);
    lawLayer.addTo(map);
    
    console.log('Filter toegepast:', { layerType, routeName, province, cqlFilter });
}

// Get route info at clicked point using GetFeatureInfo
function getRouteInfoAtPoint(latlng, point) {
    const bounds = map.getBounds();
    const size = map.getSize();
    
    // Build GetFeatureInfo request
    const params = {
        request: 'GetFeatureInfo',
        service: 'WMS',
        srs: 'EPSG:4326',
        version: '1.1.0',
        format: 'image/png',
        bbox: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`,
        height: size.y,
        width: size.x,
        layers: getCurrentLAWLayers(),
        query_layers: getCurrentLAWLayers(),
        info_format: 'application/json',
        x: Math.round(point.x),
        y: Math.round(point.y)
    };
    
    const url = 'https://service.pdok.nl/wandelnet/landelijke-wandelroutes/wms/v1_0?' + 
                Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                showRouteInfoPopup(data.features[0], latlng);
            }
        })
        .catch(error => {
            console.log('Geen route info beschikbaar op deze locatie');
        });
}

// Get currently active LAW layers
function getCurrentLAWLayers() {
    const selectedLayer = document.getElementById('lawLayerFilter').value;
    if (selectedLayer) {
        return selectedLayer;
    }
    return 'landelijke-wandelroutes,streekpaden,ns-wandelingen,ov-stappers,stad-te-voet';
}

// Show route info popup
function showRouteInfoPopup(feature, latlng) {
    const props = feature.properties;
    
    const popupContent = `
        <div class="route-popup">
            <h4>${props.routenaam || props.naam || 'LAW Route'}</h4>
            <div class="popup-details">
                ${props.routetype ? `<p><strong>Type:</strong> ${props.routetype}</p>` : ''}
                ${props.provincie ? `<p><strong>Provincie:</strong> ${props.provincie}</p>` : ''}
                ${props.lengte_m ? `<p><strong>Lengte:</strong> ${(props.lengte_m / 1000).toFixed(1)} km</p>` : ''}
                ${props.fuid ? `<p><strong>Route ID:</strong> ${props.fuid}</p>` : ''}
                ${props.samenvatting ? `<p><strong>Beschrijving:</strong> ${props.samenvatting}</p>` : ''}
            </div>
        </div>
    `;
    
    L.popup()
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(map);
}

// Query route information in current view (simplified)
function queryRouteInfo() {
    const container = document.getElementById('routeDetailsContainer');
    
    // Show instruction instead of trying WFS
    container.innerHTML = `
        <div class="info-instruction">
            <div class="instruction-icon">
                <i class="fas fa-mouse-pointer"></i>
            </div>
            <h4>Route informatie ophalen</h4>
            <p>Klik op een route lijn op de kaart om gedetailleerde informatie te zien over die specifieke route.</p>
            <div class="instruction-steps">
                <div class="step">
                    <i class="fas fa-search"></i>
                    <span>Zoom in op interessant gebied</span>
                </div>
                <div class="step">
                    <i class="fas fa-hand-pointer"></i>
                    <span>Klik op een route lijn</span>
                </div>
                <div class="step">
                    <i class="fas fa-info-circle"></i>
                    <span>Bekijk route details in popup</span>
                </div>
            </div>
        </div>
    `;
}

// Simplified filtering - remove WFS attempts
function applyAdvancedFilters() {
    const layerType = document.getElementById('lawLayerFilter').value;
    const routeName = document.getElementById('routeNameFilter').value;
    const province = document.getElementById('provinceFilter').value;
    
    // For demonstration, we'll just apply the layer filter and show a message
    applyLAWFilters();
    
    if (routeName || province) {
        alert(`Filter ingesteld voor:\n${routeName ? `Route: ${routeName}\n` : ''}${province ? `Provincie: ${province}` : ''}\n\nLet op: Voor specifieke route informatie, klik op de route lijnen op de kaart.`);
    }
}

// Remove the complex WFS functions and replace with simpler versions
function displayRouteInfo(message) {
    const container = document.getElementById('routeDetailsContainer');
    container.innerHTML = `<div class="empty-state">${message}</div>`;
}

function addInteractiveRoutes() {
    // Routes are already interactive through WMS GetFeatureInfo
    // No additional overlay needed
}

function zoomToRoute(routeId) {
    console.log('Route zoom niet beschikbaar zonder WFS');
}

function highlightRoute(routeId) {
    console.log('Route highlight niet beschikbaar zonder WFS');
}

function clearLAWFilters() {
    document.getElementById('lawLayerFilter').value = '';
    document.getElementById('routeNameFilter').value = '';
    document.getElementById('provinceFilter').value = '';
    applyLAWFilters(); // This will add all layers again
}

// Search functions
function searchLocation() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    const spinner = document.getElementById('searchSpinner');
    spinner.style.display = 'block';

    // Add to search history
    if (!searchHistory.includes(query)) {
        searchHistory.unshift(query);
        searchHistory = searchHistory.slice(0, 5); // Keep last 5
        updateSearchHistory();
        saveStoredData();
    }

    // Use Nominatim API for geocoding
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=nl&limit=3`)
        .then(response => response.json())
        .then(data => {
            spinner.style.display = 'none';
            
            if (data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                
                map.setView([lat, lon], 12);
                
                // Add marker
                const marker = L.marker([lat, lon], {
                    icon: L.divIcon({
                        className: 'search-marker',
                        html: '<div style="background: #ff7b54; color: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="fas fa-search" style="font-size: 14px;"></i></div>',
                        iconSize: [32, 32]
                    })
                }).addTo(map);

                marker.bindPopup(`
                    <div>
                        <h4>Zoekresultaat</h4>
                        <p>${result.display_name}</p>
                        <button onclick="addCurrentViewToFavorites('${result.display_name}')" style="background: var(--primary-green); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-top: 8px;">
                            <i class="fas fa-star"></i> Opslaan als favoriet
                        </button>
                    </div>
                `).openPopup();
                
                // Remove marker after 10 seconds
                setTimeout(() => {
                    map.removeLayer(marker);
                }, 10000);
            } else {
                alert('Locatie niet gevonden');
            }
        })
        .catch(error => {
            spinner.style.display = 'none';
            console.error('Zoekfout:', error);
            alert('Er is een fout opgetreden bij het zoeken');
        });
}

function updateSearchHistory() {
    const container = document.getElementById('searchHistory');
    if (searchHistory.length === 0) {
        container.innerHTML = '<div class="empty-state">Nog geen zoekopdrachten</div>';
        return;
    }

    container.innerHTML = searchHistory.map(query => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-subtle); cursor: pointer;" onclick="searchAgain('${query}')">
            <span style="font-size: 14px;">${query}</span>
            <i class="fas fa-redo" style="color: var(--text-muted); font-size: 12px;"></i>
        </div>
    `).join('');
}

function searchAgain(query) {
    document.getElementById('searchInput').value = query;
    searchLocation();
}

// Favorites functions
function addCurrentViewToFavorites(name = null) {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const favName = name || `Locatie ${favorites.length + 1}`;
    
    const favorite = {
        id: Date.now(),
        name: favName,
        lat: center.lat,
        lng: center.lng,
        zoom: zoom,
        created: new Date().toLocaleString('nl-NL')
    };

    favorites.push(favorite);
    updateFavoritesList();
    saveStoredData();
}

function updateFavoritesList() {
    const container = document.getElementById('favoritesList');
    if (favorites.length === 0) {
        container.innerHTML = '<div class="empty-state">Nog geen favorieten</div>';
        return;
    }

    container.innerHTML = favorites.map(fav => `
        <div style="padding: 12px; background: var(--surface-elevated); border-radius: 8px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="font-size: 14px;">${fav.name}</strong>
                <button onclick="removeFavorite(${fav.id})" style="background: none; border: none; color: var(--text-muted); cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">${fav.created}</div>
            <button onclick="goToFavorite(${fav.id})" style="background: var(--primary-green); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                <i class="fas fa-map-marker-alt"></i> Ga naar locatie
            </button>
        </div>
    `).join('');
}

function goToFavorite(id) {
    const favorite = favorites.find(fav => fav.id === id);
    if (favorite) {
        map.setView([favorite.lat, favorite.lng], favorite.zoom);
    }
}

function removeFavorite(id) {
    const index = favorites.findIndex(fav => fav.id === id);
    if (index !== -1) {
        favorites.splice(index, 1);
        updateFavoritesList();
        saveStoredData();
    }
}

// Data persistence
function saveStoredData() {
    const data = {
        searchHistory,
        favorites
    };
    localStorage.setItem('hikingWebGIS', JSON.stringify(data));
}

function loadStoredData() {
    try {
        const stored = localStorage.getItem('hikingWebGIS');
        if (stored) {
            const data = JSON.parse(stored);
            
            if (data.searchHistory) {
                searchHistory = data.searchHistory;
                updateSearchHistory();
            }
            
            if (data.favorites) {
                favorites = data.favorites;
                updateFavoritesList();
            }
        }
    } catch (error) {
        console.error('Fout bij laden opgeslagen data:', error);
    }
}

// Navigation functions
function zoomToNetherlands() {
    map.setView([52.1326, 5.2913], 7);
}

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            map.setView([lat, lon], 14);
            
            const marker = L.marker([lat, lon], {
                icon: L.divIcon({
                    className: 'location-marker',
                    html: '<div style="background: #10b981; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.3), 0 2px 4px rgba(0,0,0,0.2);"><div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div></div>',
                    iconSize: [20, 20]
                })
            }).addTo(map);

            marker.bindPopup('Uw huidige locatie').openPopup();
            
            // Remove marker after 15 seconds
            setTimeout(() => {
                map.removeLayer(marker);
            }, 15000);
        }, function(error) {
            alert('Locatie kon niet worden bepaald');
        });
    } else {
        alert('Geolocation wordt niet ondersteund door deze browser');
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initMap();
});

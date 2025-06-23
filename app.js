// Global variables
let map;
let measuring = false;
let measureMarkers = [];
let totalDistance = 0;
let baseLayers = {};
let activeBaseLayer = 'osm';
let searchHistory = [];
let favorites = [];
let activeRoutes = [];
let highlightLayer;

// Camping variables
let campingLayer;
let campingsData = null;
let campingVisible = false;
let loadingOverlay = null;

// Route measuring functionality
let isRouteMeasuring = false;
let routeMeasurePoints = [];
let routeMeasureMarkers = [];
let routeMeasureLines = [];
let routeMeasureDistance = 0;

// Route definitions
const routeDefinitions = {
    law: [
        { value: 'LAW 10', name: 'LAW 10 - Marskramerpad', filter: 'Marskramerpad' },
        { value: 'LAW 5', name: 'LAW 5 - Trekvogelpad', filter: 'Trekvogelpad' },
        { value: 'LAW 4', name: 'LAW 4 - Zuiderzeepad', filter: 'Zuiderzeepad' },
        { value: 'LAW 3', name: 'LAW 3 - Pelgrimspad deel 1', filter: 'Pelgrimspad' }
    ]
};

// Custom WMS Layer class
L.TileLayer.PDOKFilter = L.TileLayer.WMS.extend({
    initialize: function (url, options) {
        L.TileLayer.WMS.prototype.initialize.call(this, url, options);
    },
    
    getTileUrl: function (coords) {
        var tileBounds = this._tileCoordsToBounds(coords);
        var nw = this._crs.project(tileBounds.getNorthWest());
        var se = this._crs.project(tileBounds.getSouthEast());
        
        var bbox = [nw.x, se.y, se.x, nw.y].join(',');
        
        var url = this._url + '?';
        var params = {
            'REQUEST': 'GetMap',
            'SERVICE': 'WMS',
            'VERSION': '1.3.0',
            'FORMAT': 'image/png',
            'STYLES': '',
            'TRANSPARENT': 'true',
            'LAYERS': this.options.layers,
            'CRS': 'EPSG:3857',
            'WIDTH': this.options.tileSize || 256,
            'HEIGHT': this.options.tileSize || 256,
            'BBOX': bbox
        };
        
        if (this.options.xmlFilter) {
            params['FILTER'] = this.options.xmlFilter;
        }
        
        var queryString = Object.keys(params).map(key => 
            encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
        ).join('&');
        
        return url + queryString;
    }
});

L.tileLayer.pdokFilter = function (url, options) {
    return new L.TileLayer.PDOKFilter(url, options);
};

// Camping icon
const campingIcon = L.icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="12" r="12" fill="#f59e0b"/>
            <path d="M7 4L12 14L17 4H15L12 10L9 4H7Z" fill="white"/>
            <rect x="6" y="18" width="12" height="2" fill="white"/>
        </svg>
    `),
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24]
});

// Initialize map
function initMap() {
    map = L.map('map').setView([52.1326, 5.2913], 7);

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

    osmLayer.addTo(map);

    baseLayers = {
        'osm': osmLayer,
        'topo': topoLayer,
        'satellite': satelliteLayer,
        'terrain': terrainLayer
    };

    highlightLayer = L.layerGroup();
    highlightLayer.addTo(map);

    setupEventListeners();
    setupTabNavigation();
    initCampingLayer();
    loadStoredData();
}

// Initialize camping layer
function initCampingLayer() {
    campingLayer = L.layerGroup();
}

// Setup tab navigation
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            tabPanels.forEach(panel => panel.classList.remove('active'));
            document.getElementById(targetTab + '-panel').classList.add('active');
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    setupLayerCards();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchLocation();
            }
        });
    }

    map.on('click', function(e) {
        if (measuring) {
            addMeasurePoint(e.latlng);
        } else if (isRouteMeasuring) {
            addRouteMeasurePoint(e.latlng);
        } else {
            if (activeRoutes.length > 0) {
                let foundRoute = false;
                
                activeRoutes.forEach(route => {
                    const bounds = map.getBounds();
                    const size = map.getSize();
                    
                    const params = {
                        request: 'GetFeatureInfo',
                        service: 'WMS',
                        srs: 'EPSG:4326',
                        version: '1.1.0',
                        format: 'image/png',
                        bbox: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`,
                        height: size.y,
                        width: size.x,
                        layers: route.layerName,
                        query_layers: route.layerName,
                        info_format: 'application/json',
                        x: Math.round(e.containerPoint.x),
                        y: Math.round(e.containerPoint.y)
                    };
                    
                    const url = 'https://service.pdok.nl/wandelnet/landelijke-wandelroutes/wms/v1_0?' + 
                                Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
                    
                    fetch(url)
                        .then(response => response.json())
                        .then(data => {
                            if (data.features && data.features.length > 0) {
                                const filteredFeatures = data.features.filter(feature => 
                                    feature.properties.lawnaam === route.filter
                                );
                                
                                if (filteredFeatures.length > 0) {
                                    foundRoute = true;
                                    showRouteInfoInPanel(filteredFeatures[0], e.latlng);
                                    highlightEtappe(filteredFeatures[0], route);
                                }
                            }
                        })
                        .catch(error => {
                            console.log('Geen route info beschikbaar voor', route.name);
                        });
                });
                
                setTimeout(() => {
                    if (!foundRoute) {
                        clearEtappeHighlight();
                    }
                }, 100);
            }
        }
    });
}

// Setup layer cards
function setupLayerCards() {
    document.querySelectorAll('[data-layer]').forEach(card => {
        card.addEventListener('click', () => {
            const layerType = card.dataset.layer;
            switchBaseLayer(layerType);
            
            document.querySelectorAll('[data-layer]').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        });
    });
}

// Switch base layer
function switchBaseLayer(layerType) {
    if (baseLayers[activeBaseLayer]) {
        map.removeLayer(baseLayers[activeBaseLayer]);
    }
    
    if (baseLayers[layerType]) {
        baseLayers[layerType].addTo(map);
        activeBaseLayer = layerType;
    }
}

// ============ SIMPLIFIED CAMPING FUNCTIONALITY ============

// Toggle camping layer visibility (simplified - just on/off)
function toggleCampingLayer() {
    campingVisible = !campingVisible;
    const card = document.getElementById('camping-layer-card');
    
    if (campingVisible) {
        // Auto-load campings if not loaded yet
        if (campingLayer.getLayers().length === 0) {
            loadAndShowCampings();
        } else {
            campingLayer.addTo(map);
            card.classList.add('active');
            showNotification('Campings zichtbaar', 'success');
        }
    } else {
        map.removeLayer(campingLayer);
        card.classList.remove('active');
        showNotification('Campings verborgen', 'info');
    }
}

// Load and show campings (simplified - no complex UI updates)
function loadAndShowCampings() {
    showLoadingOverlay('Campings laden...');
    
    loadLocalGeoJSON()
        .then(success => {
            if (!success) {
                return loadFromOSMAPI();
            }
            return true;
        })
        .then(() => {
            hideLoadingOverlay();
            
            // Show campings
            campingLayer.addTo(map);
            campingVisible = true;
            
            const card = document.getElementById('camping-layer-card');
            if (card) {
                card.classList.add('active');
            }
        })
        .catch(error => {
            console.error('Error loading campings:', error);
            hideLoadingOverlay();
            showNotification('Fout bij laden campings', 'error');
        });
}

// Load local GeoJSON file
async function loadLocalGeoJSON() {
    try {
        const response = await fetch('./data/campings.geojson');
        
        if (!response.ok) {
            console.log('Local GeoJSON not found, will try OSM API');
            return false;
        }
        
        const geojsonData = await response.json();
        
        campingLayer.clearLayers();
        
        geojsonData.features.forEach(feature => {
            const coords = feature.geometry.coordinates;
            const props = feature.properties;
            
            const popupContent = `
                <div class="camping-popup">
                    <h4><i class="fas fa-campground"></i> ${props.name || 'Camping'}</h4>
                    ${props.operator ? `<p><strong>Beheerder:</strong> ${props.operator}</p>` : ''}
                    ${props.access ? `<p><strong>Toegang:</strong> ${props.access}</p>` : ''}
                    <p style="font-size: 10px; color: #666;">OSM ID: ${props.osm_id}</p>
                </div>
            `;
            
            const marker = L.marker([coords[1], coords[0]], {
                icon: campingIcon,
                zIndex: 1000
            }).bindPopup(popupContent);
            
            campingLayer.addLayer(marker);
        });
        
        console.log(`Loaded ${geojsonData.features.length} campings from local GeoJSON`);
        showNotification(`${geojsonData.features.length} campings geladen uit lokaal bestand`, 'success');
        updateCampingCount();
        
        return true;
        
    } catch (error) {
        console.log('Failed to load local GeoJSON:', error);
        return false;
    }
}

// Load from OSM API as fallback
async function loadFromOSMAPI() {
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    
    const overpassQuery = `
        [out:json][timeout:30];
        (
            node["tourism"="camp_site"](${bbox});
            node["tourism"="caravan_site"](${bbox});
            way["tourism"="camp_site"](${bbox});
            way["tourism"="caravan_site"](${bbox});
        );
        out center;
    `;

    try {
        updateLoadingOverlay('OSM campings ophalen...');
        
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: overpassQuery,
            headers: { 'Content-Type': 'text/plain' },
            signal: AbortSignal.timeout(25000)
        });
        
        if (!response.ok) {
            throw new Error('OSM API request failed');
        }
        
        const data = await response.json();
        
        campingLayer.clearLayers();
        
        data.elements.forEach(element => {
            let lat, lon;
            
            if (element.type === 'node' && element.lat && element.lon) {
                lat = element.lat;
                lon = element.lon;
            } else if ((element.type === 'way' || element.type === 'relation') && element.center) {
                lat = element.center.lat;
                lon = element.center.lon;
            } else {
                return;
            }
            
            if (!element.tags) return;
            
            const name = element.tags.name || element.tags['name:nl'] || 'Camping';
            const type = element.tags.tourism || 'camp_site';
            
            const popupContent = `
                <div class="camping-popup">
                    <h4><i class="fas fa-campground"></i> ${name}</h4>
                    <p><strong>Type:</strong> ${type === 'camp_site' ? 'Camping' : 'Camperplaats'}</p>
                    ${element.tags.website ? `<p><a href="${element.tags.website}" target="_blank">Website</a></p>` : ''}
                    ${element.tags.phone ? `<p><a href="tel:${element.tags.phone}">📞 ${element.tags.phone}</a></p>` : ''}
                    <p style="font-size: 10px; color: #666;">Bron: OpenStreetMap</p>
                </div>
            `;
            
            const marker = L.marker([lat, lon], {
                icon: campingIcon,
                zIndex: 1000
            }).bindPopup(popupContent);
            
            campingLayer.addLayer(marker);
        });
        
        console.log(`Loaded ${data.elements.length} campings from OSM API`);
        showNotification(`${data.elements.length} campings geladen van OpenStreetMap`, 'success');
        updateCampingCount();
        
        return true;
        
    } catch (error) {
        console.error('OSM API failed:', error);
        showSampleCampings();
        return true;
    }
}

// Show sample campings as fallback
function showSampleCampings() {
    campingLayer.clearLayers();
    
    const sampleCampings = [
        { name: "Camping De Berekuil", coords: [52.1326, 5.2913] },
        { name: "Camping Vliegenbos", coords: [52.3676, 4.9041] },
        { name: "De Kwakkenberg", coords: [51.9851, 5.9699] },
        { name: "Camping Scholtenhagen", coords: [52.4114, 6.5665] }
    ];
    
    sampleCampings.forEach(camping => {
        const popupContent = `
            <div class="camping-popup">
                <h4><i class="fas fa-campground"></i> ${camping.name}</h4>
                <p><strong>Type:</strong> Camping</p>
                <p style="font-size: 10px; color: #666;">Sample data</p>
            </div>
        `;
        
        const marker = L.marker(camping.coords, {
            icon: campingIcon,
            zIndex: 1000
        }).bindPopup(popupContent);
        
        campingLayer.addLayer(marker);
    });
    
    showNotification(`${sampleCampings.length} sample campings getoond`, 'warning');
    updateCampingCount();
}

// Remove camping count and other complex functions - keep it simple
function clearCampings() {
    campingLayer.clearLayers();
    
    if (campingVisible) {
        const card = document.getElementById('camping-layer-card');
        if (card) {
            card.classList.remove('active');
        }
        map.removeLayer(campingLayer);
        campingVisible = false;
    }
    
    showNotification('Campings verwijderd', 'info');
}

// Show/hide loading overlay
function showLoadingOverlay(text = 'Laden...') {
    hideLoadingOverlay();
    
    loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner-large"></div>
            <div class="loading-text">${text}</div>
            <div class="loading-detail">Even geduld...</div>
        </div>
    `;
    
    document.body.appendChild(loadingOverlay);
}

function updateLoadingOverlay(text) {
    if (loadingOverlay) {
        const textEl = loadingOverlay.querySelector('.loading-text');
        if (textEl) textEl.textContent = text;
    }
}

function hideLoadingOverlay() {
    if (loadingOverlay && loadingOverlay.parentNode) {
        loadingOverlay.parentNode.removeChild(loadingOverlay);
        loadingOverlay = null;
    }
}

// ============ ROUTE FUNCTIONALITY ============

function loadRouteOptions() {
    const routeType = document.getElementById('routeTypeSelect').value;
    const specificSelect = document.getElementById('specificRouteSelect');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    
    if (routeType === 'law' && routeDefinitions.law) {
        step2.style.display = 'block';
        
        specificSelect.innerHTML = '<option value="">-- Selecteer een LAW route --</option>';
        routeDefinitions.law.forEach(route => {
            const option = document.createElement('option');
            option.value = route.value;
            option.textContent = route.name;
            option.dataset.filter = route.filter;
            option.dataset.type = routeType;
            specificSelect.appendChild(option);
        });
        
        specificSelect.onchange = function() {
            if (this.value) {
                step3.style.display = 'block';
            } else {
                step3.style.display = 'none';
            }
        };
    } else {
        step2.style.display = 'none';
        step3.style.display = 'none';
        specificSelect.innerHTML = '<option value="">-- Selecteer eerst LAW --</option>';
    }
}

function showSelectedRoute() {
    const routeTypeSelect = document.getElementById('routeTypeSelect');
    const specificSelect = document.getElementById('specificRouteSelect');
    
    const routeType = routeTypeSelect.value;
    const selectedOption = specificSelect.options[specificSelect.selectedIndex];
    
    if (!routeType || !selectedOption.value) {
        alert('Selecteer eerst een route type en specifieke route');
        return;
    }
    
    const routeName = selectedOption.textContent;
    const routeFilter = selectedOption.dataset.filter;
    const layerName = getLayerName(routeType);
    
    const existingRoute = activeRoutes.find(route => route.filter === routeFilter && route.layerName === layerName);
    if (existingRoute) {
        alert(`Route "${routeName}" is al toegevoegd!`);
        resetRouteForm();
        return;
    }
    
    const routeData = {
        id: Date.now(),
        name: routeName,
        type: routeType,
        filter: routeFilter,
        layerName: layerName,
        value: selectedOption.value
    };
    
    activeRoutes.push(routeData);
    addRouteToMap(routeData);
    updateActiveRoutesDisplay();
    updateRouteDetails(routeData);
    resetRouteForm();
}

function addRouteToMap(routeData) {
    const xmlFilter = `<Filter><PropertyIsEqualTo><PropertyName>lawnaam</PropertyName><Literal>${routeData.filter}</Literal></PropertyIsEqualTo></Filter>`;
    
    console.log('Adding route:', routeData.name);
    
    const wmsLayer = L.tileLayer.pdokFilter('https://service.pdok.nl/wandelnet/landelijke-wandelroutes/wms/v1_0', {
        layers: routeData.layerName,
        xmlFilter: xmlFilter,
        attribution: '© PDOK Wandelnet',
        opacity: 0.8,
        zIndex: 10 + activeRoutes.length,
        tileSize: 256
    });
    
    wmsLayer.addTo(map);
    routeData.layer = wmsLayer;
    
    showNotification(`Route "${routeData.name}" toegevoegd`, 'success');
}

function showRouteInfoInPanel(feature, latlng) {
    const props = feature.properties;
    
    const panelContent = `
        <div class="route-info-card">
            <div class="route-info-header">
                <div class="route-info-title">${props.lawnaam || 'LAW Route'}</div>
                <div class="route-info-badge">${props.routetype || 'LAW Route'}</div>
            </div>
            
            ${props.etappe || props.etappnaam ? `
                <div class="route-info-section">
                    <h4><i class="fas fa-map-marker-alt"></i> Etappe Informatie</h4>
                    ${props.etappe ? `<p><strong>Etappe:</strong> ${props.etappe}</p>` : ''}
                    ${props.etappnaam ? `<p><strong>Naam:</strong> ${props.etappnaam}</p>` : ''}
                </div>
            ` : ''}
            
            ${props.van || props.naar ? `
                <div class="route-info-section">
                    <h4><i class="fas fa-route"></i> Route Traject</h4>
                    ${props.van ? `<p><strong>Van:</strong> ${props.van}</p>` : ''}
                    ${props.naar ? `<p><strong>Naar:</strong> ${props.naar}</p>` : ''}
                </div>
            ` : ''}
            
            <div class="route-info-section">
                <h4><i class="fas fa-info-circle"></i> Details</h4>
                ${props.provincie ? `<p><strong>Provincie:</strong> ${props.provincie}</p>` : ''}
                ${props.lengte_m ? `<p><strong>Lengte:</strong> ${(props.lengte_m / 1000).toFixed(1)} km</p>` : ''}
            </div>
            
            <div class="route-info-actions">
                <button class="highlight-btn" onclick="clearEtappeHighlight()">
                    <i class="fas fa-eye-slash"></i>
                    Verberg highlight
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('routeInfoPanel').innerHTML = panelContent;
    switchToRouteInfoTab();
    showNotification(`Etappe informatie geladen`, 'success');
}

function switchToRouteInfoTab() {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    
    document.querySelector('[data-tab="info"]').classList.add('active');
    document.getElementById('info-panel').classList.add('active');
}

function highlightEtappe(feature, route) {
    highlightLayer.clearLayers();
    
    if (feature.geometry && feature.geometry.coordinates) {
        let coordinates;
        
        if (feature.geometry.type === 'LineString') {
            coordinates = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        } else if (feature.geometry.type === 'MultiLineString') {
            coordinates = feature.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
        }
        
        if (coordinates && coordinates.length > 0) {
            const highlightLine = L.polyline(coordinates, {
                color: '#f59e0b',
                weight: 8,
                opacity: 0.8,
                zIndex: 1000
            });
            
            highlightLayer.addLayer(highlightLine);
        }
    }
}

function clearEtappeHighlight() {
    highlightLayer.clearLayers();
    document.getElementById('routeInfoPanel').innerHTML = '<div class="empty-state">Geen etappe geselecteerd</div>';
}

function getLayerName(routeType) {
    return 'landelijke-wandelroutes';
}

function updateActiveRoutesDisplay() {
    const container = document.getElementById('activeRoutesDisplay');
    
    if (activeRoutes.length === 0) {
        container.innerHTML = '<div class="empty-state">Geen routes geselecteerd</div>';
        return;
    }
    
    container.innerHTML = activeRoutes.map(route => `
        <div class="active-route-item">
            <div class="active-route-info">
                <h4>${route.name}</h4>
                <p>Lange Afstand Wandelpad</p>
            </div>
            <button class="route-remove-btn" onclick="removeRoute(${route.id})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function updateRouteDetails(routeData) {
    const container = document.getElementById('routeDetailsContainer');
    
    container.innerHTML = `
        <div class="route-detail-item">
            <div class="route-detail-header">
                <h4>${routeData.name}</h4>
                <span class="route-type-badge">LAW</span>
            </div>
        </div>
    `;
}

function removeRoute(routeId) {
    const routeIndex = activeRoutes.findIndex(r => r.id === routeId);
    if (routeIndex !== -1) {
        const route = activeRoutes[routeIndex];
        
        if (route.layer) {
            map.removeLayer(route.layer);
        }
        
        activeRoutes.splice(routeIndex, 1);
        updateActiveRoutesDisplay();
        
        if (activeRoutes.length === 0) {
            document.getElementById('routeDetailsContainer').innerHTML = 
                '<div class="empty-state">Selecteer een route om details te zien</div>';
        }
    }
}

function clearAllRoutes() {
    activeRoutes.forEach(route => {
        if (route.layer) {
            map.removeLayer(route.layer);
        }
    });
    
    activeRoutes = [];
    updateActiveRoutesDisplay();
    document.getElementById('routeDetailsContainer').innerHTML = 
        '<div class="empty-state">Selecteer een route om details te zien</div>';
    resetRouteForm();
}

function resetRouteForm() {
    document.getElementById('routeTypeSelect').value = '';
    document.getElementById('specificRouteSelect').innerHTML = '<option value="">-- Eerst route type kiezen --</option>';
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'none';
}

// ============ TOOLS & UTILITY FUNCTIONS ============

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? '#10b981' : 
                   type === 'error' ? '#ef4444' : 
                   type === 'warning' ? '#f59e0b' : '#3b82f6';
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-size: 14px;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, type === 'error' ? 5000 : 3000);
}

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

            const distance = prevMarker.getLatLng().distanceTo(latlng) / 1000;
            totalDistance += distance;
            updateDistanceDisplay();
        }
    }
}

function updateDistanceDisplay() {
    const displayEl = document.getElementById('distanceDisplay');
    if (displayEl) {
        displayEl.querySelector('.distance-value').textContent = totalDistance.toFixed(2);
    }
}

function clearMeasurements() {
    measureMarkers.forEach(item => {
        map.removeLayer(item);
    });
    measureMarkers = [];
    totalDistance = 0;
    updateDistanceDisplay();
}

function searchLocation() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=nl&limit=3`)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                
                map.setView([lat, lon], 12);
                
                const marker = L.marker([lat, lon]).addTo(map);
                marker.bindPopup(result.display_name).openPopup();
                
                setTimeout(() => {
                    map.removeLayer(marker);
                }, 10000);
            } else {
                alert('Locatie niet gevonden');
            }
        })
        .catch(error => {
            console.error('Zoekfout:', error);
            alert('Er is een fout opgetreden bij het zoeken');
        });
}

function zoomToNetherlands() {
    map.setView([52.1326, 5.2913], 7);
}

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            map.setView([lat, lon], 14);
            
            const marker = L.marker([lat, lon]).addTo(map);
            marker.bindPopup('Uw huidige locatie').openPopup();
            
            setTimeout(() => {
                map.removeLayer(marker);
            }, 15000);
        }, function(error) {
            alert('Locatie kon niet worden bepaald');
        });
    } else {
        alert('Geolocation wordt niet ondersteund');
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function addCurrentViewToFavorites() {
    alert('Favorieten functionaliteit beschikbaar');
}

function updateSearchHistory() {}
function updateFavoritesList() {}
function saveStoredData() {}
function loadStoredData() {}

// Route measuring stubs (for compatibility)
function startRouteMeasuring() {
    showNotification('Route meting functionaliteit beschikbaar in volledige versie', 'info');
}

function addRouteMeasurePoint() {}
function clearRouteMeasurements() {}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initMap();
});

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
let osmCampingsData = null;
let campingVisible = false;
let currentCampingSource = 'geojson';
let loadingOverlay = null;

// Route definitions - alleen de 4 gewenste LAW routes
const routeDefinitions = {
    law: [
        { value: 'LAW 10', name: 'LAW 10 - Marskramerpad', filter: 'Marskramerpad' },
        { value: 'LAW 5', name: 'LAW 5 - Trekvogelpad', filter: 'Trekvogelpad' },
        { value: 'LAW 4', name: 'LAW 4 - Zuiderzeepad', filter: 'Zuiderzeepad' },
        { value: 'LAW 3', name: 'LAW 3 - Pelgrimspad deel 1', filter: 'Pelgrimspad' }
    ]
};

// Custom WMS Layer class to handle PDOK XML filtering
L.TileLayer.PDOKFilter = L.TileLayer.WMS.extend({
    initialize: function (url, options) {
        L.TileLayer.WMS.prototype.initialize.call(this, url, options);
    },
    
    getTileUrl: function (coords) {
        // Use Leaflet's built-in WMS bbox calculation
        var tileBounds = this._tileCoordsToBounds(coords);
        var nw = this._crs.project(tileBounds.getNorthWest());
        var se = this._crs.project(tileBounds.getSouthEast());
        
        // BBOX for EPSG:3857 should be [minx, miny, maxx, maxy]
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
        
        // Add XML filter if provided
        if (this.options.xmlFilter) {
            params['FILTER'] = this.options.xmlFilter;
        }
        
        // Build query string
        var queryString = Object.keys(params).map(key => 
            encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
        ).join('&');
        
        var finalUrl = url + queryString;
        console.log('Generated PDOK URL:', finalUrl);
        
        return finalUrl;
    }
});

// Helper function to create PDOK filtered layer
L.tileLayer.pdokFilter = function (url, options) {
    return new L.TileLayer.PDOKFilter(url, options);
};

// Camping icon definitie
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
    popupAnchor: [0, -24],
    className: 'camping-marker'
});

// Initialize map
function initMap() {
    // Create map centered on Netherlands
    map = L.map('map').setView([52.1326, 5.2913], 7);

    // Base layers
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

    // Initialize highlight layer
    highlightLayer = L.layerGroup();
    highlightLayer.addTo(map);

    // Initialize camping layer
    initCampingLayer();

    // Setup event listeners
    setupEventListeners();
    setupTabNavigation();
    loadStoredData();
}

// Initialize camping layer
function initCampingLayer() {
    campingLayer = L.layerGroup();
    
    // Auto-load camping data op startup
    setTimeout(() => {
        loadCampingData();
    }, 1000);
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

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchLocation();
            }
        });
    }

    // Map click event for measuring AND route info
    map.on('click', function(e) {
        if (measuring) {
            addMeasurePoint(e.latlng);
        } else if (isRouteMeasuring) {
            addRouteMeasurePoint(e.latlng);
        } else {
            // Check if any route layers are active and get route info
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
            x: Math.round(point.x),
            y: Math.round(point.y)
        };
        
        const url = 'https://service.pdok.nl/wandelnet/landelijke-wandelroutes/wms/v1_0?' + 
                    Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.features && data.features.length > 0) {
                    // Filter features to only include the specific route we're displaying
                    const filteredFeatures = data.features.filter(feature => 
                        feature.properties.lawnaam === route.filter
                    );
                    
                    if (filteredFeatures.length > 0) {
                        showRouteInfoInPanel(filteredFeatures[0], latlng);
                        highlightEtappe(filteredFeatures[0], route);
                    }
                }
            })
            .catch(error => {
                console.log('Geen route info beschikbaar voor', route.name);
            });
    });
}

// Show route info in sidebar panel instead of popup
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
            
            ${props.samenvatting ? `
                <div class="route-description">
                    <h4 style="margin: 0 0 8px 0; font-size: 14px; color: var(--text-primary);">📄 Beschrijving</h4>
                    <p style="margin: 0; font-size: 13px; line-height: 1.4;">${props.samenvatting}</p>
                </div>
            ` : ''}
            
            <div class="route-trace-section">
                <h4><i class="fas fa-ruler-horizontal"></i> Route Afstand Meten</h4>
                <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
                    Klik op punten langs de route om exact de afstand te meten
                </p>
                <button class="trace-btn" onclick="startRouteMeasuring()" id="measureRouteBtn">
                    <i class="fas fa-crosshairs"></i>
                    Start Route Meting
                </button>
                <div class="trace-progress" id="routeMeasureDisplay" style="display: none;">
                    <div class="trace-stats">
                        <div class="trace-stat">
                            <span class="trace-value" id="routeMeasureDistance">0.0</span>
                            <span class="trace-label">km gemeten</span>
                        </div>
                        <div class="trace-stat">
                            <span class="trace-value" id="routeMeasurePoints">0</span>
                            <span class="trace-label">meetpunten</span>
                        </div>
                    </div>
                    <button class="clear-measure-btn" onclick="clearRouteMeasurements()">
                        <i class="fas fa-trash"></i>
                        Wis metingen
                    </button>
                </div>
            </div>
            
            <div class="route-info-actions">
                <button class="highlight-btn" onclick="clearEtappeHighlight()">
                    <i class="fas fa-eye-slash"></i>
                    Verberg highlight
                </button>
                <div class="highlight-timer">
                    Klik elders om te verbergen
                </div>
            </div>
        </div>
    `;
    
    // Update the route info panel
    document.getElementById('routeInfoPanel').innerHTML = panelContent;
    
    // Store current route coordinates for tracing
    window.currentRouteCoords = feature.geometry.coordinates;
    window.currentRouteGeometry = feature.geometry;
    
    // Switch to the Route Info tab
    switchToRouteInfoTab();
    
    // Show notification that info is loaded
    showNotification(`Etappe informatie geladen: ${props.etappnaam || props.etappe || 'Route segment'}`, 'success');
}

// Switch to Route Info tab
function switchToRouteInfoTab() {
    // Remove active class from all tabs and panels
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    
    // Activate Route Info tab
    document.querySelector('[data-tab="info"]').classList.add('active');
    document.getElementById('info-panel').classList.add('active');
}

// Highlight the clicked etappe with kilometer markers
function highlightEtappe(feature, route) {
    // Clear previous highlights
    highlightLayer.clearLayers();
    
    if (feature.geometry && feature.geometry.coordinates) {
        let coordinates;
        
        if (feature.geometry.type === 'LineString') {
            coordinates = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        } else if (feature.geometry.type === 'MultiLineString') {
            coordinates = feature.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
        }
        
        if (coordinates && coordinates.length > 0) {
            // Main highlight line with gradient effect
            const highlightLine = L.polyline(coordinates, {
                color: '#f59e0b',
                weight: 12,
                opacity: 0.9,
                zIndex: 1000,
                className: 'highlight-route'
            });
            
            // Add a subtle shadow line
            const shadowLine = L.polyline(coordinates, {
                color: '#92400e',
                weight: 14,
                opacity: 0.3,
                zIndex: 999
            });
            
            highlightLayer.addLayer(shadowLine);
            highlightLayer.addLayer(highlightLine);
            
            // Add kilometer markers along the route
            addKilometerMarkers(coordinates);
            
            // Start/end markers with better styling
            if (coordinates.length >= 2) {
                const startPoint = coordinates[0];
                const endPoint = coordinates[coordinates.length - 1];
                
                const startMarker = L.circleMarker(startPoint, {
                    radius: 14,
                    color: '#ffffff',
                    fillColor: '#059669',
                    fillOpacity: 1,
                    weight: 3,
                    zIndex: 1002
                }).bindTooltip('🚶‍♂️ START', { 
                    permanent: false, 
                    direction: 'top',
                    className: 'start-tooltip'
                });
                
                const endMarker = L.circleMarker(endPoint, {
                    radius: 14,
                    color: '#ffffff',
                    fillColor: '#dc2626',
                    fillOpacity: 1,
                    weight: 3,
                    zIndex: 1002
                }).bindTooltip('🏁 FINISH', { 
                    permanent: false, 
                    direction: 'top',
                    className: 'end-tooltip'
                });
                
                highlightLayer.addLayer(startMarker);
                highlightLayer.addLayer(endMarker);
            }
            
            console.log('✨ Highlighted etappe:', feature.properties.etappnaam || feature.properties.etappe || 'Onbekende etappe');
        }
    }
}

// Add kilometer markers along the route with subtler styling
function addKilometerMarkers(coordinates) {
    if (coordinates.length < 2) return;
    
    let totalDistance = 0;
    let kmCount = 1;
    
    for (let i = 1; i < coordinates.length; i++) {
        const prevPoint = L.latLng(coordinates[i-1]);
        const currentPoint = L.latLng(coordinates[i]);
        const segmentDistance = prevPoint.distanceTo(currentPoint);
        
        totalDistance += segmentDistance;
        
        // Check if we've passed a kilometer mark
        while (kmCount * 1000 <= totalDistance) {
            // Calculate the position for this kilometer mark
            const kmPosition = interpolatePosition(coordinates, kmCount * 1000);
            
            if (kmPosition) {
                // Create subtle kilometer marker with white background and green text
                const kmMarker = L.circleMarker(kmPosition, {
                    radius: 8,
                    color: '#059669',
                    fillColor: '#ffffff',
                    fillOpacity: 0.95,
                    weight: 2,
                    zIndex: 1001,
                    className: 'km-marker'
                }).bindTooltip(`${kmCount}`, { 
                    permanent: true, 
                    direction: 'center',
                    className: 'km-tooltip-subtle',
                    offset: [0, 0]
                });
                
                highlightLayer.addLayer(kmMarker);
            }
            
            kmCount++;
        }
    }
}

// Interpolate position along route for exact kilometer marks
function interpolatePosition(coordinates, targetDistance) {
    let currentDistance = 0;
    
    for (let i = 1; i < coordinates.length; i++) {
        const prevPoint = L.latLng(coordinates[i-1]);
        const currentPoint = L.latLng(coordinates[i]);
        const segmentDistance = prevPoint.distanceTo(currentPoint);
        
        if (currentDistance + segmentDistance >= targetDistance) {
            // The target distance is within this segment
            const remainingDistance = targetDistance - currentDistance;
            const ratio = remainingDistance / segmentDistance;
            
            // Interpolate between the two points
            const lat = coordinates[i-1][0] + (coordinates[i][0] - coordinates[i-1][0]) * ratio;
            const lng = coordinates[i-1][1] + (coordinates[i][1] - coordinates[i-1][1]) * ratio;
            
            return [lat, lng];
        }
        
        currentDistance += segmentDistance;
    }
    
    return null;
}

// Route measuring functionality
let isRouteMeasuring = false;
let routeMeasurePoints = [];
let routeMeasureMarkers = [];
let routeMeasureLines = [];
let routeMeasureDistance = 0;

// Start route measuring
function startRouteMeasuring() {
    if (!window.currentRouteCoords) {
        showNotification('Geen route geselecteerd om te meten', 'error');
        return;
    }
    
    if (isRouteMeasuring) {
        stopRouteMeasuring();
        return;
    }
    
    isRouteMeasuring = true;
    routeMeasurePoints = [];
    routeMeasureMarkers = [];
    routeMeasureLines = [];
    routeMeasureDistance = 0;
    
    // Update UI
    const measureBtn = document.getElementById('measureRouteBtn');
    const measureDisplay = document.getElementById('routeMeasureDisplay');
    
    measureBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Meting';
    measureBtn.classList.add('active');
    measureDisplay.style.display = 'block';
    
    // Change cursor to crosshair
    map.getContainer().style.cursor = 'crosshair';
    
    showNotification('Klik op punten langs de route om afstand te meten', 'info');
}

// Stop route measuring
function stopRouteMeasuring() {
    isRouteMeasuring = false;
    
    // Update UI
    const measureBtn = document.getElementById('measureRouteBtn');
    
    if (measureBtn) {
        measureBtn.innerHTML = '<i class="fas fa-crosshairs"></i> Start Route Meting';
        measureBtn.classList.remove('active');
    }
    
    // Reset cursor
    map.getContainer().style.cursor = '';
    
    showNotification('Route meting gestopt', 'info');
}

// Add route measure point
function addRouteMeasurePoint(latlng) {
    if (!isRouteMeasuring) return;
    
    // Find closest point on the route
    const closestPoint = findClosestPointOnRoute(latlng);
    if (!closestPoint) return;
    
    // Add point to array
    routeMeasurePoints.push(closestPoint);
    
    // Create marker
    const marker = L.circleMarker(closestPoint, {
        radius: 6,
        color: '#ffffff',
        fillColor: '#f59e0b',
        fillOpacity: 1,
        weight: 2,
        zIndex: 1002
    }).bindTooltip(`Punt ${routeMeasurePoints.length}`, {
        permanent: true,
        direction: 'top',
        className: 'measure-point-tooltip'
    });
    
    marker.addTo(map);
    routeMeasureMarkers.push(marker);
    
    // Draw line if we have more than one point
    if (routeMeasurePoints.length > 1) {
        const prevPoint = routeMeasurePoints[routeMeasurePoints.length - 2];
        const currentPoint = closestPoint;
        
        const line = L.polyline([prevPoint, currentPoint], {
            color: '#f59e0b',
            weight: 4,
            opacity: 0.8,
            dashArray: '8, 8'
        });
        
        line.addTo(map);
        routeMeasureLines.push(line);
        
        // Calculate distance for this segment
        const segmentDistance = L.latLng(prevPoint).distanceTo(L.latLng(currentPoint));
        routeMeasureDistance += segmentDistance;
        
        // Add distance label at midpoint
        const midLat = (prevPoint[0] + currentPoint[0]) / 2;
        const midLng = (prevPoint[1] + currentPoint[1]) / 2;
        
        const distanceLabel = L.marker([midLat, midLng], {
            icon: L.divIcon({
                className: 'distance-label',
                html: `<div class="distance-text">${(segmentDistance / 1000).toFixed(1)}km</div>`,
                iconSize: [60, 20],
                iconAnchor: [30, 10]
            }),
            zIndex: 1003
        });
        
        distanceLabel.addTo(map);
        routeMeasureMarkers.push(distanceLabel);
    }
    
    updateRouteMeasureDisplay();
}

// Find closest point on route
function findClosestPointOnRoute(clickedLatLng) {
    if (!window.currentRouteCoords) return null;
    
    let coordinates;
    if (window.currentRouteGeometry.type === 'LineString') {
        coordinates = window.currentRouteCoords.map(coord => [coord[1], coord[0]]);
    } else if (window.currentRouteGeometry.type === 'MultiLineString') {
        coordinates = window.currentRouteCoords[0].map(coord => [coord[1], coord[0]]);
    }
    
    if (!coordinates || coordinates.length < 2) return null;
    
    let closestPoint = null;
    let minDistance = Infinity;
    
    // Check each line segment of the route
    for (let i = 0; i < coordinates.length - 1; i++) {
        const segmentStart = L.latLng(coordinates[i]);
        const segmentEnd = L.latLng(coordinates[i + 1]);
        
        // Find closest point on this line segment
        const closestOnSegment = getClosestPointOnLineSegment(clickedLatLng, segmentStart, segmentEnd);
        const distance = clickedLatLng.distanceTo(closestOnSegment);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestPoint = [closestOnSegment.lat, closestOnSegment.lng];
        }
    }
    
    // Only return point if it's reasonably close (within 100 meters)
    return minDistance < 100 ? closestPoint : null;
}

// Get closest point on line segment
function getClosestPointOnLineSegment(point, lineStart, lineEnd) {
    const A = point.lat - lineStart.lat;
    const B = point.lng - lineStart.lng;
    const C = lineEnd.lat - lineStart.lat;
    const D = lineEnd.lng - lineStart.lng;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) return lineStart;
    
    let param = dot / lenSq;
    
    if (param < 0) return lineStart;
    if (param > 1) return lineEnd;
    
    return L.latLng(
        lineStart.lat + param * C,
        lineStart.lng + param * D
    );
}

// Update route measure display
function updateRouteMeasureDisplay() {
    const distanceEl = document.getElementById('routeMeasureDistance');
    const pointsEl = document.getElementById('routeMeasurePoints');
    
    if (distanceEl && pointsEl) {
        distanceEl.textContent = (routeMeasureDistance / 1000).toFixed(1);
        pointsEl.textContent = routeMeasurePoints.length;
    }
}

// Clear route measurements
function clearRouteMeasurements() {
    // Remove all markers and lines
    routeMeasureMarkers.forEach(marker => map.removeLayer(marker));
    routeMeasureLines.forEach(line => map.removeLayer(line));
    
    // Reset arrays and distance
    routeMeasurePoints = [];
    routeMeasureMarkers = [];
    routeMeasureLines = [];
    routeMeasureDistance = 0;
    
    updateRouteMeasureDisplay();
    showNotification('Route metingen gewist', 'info');
}

// Clear etappe highlight
function clearEtappeHighlight() {
    highlightLayer.clearLayers();
    // Stop measuring if active
    if (isRouteMeasuring) {
        stopRouteMeasuring();
        clearRouteMeasurements();
    }
    // Clear route info panel
    document.getElementById('routeInfoPanel').innerHTML = '<div class="empty-state">Geen etappe geselecteerd</div>';
}

// Get layer name
function getLayerName(routeType) {
    return 'landelijke-wandelroutes';
}

// Update active routes display
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

// Update route details
function updateRouteDetails(routeData) {
    const container = document.getElementById('routeDetailsContainer');
    
    container.innerHTML = `
        <div class="route-detail-item">
            <div class="route-detail-header">
                <h4>${routeData.name}</h4>
                <span class="route-type-badge">Lange Afstand Wandelpad</span>
            </div>
            <div class="route-detail-info">
                <div><i class="fas fa-layer-group"></i><span>PDOK Laag: ${routeData.layerName}</span></div>
                <div><i class="fas fa-filter"></i><span>Filter: ${routeData.filter}</span></div>
            </div>
        </div>
    `;
}

// Remove route
function removeRoute(routeId) {
    const routeIndex = activeRoutes.findIndex(r => r.id === routeId);
    if (routeIndex !== -1) {
        const route = activeRoutes[routeIndex];
        
        if (route.layer) {
            map.removeLayer(route.layer);
        }
        
        activeRoutes.splice(routeIndex, 1);
        updateActiveRoutesDisplay();
        
        // Update camping filter when routes change
        if (campingVisible) {
            filterCampingsByDistance();
        }
        
        if (activeRoutes.length === 0) {
            document.getElementById('routeDetailsContainer').innerHTML = 
                '<div class="empty-state">Selecteer een route om details te zien</div>';
        }
    }
}

// Clear all routes
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
    
    // Update camping filter when routes are cleared
    if (campingVisible) {
        filterCampingsByDistance();
    }
}

// Reset form
function resetRouteForm() {
    document.getElementById('routeTypeSelect').value = '';
    document.getElementById('specificRouteSelect').innerHTML = '<option value="">-- Eerst route type kiezen --</option>';
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'none';
}

// Show notification
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

// Search functions
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

// Placeholder functions for favorites/history
function addCurrentViewToFavorites() {
    alert('Favorieten functionaliteit beschikbaar');
}

function updateSearchHistory() {}
function updateFavoritesList() {}
function saveStoredData() {}
function loadStoredData() {}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initMap();
});bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`,
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
                                // Filter features to only include the specific route we're displaying
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
                
                // If no route was clicked after a short delay, clear highlights
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
    // Base layer cards
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

// ============ CAMPING FUNCTIONALITY ============

// Toggle camping layer zichtbaarheid
function toggleCampingLayer() {
    campingVisible = !campingVisible;
    const card = document.getElementById('camping-layer-card');
    
    if (campingVisible) {
        campingLayer.addTo(map);
        card.classList.add('active');
        showNotification('Campings zichtbaar', 'success');
        
        if (campingsData || osmCampingsData) {
            filterCampingsByDistance();
        } else {
            loadCampingData();
        }
    } else {
        map.removeLayer(campingLayer);
        card.classList.remove('active');
        showNotification('Campings verborgen', 'info');
    }
}

// Switch camping source
function switchCampingSource() {
    const source = document.getElementById('campingSource').value;
    currentCampingSource = source;
    
    if (campingVisible) {
        loadCampingData();
    }
    
    showNotification(`Camping bron gewijzigd naar: ${source === 'geojson' ? 'GeoJSON' : source === 'osm' ? 'OpenStreetMap' : 'Beide'}`, 'info');
}

// Laad camping data
async function loadCampingData() {
    showLoadingOverlay('Camping data laden...');
    
    try {
        campingLayer.clearLayers();
        
        if (currentCampingSource === 'geojson' || currentCampingSource === 'both') {
            await loadGeoJSONCampings();
        }
        
        if (currentCampingSource === 'osm' || currentCampingSource === 'both') {
            await loadOSMCampings();
        }
        
        updateCampingStats();
        updateCampingList();
        
        if (campingVisible) {
            filterCampingsByDistance();
        }
        
        hideLoadingOverlay();
        showNotification(`Camping data geladen! ${getTotalCampingCount()} campings beschikbaar`, 'success');
        
    } catch (error) {
        console.error('Fout bij laden camping data:', error);
        hideLoadingOverlay();
        showNotification('Fout bij laden camping data', 'error');
    }
}

// Laad GeoJSON camping data
async function loadGeoJSONCampings() {
    try {
        // Probeer lokaal bestand te laden
        const response = await fetch('./data/campings.geojson');
        if (response.ok) {
            campingsData = await response.json();
            console.log(`${campingsData.features.length} campings geladen uit GeoJSON`);
        } else {
            console.log('Geen lokaal GeoJSON bestand gevonden, gebruik sample data');
            campingsData = createSampleCampingData();
        }
    } catch (error) {
        console.log('GeoJSON laden mislukt, gebruik sample data:', error);
        campingsData = createSampleCampingData();
    }
}

// Laad OSM camping data via Overpass API
async function loadOSMCampings() {
    const bbox = '3.3,50.7,7.2,53.5'; // Nederland bounding box
    
    const overpassQuery = `
        [out:json][timeout:25];
        (
            node["tourism"="camp_site"](${bbox});
            node["tourism"="caravan_site"](${bbox});
            way["tourism"="camp_site"](${bbox});
            way["tourism"="caravan_site"](${bbox});
        );
        out center;
    `;
    
    try {
        updateLoadingOverlay('OSM camping data ophalen...');
        
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: overpassQuery,
            headers: {
                'Content-Type': 'text/plain'
            }
        });
        
        if (!response.ok) {
            throw new Error('OSM API request failed');
        }
        
        const data = await response.json();
        osmCampingsData = convertOSMToGeoJSON(data);
        
        console.log(`${osmCampingsData.features.length} campings geladen uit OSM`);
        
    } catch (error) {
        console.error('OSM camping data laden mislukt:', error);
        osmCampingsData = { type: "FeatureCollection", features: [] };
        showNotification('OSM data laden mislukt, gebruik alleen lokale data', 'warning');
    }
}

// Converteer OSM data naar GeoJSON format
function convertOSMToGeoJSON(osmData) {
    const features = [];
    
    osmData.elements.forEach(element => {
        if (element.lat && element.lon && element.tags) {
            const properties = {
                name: element.tags.name || 'Naamloze camping',
                type: element.tags.tourism || 'camp_site',
                website: element.tags.website || element.tags['contact:website'] || null,
                phone: element.tags.phone || element.tags['contact:phone'] || null,
                email: element.tags.email || element.tags['contact:email'] || null,
                address: formatOSMAddress(element.tags),
                description: element.tags.description || null,
                facilities: extractOSMFacilities(element.tags),
                stars: element.tags.stars ? parseInt(element.tags.stars) : null,
                fee: element.tags.fee || null,
                internet_access: element.tags.internet_access || null,
                source: 'OSM'
            };
            
            features.push({
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [element.lon, element.lat]
                },
                properties: properties
            });
        }
    });
    
    return {
        type: "FeatureCollection",
        features: features
    };
}

// Format OSM address
function formatOSMAddress(tags) {
    const parts = [];
    if (tags['addr:street']) parts.push(tags['addr:street']);
    if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
    if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
    if (tags['addr:city']) parts.push(tags['addr:city']);
    
    return parts.length > 0 ? parts.join(', ') : null;
}

// Extract facilities from OSM tags
function extractOSMFacilities(tags) {
    const facilities = [];
    
    if (tags.toilets === 'yes') facilities.push('toiletten');
    if (tags.shower === 'yes') facilities.push('douches');
    if (tags.drinking_water === 'yes') facilities.push('drinkwater');
    if (tags.electricity === 'yes') facilities.push('elektriciteit');
    if (tags.internet_access) facilities.push('wifi');
    if (tags.shop) facilities.push('winkel');
    if (tags.restaurant === 'yes') facilities.push('restaurant');
    if (tags.playground === 'yes') facilities.push('speeltuin');
    
    return facilities;
}

// Maak sample camping data voor demonstratie
function createSampleCampingData() {
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [5.2913, 52.1326]
                },
                "properties": {
                    "name": "Camping De Berekuil",
                    "type": "camp_site",
                    "website": "https://www.deberekuil.nl",
                    "phone": "030-1234567",
                    "facilities": ["douches", "toiletten", "wifi", "restaurant"],
                    "price_range": "€15-25 per nacht",
                    "description": "Kleinschalige familiecamping in bosrijke omgeving",
                    "source": "Sample"
                }
            },
            {
                "type": "Feature", 
                "geometry": {
                    "type": "Point",
                    "coordinates": [4.9041, 52.3676]
                },
                "properties": {
                    "name": "Camping Vliegenbos",
                    "type": "camp_site",
                    "website": "https://www.campingvliegenbos.nl",
                    "phone": "020-6368855",
                    "facilities": ["douches", "toiletten", "wifi", "verhuur_fietsen"],
                    "price_range": "€20-30 per nacht",
                    "description": "Natuurcamping nabij Amsterdam centrum",
                    "source": "Sample"
                }
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point", 
                    "coordinates": [5.9699, 51.9851]
                },
                "properties": {
                    "name": "De Kwakkenberg",
                    "type": "wilderness_hut",
                    "website": "https://www.natuurmonumenten.nl",
                    "phone": "024-3771234",
                    "facilities": ["basis_sanitair", "vuurplaats"],
                    "price_range": "€10-15 per nacht",
                    "description": "Natuurkampeerterrein van Natuurmonumenten",
                    "source": "Sample"
                }
            }
        ]
    };
}

// Get total camping count
function getTotalCampingCount() {
    let count = 0;
    if (campingsData) count += campingsData.features.length;
    if (osmCampingsData) count += osmCampingsData.features.length;
    return count;
}

// Update camping statistics
function updateCampingStats() {
    const totalCount = getTotalCampingCount();
    document.getElementById('totalCampings').textContent = totalCount;
}

// Update camping list in sidebar
function updateCampingList() {
    const container = document.getElementById('campingList');
    const allCampings = [];
    
    if (campingsData) {
        allCampings.push(...campingsData.features);
    }
    if (osmCampingsData) {
        allCampings.push(...osmCampingsData.features);
    }
    
    if (allCampings.length === 0) {
        container.innerHTML = '<div class="empty-state">Geen campings geladen</div>';
        return;
    }
    
    container.innerHTML = allCampings.slice(0, 10).map(camping => {
        const props = camping.properties;
        return `
            <div class="camping-item" onclick="zoomToCamping(${camping.geometry.coordinates[1]}, ${camping.geometry.coordinates[0]})">
                <h4><i class="fas fa-campground"></i> ${props.name}</h4>
                <p><strong>Type:</strong> ${formatCampingType(props.type)}</p>
                ${props.description ? `<p>${props.description}</p>` : ''}
                ${props.source ? `<p style="font-size: 10px; color: var(--text-muted);">Bron: ${props.source}</p>` : ''}
            </div>
        `;
    }).join('') + (allCampings.length > 10 ? `<div class="empty-state">... en ${allCampings.length - 10} meer</div>` : '');
}

// Zoom to specific camping
function zoomToCamping(lat, lng) {
    map.setView([lat, lng], 14);
    showNotification('Ingezoomd op camping', 'info');
}

// Filter campings op afstand van actieve routes
function filterCampingsByDistance() {
    if (!campingVisible) return;
    
    const radius = parseFloat(document.getElementById('campingRadius').value);
    const selectedType = document.getElementById('campingType').value;
    
    campingLayer.clearLayers();
    let visibleCount = 0;
    
    const allCampings = [];
    if (campingsData) allCampings.push(...campingsData.features);
    if (osmCampingsData) allCampings.push(...osmCampingsData.features);
    
    allCampings.forEach(camping => {
        const campingLatLng = L.latLng(camping.geometry.coordinates[1], camping.geometry.coordinates[0]);
        
        // Type filter
        if (selectedType && camping.properties.type !== selectedType) {
            return;
        }
        
        if (radius === 0 || activeRoutes.length === 0) {
            // Toon alle campings
            addCampingMarker(camping);
            visibleCount++;
        } else {
            // Check afstand tot elke actieve route
            let nearRoute = false;
            
            for (let route of activeRoutes) {
                if (isCampingNearRoute(campingLatLng, route, radius * 1000)) {
                    nearRoute = true;
                    break;
                }
            }
            
            if (nearRoute) {
                addCampingMarker(camping);
                visibleCount++;
            }
        }
    });
    
    document.getElementById('visibleCampings').textContent = visibleCount;
}

// Check of camping binnen radius van route ligt
function isCampingNearRoute(campingLatLng, route, radiusMeters) {
    // Simplified check - could improve with actual route geometry
    const routeBounds = route.layer.getBounds();
    const routeCenter = routeBounds.getCenter();
    const distance = campingLatLng.distanceTo(routeCenter);
    
    return distance <= radiusMeters;
}

// Filter campings op type
function filterCampingsByType() {
    filterCampingsByDistance(); // Re-run the complete filter
}

// Voeg camping marker toe aan kaart
function addCampingMarker(camping) {
    const coords = camping.geometry.coordinates;
    const props = camping.properties;
    
    const marker = L.marker([coords[1], coords[0]], {
        icon: campingIcon,
        zIndex: 1000
    });
    
    // Maak popup content
    const popupContent = createCampingPopupContent(props);
    
    marker.bindPopup(popupContent);
    campingLayer.addLayer(marker);
}

// Create camping popup content
function createCampingPopupContent(props) {
    return `
        <div class="camping-popup">
            <h4><i class="fas fa-campground"></i> ${props.name}</h4>
            <p><strong>Type:</strong> ${formatCampingType(props.type)}</p>
            
            ${props.price_range ? `
                <p><strong>Prijs:</strong> ${props.price_range}</p>
            ` : ''}
            
            ${props.address ? `
                <p><strong>Adres:</strong> ${props.address}</p>
            ` : ''}
            
            ${props.facilities && props.facilities.length > 0 ? `
                <div class="camping-facilities">
                    <strong>Faciliteiten:</strong> ${props.facilities.join(', ')}
                </div>
            ` : ''}
            
            ${props.description ? `
                <p style="margin: 8px 0; font-style: italic; font-size: 12px;">
                    ${props.description}
                </p>
            ` : ''}
            
            <div class="popup-buttons">
                ${props.website ? `
                    <button class="popup-button" onclick="window.open('${props.website}', '_blank')">
                        <i class="fas fa-globe"></i> Website
                    </button>
                ` : ''}
                ${props.phone ? `
                    <button class="popup-button" onclick="window.open('tel:${props.phone}', '_blank')">
                        <i class="fas fa-phone"></i> Bellen
                    </button>
                ` : ''}
                ${props.email ? `
                    <button class="popup-button" onclick="window.open('mailto:${props.email}', '_blank')">
                        <i class="fas fa-envelope"></i> E-mail
                    </button>
                ` : ''}
            </div>
            
            ${props.source ? `
                <p style="font-size: 10px; color: var(--text-muted); margin-top: 8px; text-align: center;">
                    Bron: ${props.source}
                </p>
            ` : ''}
        </div>
    `;
}

// Format camping type voor weergave
function formatCampingType(type) {
    const types = {
        'camp_site': 'Camping',
        'caravan_site': 'Camperplaats', 
        'wilderness_hut': 'Natuurkampeerterrein',
        'camping': 'Camping',
        'camperplaats': 'Camperplaats',
        'natuurkampeerterrein': 'Natuurkampeerterrein',
        'boerderijcamping': 'Boerderijcamping'
    };
    return types[type] || type;
}

// Fit map to all campings
function fitToCampings() {
    if (!campingVisible || campingLayer.getLayers().length === 0) {
        showNotification('Geen zichtbare campings om naar te zoomen', 'warning');
        return;
    }
    
    const group = new L.featureGroup(campingLayer.getLayers());
    map.fitBounds(group.getBounds().pad(0.1));
    showNotification('Ingezoomd op alle zichtbare campings', 'success');
}

// Show/hide loading overlay
function showLoadingOverlay(text = 'Laden...') {
    hideLoadingOverlay(); // Remove existing overlay
    
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

// ============ EXISTING ROUTE FUNCTIONALITY ============

// Route selection functions
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

// Show selected route
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
    
    // Check if route already exists
    const existingRoute = activeRoutes.find(route => route.filter === routeFilter && route.layerName === layerName);
    if (existingRoute) {
        alert(`Route "${routeName}" is al toegevoegd!`);
        resetRouteForm();
        return;
    }
    
    // Create route data
    const routeData = {
        id: Date.now(),
        name: routeName,
        type: routeType,
        filter: routeFilter,
        layerName: layerName,
        value: selectedOption.value
    };
    
    // Add to active routes
    activeRoutes.push(routeData);
    
    // Add to map
    addRouteToMap(routeData);
    
    // Update UI
    updateActiveRoutesDisplay();
    updateRouteDetails(routeData);
    resetRouteForm();
    
    // Update camping display if campings are visible
    if (campingVisible) {
        filterCampingsByDistance();
    }
}

// Add route to map
function addRouteToMap(routeData) {
    // Create XML filter exactly like your working URL
    const xmlFilter = `<Filter><PropertyIsEqualTo><PropertyName>lawnaam</PropertyName><Literal>${routeData.filter}</Literal></PropertyIsEqualTo></Filter>`;
    
    console.log('Adding route:', routeData.name);
    console.log('XML Filter:', xmlFilter);
    
    // Use custom PDOK filter layer
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

// Get route info at clicked point
function getRouteInfoAtPoint(latlng, point) {
    const bounds = map.getBounds();
    const size = map.getSize();
    
    // Try to get info from all active routes
    activeRoutes.forEach(route => {
        const params = {
            request: 'GetFeatureInfo',
            service: 'WMS',
            srs: 'EPSG:4326',
            version: '1.1.0',
            format: 'image/png',
            bbox: `${bounds.getWest()},${

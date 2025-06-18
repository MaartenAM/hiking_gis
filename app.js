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
let highlightLayer; // For highlighting clicked etappes

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
        console.log('BBOX:', bbox);
        
        return finalUrl;
    }
});

// Helper function to create PDOK filtered layer
L.tileLayer.pdokFilter = function (url, options) {
    return new L.TileLayer.PDOKFilter(url, options);
};

// Initialize map - simplified
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

    // Initialize highlight layer for etappe highlighting
    highlightLayer = L.layerGroup();
    highlightLayer.addTo(map);

    // Setup event listeners
    setupEventListeners();
    setupTabNavigation();
    loadStoredData();
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
                <h4>${route.name}</h4>
                <p>${route.description}</p>
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
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            tabPanels.forEach(panel => panel.classList.remove('active'));
            document.getElementById(targetTab + '-panel').classList.add('active');
        });
    });
}

// Setup event listeners - with route info functionality
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
        } else {
            // Check if any route layers are active and get route info
            if (activeRoutes.length > 0) {
                getRouteInfoAtPoint(e.latlng, e.containerPoint);
            }
        }
    });
}

// Get route info at clicked point using GetFeatureInfo
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
                    const feature = data.features[0];
                    showRouteInfoPopup(feature, latlng);
                    highlightEtappe(feature, route);
                }
            })
            .catch(error => {
                console.log('Geen route info beschikbaar voor', route.name);
            });
    });
}

// Highlight the clicked etappe
function highlightEtappe(feature, route) {
    // Clear previous highlights
    highlightLayer.clearLayers();
    
    // Get the specific etappe geometry if available
    if (feature.geometry && feature.geometry.coordinates) {
        let coordinates;
        
        // Handle different geometry types
        if (feature.geometry.type === 'LineString') {
            coordinates = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        } else if (feature.geometry.type === 'MultiLineString') {
            // For MultiLineString, take the first line
            coordinates = feature.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
        }
        
        if (coordinates && coordinates.length > 0) {
            // Create highlight polyline
            const highlightLine = L.polyline(coordinates, {
                color: '#ffff00',        // Bright yellow
                weight: 8,               // Thick line
                opacity: 0.9,
                dashArray: '10, 5',      // Dashed line
                zIndex: 1000             // On top of everything
            });
            
            highlightLayer.addLayer(highlightLine);
            
            // Add pulsing effect with circle markers at start/end
            if (coordinates.length >= 2) {
                const startPoint = coordinates[0];
                const endPoint = coordinates[coordinates.length - 1];
                
                // Start marker
                const startMarker = L.circleMarker(startPoint, {
                    radius: 12,
                    color: '#ff6b35',
                    fillColor: '#ff6b35',
                    fillOpacity: 0.8,
                    weight: 3,
                    className: 'pulse-marker'
                });
                
                // End marker  
                const endMarker = L.circleMarker(endPoint, {
                    radius: 12,
                    color: '#dc2626',
                    fillColor: '#dc2626', 
                    fillOpacity: 0.8,
                    weight: 3,
                    className: 'pulse-marker'
                });
                
                highlightLayer.addLayer(startMarker);
                highlightLayer.addLayer(endMarker);
            }
            
            console.log('Highlighted etappe:', feature.properties.etappnaam || feature.properties.etappe || 'Onbekende etappe');
            
            // Auto-remove highlight after 10 seconds
            setTimeout(() => {
                clearEtappeHighlight();
            }, 10000);
        }
    } else {
        // Fallback: create a WFS request to get the exact geometry of this etappe
        getEtappeGeometry(feature.properties, route);
    }
}

// Get exact etappe geometry via WFS for better highlighting
function getEtappeGeometry(properties, route) {
    // Build filter for this specific etappe
    let filter = `<Filter><PropertyIsEqualTo><PropertyName>lawnaam</PropertyName><Literal>${route.filter}</Literal></PropertyIsEqualTo>`;
    
    // Add etappe filter if available
    if (properties.etappe) {
        filter += `<And><PropertyIsEqualTo><PropertyName>etappe</PropertyName><Literal>${properties.etappe}</Literal></PropertyIsEqualTo></And>`;
    }
    filter += `</Filter>`;
    
    const wfsUrl = 'https://service.pdok.nl/wandelnet/landelijke-wandelroutes/wfs/v1_0' +
                   '?service=WFS' +
                   '&version=2.0.0' +
                   '&request=GetFeature' +
                   '&typeName=' + route.layerName +
                   '&outputFormat=application/json' +
                   '&filter=' + encodeURIComponent(filter) +
                   '&maxFeatures=1';
    
    fetch(wfsUrl)
        .then(response => response.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                highlightEtappe(data.features[0], route);
            }
        })
        .catch(error => {
            console.log('Could not get detailed etappe geometry:', error);
        });
}

// Clear etappe highlight
function clearEtappeHighlight() {
    highlightLayer.clearLayers();
}

// Show route info popup with detailed information and highlight controls
function showRouteInfoPopup(feature, latlng) {
    const props = feature.properties;
    
    const popupContent = `
        <div class="route-popup" style="max-width: 300px;">
            <h4 style="margin-bottom: 12px; color: var(--primary-green);">${props.lawnaam || 'LAW Route'}</h4>
            <div class="popup-details" style="line-height: 1.4;">
                ${props.routetype ? `<p><strong>Type:</strong> ${props.routetype}</p>` : ''}
                ${props.provincie ? `<p><strong>Provincie:</strong> ${props.provincie}</p>` : ''}
                ${props.lengte_m ? `<p><strong>Lengte:</strong> ${(props.lengte_m / 1000).toFixed(1)} km</p>` : ''}
                ${props.etappe ? `<p><strong>Etappe:</strong> ${props.etappe}</p>` : ''}
                ${props.etappnaam ? `<p><strong>Etappe naam:</strong> ${props.etappnaam}</p>` : ''}
                ${props.van ? `<p><strong>Van:</strong> ${props.van}</p>` : ''}
                ${props.naar ? `<p><strong>Naar:</strong> ${props.naar}</p>` : ''}
                ${props.fuid ? `<p><strong>Route ID:</strong> ${props.fuid}</p>` : ''}
                ${props.samenvatting ? `<p><strong>Beschrijving:</strong> ${props.samenvatting}</p>` : ''}
            </div>
            <div style="margin-top: 12px; display: flex; gap: 8px;">
                <button onclick="clearEtappeHighlight()" style="flex: 1; background: #64748b; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">
                    <i class="fas fa-eye-slash"></i> Verberg highlight
                </button>
            </div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
                💡 Etappe wordt 10 seconden gehighlight in <span style="color: #ffff00; background: #333; padding: 1px 4px;">geel</span>
            </div>
        </div>
    `;
    
    L.popup({
        maxWidth: 350,
        className: 'route-info-popup'
    })
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(map);
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

    // Overlay layer cards
    document.querySelectorAll('[data-overlay]').forEach(card => {
        card.addEventListener('click', () => {
            const overlayType = card.dataset.overlay;
            if (overlayType === 'local') {
                toggleLocalTrails();
                card.classList.toggle('active');
            }
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

// Toggle local trails
function toggleLocalTrails() {
    if (map.hasLayer(localTrailsLayer)) {
        map.removeLayer(localTrailsLayer);
    } else {
        localTrailsLayer.addTo(map);
    }
}

// Route selection functions - simplified for LAW only
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

// Show selected route - improved for multiple routes
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
    
    console.log('Adding new route:', routeData);
    console.log('Current active routes:', activeRoutes.length);
    
    // Add to active routes
    activeRoutes.push(routeData);
    
    // Add to map (each route gets its own layer)
    addRouteToMap(routeData);
    
    // Update UI
    updateActiveRoutesDisplay();
    updateRouteDetails(routeData);
    resetRouteForm();
    
    showNotification(`Route "${routeName}" toegevoegd (totaal: ${activeRoutes.length} routes)`, 'success');
}

// Add route to map with PDOK XML filtering - improved for multiple routes
function addRouteToMap(routeData) {
    // Create XML filter exactly like your working URL
    const xmlFilter = `<Filter><PropertyIsEqualTo><PropertyName>lawnaam</PropertyName><Literal>${routeData.filter}</Literal></PropertyIsEqualTo></Filter>`;
    
    console.log('Adding route to map:', routeData.name);
    console.log('XML Filter:', xmlFilter);
    console.log('Layer name:', routeData.layerName);
    
    // Create unique layer for this route
    const wmsLayer = L.tileLayer.pdokFilter('https://service.pdok.nl/wandelnet/landelijke-wandelroutes/wms/v1_0', {
        layers: routeData.layerName,
        xmlFilter: xmlFilter,
        attribution: '© PDOK Wandelnet',
        opacity: 0.8,
        zIndex: 10 + activeRoutes.length, // Unique z-index for each route
        tileSize: 256
    });
    
    // Add error handling
    wmsLayer.on('tileerror', function(error) {
        console.error('Error loading route tiles:', error);
        showNotification(`Route "${routeData.name}" kon niet geladen worden. Mogelijk bestaat de route naam "${routeData.filter}" niet in PDOK.`, 'error');
        
        // Try to get available route names
        suggestAvailableRoutes(routeData);
    });
    
    wmsLayer.on('tileload', function() {
        console.log(`Tiles loaded successfully for route: ${routeData.name}`);
    });
    
    // Add to map
    wmsLayer.addTo(map);
    routeData.layer = wmsLayer;
    
    showNotification(`Route "${routeData.name}" toegevoegd met filter: ${routeData.filter}`, 'success');
}

// Function to suggest available route names when a route fails to load
function suggestAvailableRoutes(failedRoute) {
    // Make a GetFeatureInfo request to see what routes are actually available in the area
    const bounds = map.getBounds();
    const center = map.getCenter();
    
    const testUrl = `https://service.pdok.nl/wandelnet/landelijke-wandelroutes/wms/v1_0?service=WMS&version=1.1.0&request=GetFeatureInfo&layers=${failedRoute.layerName}&query_layers=${failedRoute.layerName}&format=image/png&info_format=application/json&width=256&height=256&srs=EPSG:4326&bbox=${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}&x=128&y=128`;
    
    fetch(testUrl)
        .then(response => response.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                const availableRoutes = [...new Set(data.features.map(f => f.properties.lawnaam).filter(name => name))];
                console.log('Available route names in current area:', availableRoutes);
                
                // Find similar route names
                const similarRoutes = availableRoutes.filter(name => 
                    name.toLowerCase().includes('delta') || 
                    name.toLowerCase().includes(failedRoute.filter.toLowerCase())
                );
                
                if (similarRoutes.length > 0) {
                    console.log('Suggested route names for', failedRoute.filter + ':', similarRoutes);
                    showNotification(`Probeer: ${similarRoutes.join(', ')}`, 'warning');
                }
            }
        })
        .catch(error => {
            console.error('Could not fetch available route names:', error);
        });
}

// Get layer name
function getLayerName(routeType) {
    const layerMapping = {
        'law': 'landelijke-wandelroutes',
        'streekpaden': 'streekpaden',
        'ns-wandelingen': 'ns-wandelingen',
        'ov-stappers': 'ov-stappers',
        'stad-te-voet': 'stad-te-voet'
    };
    return layerMapping[routeType] || 'landelijke-wandelroutes';
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
                <p>${getDisplayName(route.type)}</p>
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
                <span class="route-type-badge">${getDisplayName(routeData.type)}</span>
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
}

// Reset form
function resetRouteForm() {
    document.getElementById('routeTypeSelect').value = '';
    document.getElementById('specificRouteSelect').innerHTML = '<option value="">-- Eerst route type kiezen --</option>';
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'none';
}

// Get display name
function getDisplayName(routeType) {
    const displayNames = {
        'law': 'Lange Afstand Wandelpad',
        'streekpaden': 'Streekpad',
        'ns-wandelingen': 'NS-wandeling',
        'ov-stappers': 'OV-stapper',
        'stad-te-voet': 'Stad te voet'
    };
    return displayNames[routeType] || routeType;
}

// Show notification with error type support
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
    }, type === 'error' ? 5000 : 3000); // Error messages stay longer
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
});

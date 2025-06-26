// Global variables
let map;
let measuring = false;
let measureMarkers = [];
let totalDistance = 0;
let baseLayers = {};
let activeBaseLayer = 'osm';
let activeRoutes = [];
let highlightLayer;
let campingLayer;
let vriendenLayer;
let campingVisible = false;
let vriendenVisible = false;
let loadingOverlay = null;
let isMobile = window.innerWidth <= 768;
let sidebarOpen = false;

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

// Vrienden op de Fiets icon
const vriendenIcon = L.icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="12" r="12" fill="#3b82f6"/>
            <path d="M7 9C7 8.45 7.45 8 8 8H16C16.55 8 17 8.45 17 9V10H15V9H9V10H7V9Z" fill="white"/>
            <circle cx="9" cy="13" r="2" fill="white"/>
            <circle cx="15" cy="13" r="2" fill="white"/>
            <path d="M11 11H13V15H11V11Z" fill="white"/>
        </svg>
    `),
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24]
});

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
    console.log('Initializing map...');
    
    try {
        map = L.map('map', {
            zoomControl: true,
            touchZoom: true,
            doubleClickZoom: true,
            scrollWheelZoom: true,
            boxZoom: !isMobile,
            keyboard: !isMobile
        }).setView([52.1326, 5.2913], 7);

        // Move zoom controls to better position on mobile
        if (isMobile) {
            map.zoomControl.setPosition('bottomright');
        }

        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            zIndex: 1
        });

        const topoLayer = L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png', {
            attribution: '© PDOK',
            zIndex: 1
        });

        const satelliteLayer = L.tileLayer('https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg', {
            attribution: '© PDOK Luchtfoto',
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

        // Initialize layer groups
        campingLayer = L.layerGroup();
        vriendenLayer = L.layerGroup();

        setupEventListeners();
        setupTabNavigation();
        setupMobileFeatures();
        
        console.log('Map initialized successfully');
    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

// Setup mobile-specific features
function setupMobileFeatures() {
    // Create overlay for mobile sidebar
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', closeSidebar);
        document.body.appendChild(overlay);
    }
    
    // Handle orientation changes
    window.addEventListener('orientationchange', function() {
        setTimeout(function() {
            map.invalidateSize();
            isMobile = window.innerWidth <= 768;
        }, 100);
    });
    
    // Handle window resize
    window.addEventListener('resize', function() {
        const wasMobile = isMobile;
        isMobile = window.innerWidth <= 768;
        
        if (wasMobile && !isMobile) {
            closeSidebar();
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.style.left = '';
                sidebar.classList.remove('open');
            }
        } else if (!wasMobile && isMobile) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && !sidebarOpen) {
                sidebar.style.left = '-100%';
            }
        }
        
        setTimeout(function() {
            map.invalidateSize();
        }, 100);
    });
}

// Toggle sidebar on mobile
function toggleSidebar() {
    console.log('Toggle sidebar called, isMobile:', isMobile, 'sidebarOpen:', sidebarOpen);
    
    const sidebar = document.getElementById('sidebar');
    let overlay = document.querySelector('.sidebar-overlay');
    const toggle = document.querySelector('.sidebar-toggle');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', closeSidebar);
        document.body.appendChild(overlay);
    }
    
    if (!sidebar || !toggle) {
        console.error('Sidebar elements not found', { sidebar: !!sidebar, toggle: !!toggle });
        return;
    }
    
    sidebarOpen = !sidebarOpen;
    
    if (sidebarOpen) {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        toggle.classList.add('open');
        toggle.innerHTML = '<i class="fas fa-times"></i>';
        document.body.style.overflow = 'hidden';
    } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        toggle.classList.remove('open');
        toggle.innerHTML = '<i class="fas fa-bars"></i>';
        document.body.style.overflow = '';
    }
}

// Close sidebar
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const toggle = document.querySelector('.sidebar-toggle');
    
    if (!sidebar || !toggle) return;
    
    sidebarOpen = false;
    
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    toggle.classList.remove('open');
    toggle.innerHTML = '<i class="fas fa-bars"></i>';
    document.body.style.overflow = '';
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
            const targetPanel = document.getElementById(targetTab + '-panel');
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    // Base layer cards
    document.querySelectorAll('[data-layer]').forEach(card => {
        card.addEventListener('click', () => {
            const layerType = card.dataset.layer;
            switchBaseLayer(layerType);
            
            document.querySelectorAll('[data-layer]').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        });
    });

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchLocation();
            }
        });
    }

    // Map click events
    map.on('click', function(e) {
        if (measuring) {
            addMeasurePoint(e.latlng);
        } else if (activeRoutes.length > 0) {
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
                                showRouteInfoInPanel(filteredFeatures[0]);
                                highlightEtappe(filteredFeatures[0]);
                                
                                if (isMobile) {
                                    setTimeout(() => {
                                        closeSidebar();
                                    }, 500);
                                }
                            }
                        }
                    })
                    .catch(error => {
                        console.log('Geen route info beschikbaar');
                    });
            });
        }
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

function toggleCampingLayer() {
    campingVisible = !campingVisible;
    const card = document.getElementById('camping-layer-card');
    
    if (campingVisible) {
        if (campingLayer.getLayers().length === 0) {
            loadCampingGeoJSON();
        } else {
            map.addLayer(campingLayer);
            card.classList.add('active');
            showNotification('Campings zichtbaar', 'success');
        }
    } else {
        map.removeLayer(campingLayer);
        card.classList.remove('active');
        showNotification('Campings verborgen', 'info');
    }
}

function loadCampingGeoJSON() {
    showLoadingOverlay('Campings laden...');
    
    fetch('./data/campings.geojson')
        .then(response => {
            if (!response.ok) {
                throw new Error('GeoJSON bestand niet gevonden');
            }
            return response.json();
        })
        .then(geojsonData => {
            campingLayer.clearLayers();
            
            geojsonData.features.forEach(feature => {
                const coords = feature.geometry.coordinates;
                const props = feature.properties;
                
                const popupContent = `
                    <div class="camping-popup">
                        <h4><i class="fas fa-campground"></i> ${props.name || 'Camping'}</h4>
                        ${props.operator ? `<p><strong>Beheerder:</strong> ${props.operator}</p>` : ''}
                        ${props.access ? `<p><strong>Toegang:</strong> ${props.access}</p>` : ''}
                        ${props.house ? `<p><strong>Accommodatie:</strong> ${props.house}</p>` : ''}
                        <p style="font-size: 10px; color: #666;">OSM ID: ${props.osm_id}</p>
                    </div>
                `;
                
                const marker = L.marker([coords[1], coords[0]], {
                    icon: campingIcon
                }).bindPopup(popupContent);
                
                campingLayer.addLayer(marker);
            });
            
            map.addLayer(campingLayer);
            campingVisible = true;
            
            const card = document.getElementById('camping-layer-card');
            if (card) {
                card.classList.add('active');
            }
            
            hideLoadingOverlay();
            showNotification(`${geojsonData.features.length} campings geladen`, 'success');
        })
        .catch(error => {
            hideLoadingOverlay();
            showNotification('Campings GeoJSON niet gevonden in data/campings.geojson', 'error');
        });
}

function toggleVriendenLayer() {
    vriendenVisible = !vriendenVisible;
    const card = document.getElementById('vrienden-layer-card');
    
    if (vriendenVisible) {
        if (vriendenLayer.getLayers().length === 0) {
            loadVriendenGeoJSON();
        } else {
            map.addLayer(vriendenLayer);
            card.classList.add('active');
            showNotification('Vrienden op de Fiets zichtbaar', 'success');
        }
    } else {
        map.removeLayer(vriendenLayer);
        card.classList.remove('active');
        showNotification('Vrienden op de Fiets verborgen', 'info');
    }
}

function loadVriendenGeoJSON() {
    showLoadingOverlay('Vrienden op de Fiets laden...');
    
    fetch('./data/vrienden-op-de-fiets.geojson')
        .then(response => {
            if (!response.ok) {
                throw new Error('GeoJSON bestand niet gevonden');
            }
            return response.json();
        })
        .then(geojsonData => {
            vriendenLayer.clearLayers();
            
            geojsonData.features.forEach(feature => {
                const coords = feature.geometry.coordinates;
                const props = feature.properties;
                
                // Format availability dates
                let availabilityText = '';
                if (props.nietbeschikbaarvanaf || props.nietbeschikbaartm) {
                    const van = props.nietbeschikbaarvanaf ? new Date(props.nietbeschikbaarvanaf).toLocaleDateString('nl-NL') : '';
                    const tm = props.nietbeschikbaartm ? new Date(props.nietbeschikbaartm).toLocaleDateString('nl-NL') : '';
                    
                    if (van && tm) {
                        availabilityText = `<p><strong>Niet beschikbaar:</strong> ${van} - ${tm}</p>`;
                    } else if (van) {
                        availabilityText = `<p><strong>Niet beschikbaar vanaf:</strong> ${van}</p>`;
                    } else if (tm) {
                        availabilityText = `<p><strong>Niet beschikbaar tot:</strong> ${tm}</p>`;
                    }
                }
                
                // Format room information
                let roomInfo = '';
                if (props.verblijftype) {
                    roomInfo += `<p><strong>Type:</strong> ${props.verblijftype}</p>`;
                }
                if (props.kamers) {
                    roomInfo += `<p><strong>Kamers:</strong> ${props.kamers}</p>`;
                }
                if (props.eenpersoonsbedden !== undefined && props.eenpersoonsbedden !== null) {
                    roomInfo += `<p><strong>Eenpersoonsbedden:</strong> ${props.eenpersoonsbedden}</p>`;
                }
                
                const popupContent = `
                    <div class="vrienden-popup">
                        <h4><i class="fas fa-bicycle"></i> ${props.name || props.naam || 'Vrienden op de Fiets'}</h4>
                        ${props.adres || props.address ? `<p><strong>Adres:</strong> ${props.adres || props.address}</p>` : ''}
                        ${props.plaats || props.city ? `<p><strong>Plaats:</strong> ${props.plaats || props.city}</p>` : ''}
                        
                        ${roomInfo ? `
                            <div class="vrienden-accommodation">
                                <h5><i class="fas fa-bed"></i> Accommodatie</h5>
                                ${roomInfo}
                            </div>
                        ` : ''}
                        
                        ${availabilityText ? `
                            <div class="vrienden-availability">
                                <h5><i class="fas fa-calendar-times"></i> Beschikbaarheid</h5>
                                ${availabilityText}
                            </div>
                        ` : ''}
                        
                        ${props.telefoon || props.phone ? `<p><strong>Telefoon:</strong> ${props.telefoon || props.phone}</p>` : ''}
                        ${props.email ? `<p><strong>Email:</strong> ${props.email}</p>` : ''}
                        ${props.website ? `<p><strong>Website:</strong> <a href="${props.website}" target="_blank">${props.website}</a></p>` : ''}
                        ${props.beschrijving || props.description ? `<div class="vrienden-description">${props.beschrijving || props.description}</div>` : ''}
                        <p style="font-size: 10px; color: #666; margin-top: 8px;">Vrienden op de Fiets locatie</p>
                    </div>
                `;
                
                const marker = L.marker([coords[1], coords[0]], {
                    icon: vriendenIcon
                }).bindPopup(popupContent);
                
                vriendenLayer.addLayer(marker);
            });
            
            map.addLayer(vriendenLayer);
            vriendenVisible = true;
            
            const card = document.getElementById('vrienden-layer-card');
            if (card) {
                card.classList.add('active');
            }
            
            hideLoadingOverlay();
            showNotification(`${geojsonData.features.length} Vrienden op de Fiets locaties geladen`, 'success');
        })
        .catch(error => {
            hideLoadingOverlay();
            showNotification('Vrienden op de Fiets GeoJSON niet gevonden in data/vrienden-op-de-fiets.geojson', 'error');
        });
}

// ============ ROUTE FUNCTIONALITY ============

// Simplified route adding function
function addLAWRoute(routeValue, routeFilter) {
    const routeName = `${routeValue} - ${routeFilter}`;
    const layerName = 'landelijke-wandelroutes';
    
    // Check if route already exists
    const existingRoute = activeRoutes.find(route => route.filter === routeFilter);
    if (existingRoute) {
        showNotification(`Route "${routeName}" is al toegevoegd!`, 'warning');
        return;
    }
    
    const routeData = {
        id: Date.now(),
        name: routeName,
        type: 'law',
        filter: routeFilter,
        layerName: layerName,
        value: routeValue
    };
    
    // Add visual feedback
    const routeCard = document.querySelector(`[data-route="${routeValue}"]`);
    if (routeCard) {
        routeCard.classList.add('added');
        routeCard.classList.add('route-card-added');
        
        // Update action text
        const action = routeCard.querySelector('.route-card-action');
        if (action) {
            action.innerHTML = '<i class="fas fa-check"></i> Toegevoegd';
        }
        
        setTimeout(() => {
            routeCard.classList.remove('route-card-added');
        }, 600);
    }
    
    activeRoutes.push(routeData);
    addRouteToMap(routeData);
    updateActiveRoutesDisplay();
    
    // Close sidebar on mobile
    if (isMobile) {
        setTimeout(() => closeSidebar(), 1000);
    }
}

function addRouteToMap(routeData) {
    const xmlFilter = `<Filter><PropertyIsEqualTo><PropertyName>lawnaam</PropertyName><Literal>${routeData.filter}</Literal></PropertyIsEqualTo></Filter>`;
    
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

function showRouteInfoInPanel(feature) {
    const props = feature.properties;
    
    // Calculate route distance if geometry is available
    let routeDistance = 0;
    let routeDistanceText = 'Onbekend';
    
    if (feature.geometry && feature.geometry.coordinates) {
        let coordinates;
        
        if (feature.geometry.type === 'LineString') {
            coordinates = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        } else if (feature.geometry.type === 'MultiLineString') {
            coordinates = feature.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
        }
        
        if (coordinates && coordinates.length > 1) {
            for (let i = 1; i < coordinates.length; i++) {
                const prevPoint = L.latLng(coordinates[i-1]);
                const currentPoint = L.latLng(coordinates[i]);
                routeDistance += prevPoint.distanceTo(currentPoint);
            }
            
            // Convert to kilometers
            const distanceKm = routeDistance / 1000;
            routeDistanceText = distanceKm < 1 ? 
                `${Math.round(routeDistance)} meter` : 
                `${distanceKm.toFixed(1)} km`;
        }
    }
    
    // Estimate walking time (4 km/h average)
    let walkingTimeText = 'Onbekend';
    if (routeDistance > 0) {
        const walkingTimeHours = (routeDistance / 1000) / 4;
        const hours = Math.floor(walkingTimeHours);
        const minutes = Math.round((walkingTimeHours - hours) * 60);
        
        if (hours > 0) {
            walkingTimeText = `${hours}u ${minutes}min`;
        } else {
            walkingTimeText = `${minutes} minuten`;
        }
    }
    
    const panelContent = `
        <div class="route-info-card">
            <div class="route-info-header">
                <div class="route-info-title">
                    <i class="fas fa-route"></i>
                    ${props.lawnaam || 'LAW Route'}
                </div>
                <div class="route-info-badge">
                    <i class="fas fa-hiking"></i>
                    Wandelroute
                </div>
            </div>
            
            <div class="route-stats-grid">
                <div class="route-stat">
                    <div class="stat-icon">
                        <i class="fas fa-ruler-horizontal"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${routeDistanceText}</div>
                        <div class="stat-label">Totale afstand</div>
                    </div>
                </div>
                
                <div class="route-stat">
                    <div class="stat-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${walkingTimeText}</div>
                        <div class="stat-label">Looptijd (4 km/u)</div>
                    </div>
                </div>
            </div>
            
            ${props.etappe || props.etappnaam ? `
                <div class="route-info-section">
                    <h4><i class="fas fa-map-marker-alt"></i> Etappe Informatie</h4>
                    ${props.etappe ? `<p><strong>Etappe nummer:</strong> ${props.etappe}</p>` : ''}
                    ${props.etappnaam ? `<p><strong>Etappe naam:</strong> ${props.etappnaam}</p>` : ''}
                </div>
            ` : ''}
            
            ${props.van || props.naar ? `
                <div class="route-info-section">
                    <h4><i class="fas fa-route"></i> Route Traject</h4>
                    ${props.van ? `<p><strong>Startpunt:</strong> ${props.van}</p>` : ''}
                    ${props.naar ? `<p><strong>Eindpunt:</strong> ${props.naar}</p>` : ''}
                    ${props.van && props.naar ? `
                        <div class="route-direction">
                            <i class="fas fa-long-arrow-alt-right"></i>
                            <span>${props.van} → ${props.naar}</span>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            
            <div class="route-info-actions">
                <button class="highlight-btn" onclick="clearEtappeHighlight()">
                    <i class="fas fa-eye-slash"></i>
                    Verberg highlight
                </button>
                <button class="zoom-btn" onclick="zoomToEtappe()">
                    <i class="fas fa-search-plus"></i>
                    Zoom naar etappe
                </button>
            </div>
            
            <div class="route-info-tip">
                <i class="fas fa-lightbulb"></i>
                <span>Tip: Klik op een andere route lijn om meer etappes te bekijken</span>
            </div>
        </div>
    `;
    
    document.getElementById('routeInfoPanel').innerHTML = panelContent;
    
    // Store current feature for zoom functionality
    window.currentEtappeFeature = feature;
    
    switchToRouteInfoTab();
}

function switchToRouteInfoTab() {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));

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
let campingClusterGroup;
let vriendenLayer;
let vriendenClusterGroup;
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

        // Initialize simple layer groups (clustering will be added later if library loads)
        campingLayer = L.layerGroup();
        vriendenLayer = L.layerGroup();
        
        // Try to initialize clustering if available
        initializeClustering();

        setupEventListeners();
        setupTabNavigation();
        setupMobileFeatures();
        
        console.log('Map initialized successfully');
    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

// Initialize clustering if library is available
function initializeClustering() {
    if (typeof L.markerClusterGroup !== 'undefined') {
        console.log('MarkerCluster library loaded, initializing clustering...');
        
        try {
            campingClusterGroup = L.markerClusterGroup({
                maxClusterRadius: 50,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                iconCreateFunction: function(cluster) {
                    const count = cluster.getChildCount();
                    let size = 'small';
                    if (count > 10) size = 'medium';
                    if (count > 25) size = 'large';
                    
                    return L.divIcon({
                        html: `<div class="cluster-inner camping-cluster">${count}</div>`,
                        className: `marker-cluster marker-cluster-${size}`,
                        iconSize: L.point(40, 40)
                    });
                }
            });

            vriendenClusterGroup = L.markerClusterGroup({
                maxClusterRadius: 50,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                iconCreateFunction: function(cluster) {
                    const count = cluster.getChildCount();
                    let size = 'small';
                    if (count > 10) size = 'medium';
                    if (count > 25) size = 'large';
                    
                    return L.divIcon({
                        html: `<div class="cluster-inner vrienden-cluster">${count}</div>`,
                        className: `marker-cluster marker-cluster-${size}`,
                        iconSize: L.point(40, 40)
                    });
                }
            });
            
            console.log('Clustering groups created successfully');
            
            // Update existing cluster groups if they were using fallback
            if (campingVisible && campingClusterGroup !== campingLayer) {
                console.log('Updating camping layer to use clustering');
                // Transfer markers from simple layer to cluster group if needed
                campingLayer.eachLayer(function(layer) {
                    campingClusterGroup.addLayer(layer);
                });
                map.removeLayer(campingLayer);
                map.addLayer(campingClusterGroup);
            }
            
            if (vriendenVisible && vriendenClusterGroup !== vriendenLayer) {
                console.log('Updating vrienden layer to use clustering');
                // Transfer markers from simple layer to cluster group if needed
                vriendenLayer.eachLayer(function(layer) {
                    vriendenClusterGroup.addLayer(layer);
                });
                map.removeLayer(vriendenLayer);
                map.addLayer(vriendenClusterGroup);
            }
            
        } catch (error) {
            console.error('Error initializing clustering:', error);
            // Fallback to simple layers
            campingClusterGroup = campingLayer;
            vriendenClusterGroup = vriendenLayer;
        }
    } else {
        console.log('MarkerCluster library not available, using simple layer groups');
        campingClusterGroup = campingLayer;
        vriendenClusterGroup = vriendenLayer;
    }
}

// Setup mobile-specific features
function setupMobileFeatures() {
    // Always create overlay for mobile sidebar (might be needed after resize)
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', closeSidebar);
        document.body.appendChild(overlay);
    }
    
    // Auto-close sidebar when selecting routes on mobile
    const originalShowSelectedRoute = window.showSelectedRoute;
    if (originalShowSelectedRoute) {
        window.showSelectedRoute = function() {
            originalShowSelectedRoute();
            if (isMobile) {
                closeSidebar();
            }
        };
    }
    
    // Prevent map interactions when sidebar is open on mobile
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        });
        
        sidebar.addEventListener('touchmove', function(e) {
            e.stopPropagation();
        });
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
        
        console.log('Window resized, isMobile:', isMobile, 'wasMobile:', wasMobile);
        
        if (wasMobile && !isMobile) {
            // Switched from mobile to desktop
            closeSidebar();
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.style.left = '';
                sidebar.classList.remove('open');
            }
        } else if (!wasMobile && isMobile) {
            // Switched from desktop to mobile
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
    
    // Create overlay if it doesn't exist
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', closeSidebar);
        document.body.appendChild(overlay);
        console.log('Created overlay');
    }
    
    if (!sidebar || !toggle) {
        console.error('Sidebar elements not found', { sidebar: !!sidebar, toggle: !!toggle });
        return;
    }
    
    sidebarOpen = !sidebarOpen;
    console.log('New sidebarOpen state:', sidebarOpen);
    
    if (sidebarOpen) {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        toggle.classList.add('open');
        toggle.innerHTML = '<i class="fas fa-times"></i>';
        document.body.style.overflow = 'hidden';
        console.log('Sidebar opened');
    } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        toggle.classList.remove('open');
        toggle.innerHTML = '<i class="fas fa-bars"></i>';
        document.body.style.overflow = '';
        console.log('Sidebar closed');
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
            // Check for route info
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
                                
                                // Auto-close sidebar on mobile after showing route info
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
        if (campingClusterGroup.getLayers().length === 0) {
            loadCampingGeoJSON();
        } else {
            map.addLayer(campingClusterGroup);
            card.classList.add('active');
            showNotification('Campings zichtbaar', 'success');
        }
    } else {
        map.removeLayer(campingClusterGroup);
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
            console.log('Loading', geojsonData.features.length, 'camping markers into cluster group');
            campingClusterGroup.clearLayers();
            
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
                
                campingClusterGroup.addLayer(marker);
            });
            
            console.log('Added', campingClusterGroup.getLayers().length, 'markers to camping cluster group');
            map.addLayer(campingClusterGroup);
            campingVisible = true;
            
            const card = document.getElementById('camping-layer-card');
            if (card) {
                card.classList.add('active');
            }
            
            hideLoadingOverlay();
            showNotification(`${geojsonData.features.length} campings geladen (geclusterd)`, 'success');
        })
        .catch(error => {
            hideLoadingOverlay();
            showNotification('Campings GeoJSON niet gevonden in data/campings.geojson', 'error');
            console.error('Error loading campings:', error);
        });
}

function toggleVriendenLayer() {
    vriendenVisible = !vriendenVisible;
    const card = document.getElementById('vrienden-layer-card');
    
    if (vriendenVisible) {
        if (vriendenClusterGroup.getLayers().length === 0) {
            loadVriendenGeoJSON();
        } else {
            map.addLayer(vriendenClusterGroup);
            card.classList.add('active');
            showNotification('Vrienden op de Fiets zichtbaar', 'success');
        }
    } else {
        map.removeLayer(vriendenClusterGroup);
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
            console.log('Loading', geojsonData.features.length, 'vrienden markers into cluster group');
            vriendenClusterGroup.clearLayers();
            
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
                
                vriendenClusterGroup.addLayer(marker);
            });
            
            console.log('Added', vriendenClusterGroup.getLayers().length, 'markers to vrienden cluster group');
            map.addLayer(vriendenClusterGroup);
            vriendenVisible = true;
            
            const card = document.getElementById('vrienden-layer-card');
            if (card) {
                card.classList.add('active');
            }
            
            hideLoadingOverlay();
            showNotification(`${geojsonData.features.length} Vrienden op de Fiets locaties geladen (geclusterd)`, 'success');
        })
        .catch(error => {
            hideLoadingOverlay();
            showNotification('Vrienden op de Fiets GeoJSON niet gevonden in data/vrienden-op-de-fiets.geojson', 'error');
            console.error('Error loading vrienden:', error);
        });
}

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
    const layerName = 'landelijke-wandelroutes';
    
    const existingRoute = activeRoutes.find(route => route.filter === routeFilter);
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
    resetRouteForm();
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
            
            ${props.oppervlak || props.verharding ? `
                <div class="route-info-section">
                    <h4><i class="fas fa-road"></i> Wegtype & Ondergrond</h4>
                    ${props.oppervlak ? `<p><strong>Ondergrond:</strong> ${props.oppervlak}</p>` : ''}
                    ${props.verharding ? `<p><strong>Verharding:</strong> ${props.verharding}</p>` : ''}
                </div>
            ` : ''}
            
            ${props.markering || props.bewegwijzering ? `
                <div class="route-info-section">
                    <h4><i class="fas fa-map-signs"></i> Bewegwijzering</h4>
                    ${props.markering ? `<p><strong>Markering:</strong> ${props.markering}</p>` : ''}
                    ${props.bewegwijzering ? `<p><strong>Bewegwijzering:</strong> ${props.bewegwijzering}</p>` : ''}
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
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    
    const infoTab = document.querySelector('[data-tab="info"]');
    const infoPanel = document.getElementById('info-panel');
    
    if (infoTab) infoTab.classList.add('active');
    if (infoPanel) infoPanel.classList.add('active');
    
    // On mobile, open sidebar to show the info
    if (isMobile && !sidebarOpen) {
        toggleSidebar();
    }
}

function highlightEtappe(feature) {
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
                opacity: 0.9,
                zIndex: 1000
            });
            
            highlightLayer.addLayer(highlightLine);
            addKilometerMarkers(coordinates);
            
            if (coordinates.length >= 2) {
                const startPoint = coordinates[0];
                const endPoint = coordinates[coordinates.length - 1];
                
                const startMarker = L.circleMarker(startPoint, {
                    radius: 18,
                    color: '#ffffff',
                    fillColor: '#059669',
                    fillOpacity: 1,
                    weight: 4,
                    zIndex: 1003
                }).bindTooltip('🚩 START', { 
                    permanent: true, 
                    direction: 'top',
                    className: 'start-tooltip',
                    offset: [0, -25]
                });
                
                const endMarker = L.circleMarker(endPoint, {
                    radius: 18,
                    color: '#ffffff',
                    fillColor: '#dc2626',
                    fillOpacity: 1,
                    weight: 4,
                    zIndex: 1003
                }).bindTooltip('🏁 FINISH', { 
                    permanent: true, 
                    direction: 'top',
                    className: 'end-tooltip',
                    offset: [0, -25]
                });
                
                highlightLayer.addLayer(startMarker);
                highlightLayer.addLayer(endMarker);
            }
        }
    }
}

function addKilometerMarkers(coordinates) {
    if (coordinates.length < 2) return;
    
    let totalDistance = 0;
    let kmCount = 1;
    
    for (let i = 1; i < coordinates.length; i++) {
        const prevPoint = L.latLng(coordinates[i-1]);
        const currentPoint = L.latLng(coordinates[i]);
        const segmentDistance = prevPoint.distanceTo(currentPoint);
        
        totalDistance += segmentDistance;
        
        while (kmCount * 1000 <= totalDistance) {
            const kmPosition = interpolatePosition(coordinates, kmCount * 1000);
            
            if (kmPosition) {
                const kmMarker = L.circleMarker(kmPosition, {
                    radius: 12,
                    color: '#ffffff',
                    fillColor: '#3b82f6',
                    fillOpacity: 1,
                    weight: 3,
                    zIndex: 1002
                }).bindTooltip(`${kmCount}km`, { 
                    permanent: true, 
                    direction: 'center',
                    className: 'km-tooltip-prominent',
                    offset: [0, 0]
                });
                
                highlightLayer.addLayer(kmMarker);
            }
            
            kmCount++;
        }
    }
}

function interpolatePosition(coordinates, targetDistance) {
    let currentDistance = 0;
    
    for (let i = 1; i < coordinates.length; i++) {
        const prevPoint = L.latLng(coordinates[i-1]);
        const currentPoint = L.latLng(coordinates[i]);
        const segmentDistance = prevPoint.distanceTo(currentPoint);
        
        if (currentDistance + segmentDistance >= targetDistance) {
            const remainingDistance = targetDistance - currentDistance;
            const ratio = remainingDistance / segmentDistance;
            
            const lat = coordinates[i-1][0] + (coordinates[i][0] - coordinates[i-1][0]) * ratio;
            const lng = coordinates[i-1][1] + (coordinates[i][1] - coordinates[i-1][1]) * ratio;
            
            return [lat, lng];
        }
        
        currentDistance += segmentDistance;
    }
    
    return null;
}

// Zoom to current etappe
function clearEtappeHighlight() {
    highlightLayer.clearLayers();
    window.currentEtappeFeature = null;
    document.getElementById('routeInfoPanel').innerHTML = '<div class="empty-state">Geen etappe geselecteerd</div>';
    showNotification('Highlight verwijderd', 'info');
}

function updateActiveRoutesDisplay() {
    const container = document.getElementById('activeRoutesDisplay');
    
    if (activeRoutes.length === 0) {
        container.innerHTML = '<div class="empty-state">Klik op een route card hierboven om deze toe te voegen</div>';
        
        // Reset all route cards
        document.querySelectorAll('.route-card').forEach(card => {
            card.classList.remove('added');
            const action = card.querySelector('.route-card-action');
            if (action) {
                action.innerHTML = '<i class="fas fa-plus"></i> Toevoegen';
            }
        });
        return;
    }
    
    container.innerHTML = activeRoutes.map(route => `
        <div class="active-route-item">
            <div class="active-route-info">
                <h4>${route.name}</h4>
                <p>Lange Afstand Wandelpad • Klik op route voor details</p>
            </div>
            <button class="route-remove-btn" onclick="removeRoute(${route.id})" title="Route verwijderen">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function removeRoute(routeId) {
    const routeIndex = activeRoutes.findIndex(r => r.id === routeId);
    if (routeIndex !== -1) {
        const route = activeRoutes[routeIndex];
        
        // Remove visual feedback from route card
        const routeCard = document.querySelector(`[data-route="${route.value}"]`);
        if (routeCard) {
            routeCard.classList.remove('added');
            const action = routeCard.querySelector('.route-card-action');
            if (action) {
                action.innerHTML = '<i class="fas fa-plus"></i> Toevoegen';
            }
        }
        
        if (route.layer) {
            map.removeLayer(route.layer);
        }
        
        activeRoutes.splice(routeIndex, 1);
        updateActiveRoutesDisplay();
        
        showNotification(`Route "${route.name}" verwijderd`, 'info');
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
    resetRouteForm();
}

function resetRouteForm() {
    document.getElementById('routeTypeSelect').value = '';
    document.getElementById('specificRouteSelect').innerHTML = '<option value="">-- Eerst route type kiezen --</option>';
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'none';
}

// ============ TOOLS & UTILITY FUNCTIONS ============

// Toggle measure from map control button
function toggleMeasureFromMap() {
    measuring = !measuring;
    const btn = document.getElementById('measureControlBtn');
    
    if (measuring) {
        btn.classList.add('active');
        btn.title = 'Stop meting - Klik punten op de kaart';
        btn.innerHTML = '<i class="fas fa-stop"></i>';
        map.getContainer().style.cursor = 'crosshair';
        showNotification('Afstand meten geactiveerd - Klik punten op de kaart', 'info');
        
        // Update sidebar button if it exists
        const sidebarBtn = document.getElementById('measureBtn');
        if (sidebarBtn) {
            sidebarBtn.innerHTML = '<i class="fas fa-stop"></i> Stop meting';
            sidebarBtn.classList.add('active');
        }
    } else {
        btn.classList.remove('active');
        btn.title = 'Afstand meten';
        btn.innerHTML = '<i class="fas fa-ruler-combined"></i>';
        map.getContainer().style.cursor = '';
        showNotification('Afstand meten gestopt', 'info');
        
        // Update sidebar button if it exists
        const sidebarBtn = document.getElementById('measureBtn');
        if (sidebarBtn) {
            sidebarBtn.innerHTML = '<i class="fas fa-ruler-combined"></i> Start meting';
            sidebarBtn.classList.remove('active');
        }
    }
}

// Legacy function for sidebar (if needed)
function toggleMeasure() {
    toggleMeasureFromMap();
}

function addMeasurePoint(latlng) {
    const marker = L.circleMarker(latlng, {
        radius: 8,
        color: '#ffffff',
        fillColor: '#f59e0b',
        fillOpacity: 1,
        weight: 3,
        zIndex: 1001
    }).addTo(map);

    // Add point number
    const pointNumber = measureMarkers.filter(item => item.getLatLng).length + 1;
    marker.bindTooltip(`${pointNumber}`, { 
        permanent: true, 
        direction: 'center',
        className: 'measure-point-tooltip',
        offset: [0, 0]
    });

    measureMarkers.push(marker);

    if (measureMarkers.length > 1) {
        // Find the previous actual marker (not label)
        let prevMarker = null;
        for (let i = measureMarkers.length - 2; i >= 0; i--) {
            if (measureMarkers[i].getLatLng && measureMarkers[i].options.fillColor === '#f59e0b') {
                prevMarker = measureMarkers[i];
                break;
            }
        }

        if (prevMarker) {
            const segmentDistance = prevMarker.getLatLng().distanceTo(latlng);
            const line = L.polyline([prevMarker.getLatLng(), latlng], {
                color: '#f59e0b',
                weight: 4,
                opacity: 0.8,
                zIndex: 1000
            }).addTo(map);

            measureMarkers.push(line);

            // Calculate midpoint for distance label
            const midPoint = [
                (prevMarker.getLatLng().lat + latlng.lat) / 2,
                (prevMarker.getLatLng().lng + latlng.lng) / 2
            ];
            
            const segmentDistanceKm = segmentDistance / 1000;
            const distanceText = segmentDistanceKm < 1 ? 
                `${Math.round(segmentDistance)} m` : 
                `${segmentDistanceKm.toFixed(2)} km`;

            const distanceLabel = L.marker(midPoint, {
                icon: L.divIcon({
                    className: 'distance-label-container',
                    html: `<div class="distance-text">${distanceText}</div>`,
                    iconSize: [null, null], // Auto-size
                    iconAnchor: [null, null] // Auto-anchor
                }),
                zIndex: 1002,
                interactive: false // Make non-interactive so clicks go through to map
            }).addTo(map);

            measureMarkers.push(distanceLabel);

            totalDistance += segmentDistance / 1000;
            updateDistanceDisplay();
            updateTotalDistanceOnMap();
        }
    } else {
        // First point - show starting indicator
        updateTotalDistanceOnMap();
    }
}

function updateTotalDistanceOnMap() {
    // Remove existing total distance marker
    if (window.totalDistanceMarker) {
        map.removeLayer(window.totalDistanceMarker);
    }
    
    if (measureMarkers.length > 0) {
        // Get last actual marker (not label)
        let lastMarker = null;
        for (let i = measureMarkers.length - 1; i >= 0; i--) {
            if (measureMarkers[i].getLatLng && measureMarkers[i].options.fillColor === '#f59e0b') {
                lastMarker = measureMarkers[i];
                break;
            }
        }
        
        if (lastMarker) {
            const totalText = totalDistance < 1 ? 
                `Totaal: ${Math.round(totalDistance * 1000)} m` : 
                `Totaal: ${totalDistance.toFixed(2)} km`;

            // Position total slightly offset from last point
            const offsetLat = lastMarker.getLatLng().lat + 0.002; // Small offset north
            const offsetLng = lastMarker.getLatLng().lng;

            window.totalDistanceMarker = L.marker([offsetLat, offsetLng], {
                icon: L.divIcon({
                    className: 'total-distance-label-container',
                    html: `<div class="total-distance-text">${totalText}</div>`,
                    iconSize: [null, null], // Auto-size
                    iconAnchor: [null, null] // Auto-anchor
                }),
                zIndex: 1003,
                interactive: false // Make non-interactive
            }).addTo(map);
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
    
    // Reset map control button
    const mapBtn = document.getElementById('measureControlBtn');
    if (mapBtn) {
        mapBtn.classList.remove('active');
        mapBtn.title = 'Afstand meten';
        mapBtn.innerHTML = '<i class="fas fa-ruler-combined"></i>';
    }
    
    // Reset sidebar button if it exists
    const sidebarBtn = document.getElementById('measureBtn');
    if (sidebarBtn) {
        sidebarBtn.innerHTML = '<i class="fas fa-ruler-combined"></i> Start meting';
        sidebarBtn.classList.remove('active');
    }
    
    measuring = false;
    map.getContainer().style.cursor = '';
    showNotification('Alle metingen gewist', 'success');
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
                
                // Close sidebar on mobile after search
                if (isMobile) {
                    closeSidebar();
                }
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
    
    // Close sidebar on mobile
    if (isMobile) {
        closeSidebar();
    }
}

function getCurrentLocation() {
    if (navigator.geolocation) {
        // Close sidebar on mobile when using location
        if (isMobile) {
            closeSidebar();
        }
        
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

function fitToCampings() {
    if (campingClusterGroup.getLayers().length > 0) {
        map.fitBounds(campingClusterGroup.getBounds(), { padding: [20, 20] });
        
        // Close sidebar on mobile
        if (isMobile) {
            closeSidebar();
        }
    } else {
        showNotification('Geen campings geladen', 'warning');
    }
}

function fitToVrienden() {
    if (vriendenClusterGroup.getLayers().length > 0) {
        map.fitBounds(vriendenClusterGroup.getBounds(), { padding: [20, 20] });
        
        // Close sidebar on mobile
        if (isMobile) {
            closeSidebar();
        }
    } else {
        showNotification('Geen Vrienden op de Fiets locaties geladen', 'warning');
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

function showLoadingOverlay(text = 'Laden...') {
    hideLoadingOverlay();
    
    loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner-large"></div>
            <div class="loading-text">${text}</div>
        </div>
    `;
    
    document.body.appendChild(loadingOverlay);
}

function hideLoadingOverlay() {
    if (loadingOverlay && loadingOverlay.parentNode) {
        loadingOverlay.parentNode.removeChild(loadingOverlay);
        loadingOverlay = null;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing...');
    
    // Set initial mobile state
    isMobile = window.innerWidth <= 768;
    
    initMap();
    
    // Handle back button on mobile
    if (isMobile) {
        window.addEventListener('popstate', function(e) {
            if (sidebarOpen) {
                closeSidebar();
                history.pushState(null, null, location.href);
            }
        });
        
        // Push initial state for back button handling
        history.pushState(null, null, location.href);
    }
});

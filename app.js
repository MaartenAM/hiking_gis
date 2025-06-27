function showNearbyOVStops(latlng, radius = 2000) {
    if (!ovStopsVisible) {
        showNotification('Activeer eerst de OV laag', 'warning');
        return;
    }
    
    if (!ovStopsData) {
        showNotification('OV data nog niet geladen', 'warning');
        return;
    }
    
    const nearbyStops = [];
    
    // Search in raw data instead of current markers for better coverage
    ovStopsData.features.forEach(feature => {
        const coords = feature.geometry.coordinates;
        const stopLatLng = L.latLng(coords[1], coords[0]);
        const distance = latlng.distanceTo(stopLatLng);
        
        if (distance <= radius) {
            nearbyStops.push({
                feature: feature,
                distance: distance,
                latlng: stopLatLng
            });
        }
    });
    
    nearbyStops.sort((a, b) => a.distance - b.distance);
    
    if (nearbyStops.length > 0) {
        showNearbyOVPanel(nearbyStops.slice(0, 8), latlng);
        
        // Temporarily add markers for nearby stops if not in viewport
        nearbyStops.slice(0, 5).forEach(stop => {
            const marker = createOVMarker(stop.feature);
            marker.setStyle && marker.setStyle({
                color: '#ff7b54',
                weight: 4,
                opacity: 1
            });
            
            // Add to map temporarily
            ovStopsClusterGroup.addLayer(marker);
            
            // Remove after 10 seconds
            setTimeout(() => {
                ovStopsClusterGroup.removeLayer(marker);
            }, 10000);
        });
    } else {
        showNotification('Geen openbaar vervoer in de buurt (binnen 2km)', 'info');
    }
}

function showNearbyOVPanel(nearbyStops, centerPoint) {
    const panelContent = `
        <div class="ov-analysis-section">
            <div class="section-title">
                <i class="fas fa-bus"></i>
                Openbaar Vervoer in de Buurt
            </div>
            <div class="route-info-badge" style="margin-bottom: 16px;">
                <i class="fas fa-map-marker-alt"></i>
                ${nearbyStops.length} halte(s) binnen 2km
            </div>
            
            <div class="ov-stops-list">
                ${nearbyStops.map(stop => {
                    const distance = (stop.distance / 1000).toFixed(1);
                    const stopName = stop.feature.properties.stop_name || 'Onbekende halte';
                    const stopType = stop.feature.properties.stop_type || 'bus';
                    const icon = stopType === 'train' ? 'train' : 'bus';
                    
                    return `
                        <div class="ov-stop-item" onclick="zoomToLocation(${stop.latlng.lat}, ${stop.latlng.lng})">
                            <div class="ov-stop-info">
                                <h5><i class="fas fa-${icon}"></i> ${stopName}</h5>
                                <p><i class="fas fa-walking"></i> ${distance} km • ca. ${Math.round(distance * 12)} min lopen</p>
                            </div>
                            <div class="ov-stop-action">
                                <i class="fas fa-arrow-right"></i>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="route-info-actions">
                <button class="highlight-btn" onclick="clearOVHighlight()">
                    <i class="fas fa-eye-slash"></i>
                    Verberg highlights
                </button>
                <button class="zoom-btn" onclick="zoomToNearbyOV()">
                    <i class="fas fa-search-plus"></i>
                    Zoom naar OV
                </button>
            </div>
        </div>
    `;
    
    // Add to existing route info instead of replacing
    const existingContent = document.getElementById('routeInfoPanel').innerHTML;
    if (existingContent.includes('empty-state')) {
        document.getElementById('routeInfoPanel').innerHTML = panelContent;
    } else {
        document.getElementById('routeInfoPanel').innerHTML = existingContent + panelContent;
    }
    
    switchToRouteInfoTab();
    window.currentNearbyOV = nearbyStops;
}

function zoomToLocation(lat, lng) {
    map.setView([lat, lng], 16);
    if (isMobile) {
        closeSidebar();
    }
}

function clearOVHighlight() {
    const panel = document.getElementById('routeInfoPanel');
    const ovSection = panel.querySelector('.ov-analysis-section');
    if (ovSection) {
        ovSection.remove();
    }
    showNotification('OV highlights verwijderd', 'info');
}

function zoomToNearbyOV() {
    if (window.currentNearbyOV && window.currentNearbyOV.length > 0) {
        const bounds = L.latLngBounds(window.currentNearbyOV.map(stop => stop.latlng));
        map.fitBounds(bounds, { padding: [20, 20] });
        
        if (isMobile) {
            closeSidebar();
        }
    }
}

// ============ UTILITY FUNCTIONS ============

function planRouteToStop(lat, lng) {
    const url = `https://9292.nl/reisadvies/naar/${lat},${lng}`;
    window.open(url, '_blank');
}

function findNearestOVStops() {
    if (!ovStopsVisible) {
        showNotification('Activeer eerst de OV laag', 'warning');
        return;
    }
    
    const center = map.getCenter();
    showNearbyOVStops(center, 5000);
}

function planMultiModalRoute() {
    window.open('https://9292.nl', '_blank');
}

function fitToOVStops() {
    if (!ovStopsData || ovStopsData.features.length === 0) {
        showNotification('Geen OV haltes geladen', 'warning');
        return;
    }
    
    // Create bounds from all OV data
    const coordinates = ovStopsData.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
    const bounds = L.latLngBounds(coordinates);
    map.fitBounds(bounds, { padding: [20, 20] });
    
    if (isMobile) {
        closeSidebar();
    }
}

function fitToCampings() {
    if (!campingData || campingData.features.length === 0) {
        showNotification('Geen campings geladen', 'warning');
        return;
    }
    
    const coordinates = campingData.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
    const bounds = L.latLngBounds(coordinates);
    map.fitBounds(bounds, { padding: [20, 20] });
    
    if (isMobile) {
        closeSidebar();
    }
}

function fitToVrienden() {
    if (!vriendenData || vriendenData.features.length === 0) {
        showNotification('Geen Vrienden op de Fiets locaties geladen', 'warning');
        return;
    }
    
    const coordinates = vriendenData.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
    const bounds = L.latLngBounds(coordinates);
    map.fitBounds(bounds, { padding: [20, 20] });
    
    if (isMobile) {
        closeSidebar();
    }
}

// ============ SETUP FUNCTIONS (UNCHANGED FROM PREVIOUS) ============

function setupMobileFeatures() {
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', closeSidebar);
        document.body.appendChild(overlay);
    }
    
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        });
        
        sidebar.addEventListener('touchmove', function(e) {
            e.stopPropagation();
        });
    }
    
    window.addEventListener('orientationchange', function() {
        setTimeout(function() {
            map.invalidateSize();
            isMobile = window.innerWidth <= 768;
        }, 100);
    });
    
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

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    let overlay = document.querySelector('.sidebar-overlay');
    const toggle = document.querySelector('.sidebar-toggle');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', closeSidebar);
        document.body.appendChild(overlay);
    }
    
    if (!sidebar || !toggle) return;
    
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
                                
                                // Show nearby OV stops
                                if (ovStopsVisible) {
                                    setTimeout(() => {
                                        showNearbyOVStops(e.latlng);
                                    }, 500);
                                }
                                
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

function switchBaseLayer(layerType) {
    if (baseLayers[activeBaseLayer]) {
        map.removeLayer(baseLayers[activeBaseLayer]);
    }
    
    if (baseLayers[layerType]) {
        baseLayers[layerType].addTo(map);
        activeBaseLayer = layerType;
    }
}

// ============ ROUTE FUNCTIONALITY (UNCHANGED) ============

function addLAWRoute(routeValue, routeFilter) {
    const routeName = `${routeValue} - ${routeFilter}`;
    const layerName = 'landelijke-wandelroutes';
    
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
    
    const routeCard = document.querySelector(`[data-route="${routeValue}"]`);
    if (routeCard) {
        routeCard.classList.add('added');
        routeCard.classList.add('route-card-added');
        
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
            
            const distanceKm = routeDistance / 1000;
            routeDistanceText = distanceKm < 1 ? 
                `${Math.round(routeDistance)} meter` : 
                `${distanceKm.toFixed(1)} km`;
        }
    }
    
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

function clearEtappeHighlight() {
    highlightLayer.clearLayers();
    window.currentEtappeFeature = null;
    document.getElementById('routeInfoPanel').innerHTML = '<div class="empty-state">Geen etappe geselecteerd</div>';
    showNotification('Highlight verwijderd', 'info');
}

function zoomToEtappe() {
    if (window.currentEtappeFeature && window.currentEtappeFeature.geometry) {
        const feature = window.currentEtappeFeature;
        let coordinates;
        
        if (feature.geometry.type === 'LineString') {
            coordinates = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        } else if (feature.geometry.type === 'MultiLineString') {
            coordinates = feature.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
        }
        
        if (coordinates && coordinates.length > 0) {
            const bounds = L.latLngBounds(coordinates);
            map.fitBounds(bounds, { padding: [20, 20] });
            
            if (isMobile) {
                closeSidebar();
            }
        }
    }
}

function updateActiveRoutesDisplay() {
    const container = document.getElementById('activeRoutesDisplay');
    
    if (activeRoutes.length === 0) {
        container.innerHTML = '<div class="empty-state">Klik op een route card hierboven om deze toe te voegen</div>';
        
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
    
    highlightLayer.clearLayers();
    document.getElementById('routeInfoPanel').innerHTML = '<div class="empty-state">Geen etappe geselecteerd</div>';
    
    showNotification('Alle routes verwijderd', 'info');
}

// ============ MEASUREMENT TOOLS ============

function toggleMeasureFromMap() {
    measuring = !measuring;
    const btn = document.getElementById('measureControlBtn');
    
    if (measuring) {
        btn.classList.add('active');
        btn.title = 'Stop meting - Klik punten op de kaart';
        btn.innerHTML = '<i class="fas fa-stop"></i>';
        map.getContainer().style.cursor = 'crosshair';
        showNotification('Afstand meten geactiveerd - Klik punten op de kaart', 'info');
    } else {
        btn.classList.remove('active');
        btn.title = 'Afstand meten';
        btn.innerHTML = '<i class="fas fa-ruler-combined"></i>';
        map.getContainer().style.cursor = '';
        showNotification('Afstand meten gestopt', 'info');
    }
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

    const pointNumber = measureMarkers.filter(item => item.getLatLng).length + 1;
    marker.bindTooltip(`${pointNumber}`, { 
        permanent: true, 
        direction: 'center',
        className: 'measure-point-tooltip',
        offset: [0, 0]
    });

    measureMarkers.push(marker);

    if (measureMarkers.length > 1) {
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
                    iconSize: [null, null],
                    iconAnchor: [null, null]
                }),
                zIndex: 1002,
                interactive: false
            }).addTo(map);

            measureMarkers.push(distanceLabel);

            totalDistance += segmentDistance / 1000;
            updateDistanceDisplay();
            updateTotalDistanceOnMap();
        }
    } else {
        updateTotalDistanceOnMap();
    }
}

function updateTotalDistanceOnMap() {
    if (window.totalDistanceMarker) {
        map.removeLayer(window.totalDistanceMarker);
    }
    
    if (measureMarkers.length > 0) {
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

            const offsetLat = lastMarker.getLatLng().lat + 0.002;
            const offsetLng = lastMarker.getLatLng().lng;

            window.totalDistanceMarker = L.marker([offsetLat, offsetLng], {
                icon: L.divIcon({
                    className: 'total-distance-label-container',
                    html: `<div class="total-distance-text">${totalText}</div>`,
                    iconSize: [null, null],
                    iconAnchor: [null, null]
                }),
                zIndex: 1003,
                interactive: false
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
    
    if (window.totalDistanceMarker) {
        map.removeLayer(window.totalDistanceMarker);
        window.totalDistanceMarker = null;
    }
    
    const mapBtn = document.getElementById('measureControlBtn');
    if (mapBtn) {
        mapBtn.classList.remove('active');
        mapBtn.title = 'Afstand meten';
        mapBtn.innerHTML = '<i class="fas fa-ruler-combined"></i>';
    }
    
    measuring = false;
    map.getContainer().style.cursor = '';
    showNotification('Alle metingen gewist', 'success');
}

// ============ SEARCH & NAVIGATION ============

function searchLocation() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    const spinner = document.getElementById('searchSpinner');
    spinner.style.display = 'block';

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=nl&limit=3`)
        .then(response => response.json())
        .then(data => {
            spinner.style.display = 'none';
            
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
                
                if (isMobile) {
                    closeSidebar();
                }
                
                showNotification('Locatie gevonden', 'success');
            } else {
                showNotification('Locatie niet gevonden', 'warning');
            }
        })
        .catch(error => {
            spinner.style.display = 'none';
            console.error('Zoekfout:', error);
            showNotification('Er is een fout opgetreden bij het zoeken', 'error');
        });
}

function zoomToNetherlands() {
    map.setView([52.1326, 5.2913], 7);
    
    if (isMobile) {
        closeSidebar();
    }
}

function getCurrentLocation() {
    if (navigator.geolocation) {
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
            
            showNotification('Locatie gevonden', 'success');
        }, function(error) {
            showNotification('Locatie kon niet worden bepaald', 'error');
        });
    } else {
        showNotification('Geolocation wordt niet ondersteund', 'error');
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            showNotification('Volledig scherm niet ondersteund', 'warning');
        });
    } else {
        document.exitFullscreen();
    }
}

function addCurrentViewToFavorites() {
    showNotification('Favorieten functie beschikbaar voor uitbreiding', 'info');
}

// ============ NOTIFICATIONS & UI ============

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
        animation: slideInRight 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
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
            <div class="loading-detail">Groot bestand wordt geladen...</div>
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

// Add notification animations
const notificationStyles = `
@keyframes slideInRight {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slideOutRight {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(100%);
        opacity: 0;
    }
}

/* Performance indicator for zoom levels */
.zoom-indicator {
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.7);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    z-index: 1000;
    display: none;
}

.zoom-indicator.show {
    display: block;
    animation: fadeInOut 2s ease-in-out;
}

@keyframes fadeInOut {
    0%, 100% { opacity: 0; }
    50% { opacity: 1; }
}
`;

// Performance monitoring
function showZoomIndicator(message) {
    let indicator = document.querySelector('.zoom-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'zoom-indicator';
        document.body.appendChild(indicator);
    }
    
    indicator.textContent = message;
    indicator.classList.add('show');
    
    setTimeout(() => {
        indicator.classList.remove('show');
    }, 2000);
}

// Enhanced viewport update with performance feedback
function updateViewportData() {
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    
    console.log(`Viewport update: zoom ${zoom}`);
    
    // Show user feedback about zoom levels
    if (campingVisible && zoom < ZOOM_LEVELS.CAMPING_MIN) {
        showZoomIndicator(`Zoom in tot ${ZOOM_LEVELS.CAMPING_MIN}+ voor campings`);
    }
    if (vriendenVisible && zoom < ZOOM_LEVELS.VRIENDEN_MIN) {
        showZoomIndicator(`Zoom in tot ${ZOOM_LEVELS.VRIENDEN_MIN}+ voor Vrienden op de Fiets`);
    }
    if (ovStopsVisible && zoom < ZOOM_LEVELS.OV_MIN) {
        showZoomIndicator(`Zoom in tot ${ZOOM_LEVELS.OV_MIN}+ voor openbaar vervoer`);
    }
    
    // Update camping data
    if (campingVisible && zoom >= ZOOM_LEVELS.CAMPING_MIN) {
        updateCampingInViewport(bounds);
    } else if (campingVisible) {
        clearCampingMarkers();
    }
    
    // Update vrienden data
    if (vriendenVisible && zoom >= ZOOM_LEVELS.VRIENDEN_MIN) {
        updateVriendenInViewport(bounds);
    } else if (vriendenVisible) {
        clearVriendenMarkers();
    }
    
    // Update OV data
    if (ovStopsVisible && zoom >= ZOOM_LEVELS.OV_MIN) {
        updateOVInViewport(bounds);
    } else if (ovStopsVisible) {
        clearOVMarkers();
    }
    
    lastViewportBounds = bounds;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing optimized hiking WebGIS...');
    
    // Add styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = notificationStyles;
    document.head.appendChild(styleSheet);
    
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
        
        history.pushState(null, null, location.href);
    }
    
    console.log('Optimized app initialization complete');
    console.log('Performance settings:', {
        'Camping min zoom': ZOOM_LEVELS.CAMPING_MIN,
        'Vrienden min zoom': ZOOM_LEVELS.VRIENDEN_MIN,
        'OV min zoom': ZOOM_LEVELS.OV_MIN,
        'Cluster disable zoom': ZOOM_LEVELS.CLUSTER_DISABLE
    });
});// Global variables
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
let ovStopsLayer;
let ovStopsClusterGroup;
let campingVisible = false;
let vriendenVisible = false;
let ovStopsVisible = false;
let loadingOverlay = null;
let isMobile = window.innerWidth <= 768;
let sidebarOpen = false;

// Performance optimization variables
let campingData = null;
let vriendenData = null;
let ovStopsData = null;
let currentCampingMarkers = [];
let currentVriendenMarkers = [];
let currentOVMarkers = [];
let lastViewportBounds = null;
let viewportUpdateTimeout = null;

// Zoom levels for data loading
const ZOOM_LEVELS = {
    CAMPING_MIN: 9,
    VRIENDEN_MIN: 9,
    OV_MIN: 11,
    CLUSTER_DISABLE: 15
};

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

// Icons (unchanged)
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

const trainIcon = L.icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="12" r="12" fill="#003082"/>
            <rect x="6" y="8" width="12" height="8" rx="2" fill="white"/>
            <circle cx="9" cy="14" r="1.5" fill="#003082"/>
            <circle cx="15" cy="14" r="1.5" fill="#003082"/>
            <rect x="8" y="10" width="8" height="2" fill="#003082"/>
        </svg>
    `),
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24]
});

const busIcon = L.icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="12" r="12" fill="#e17000"/>
            <rect x="5" y="7" width="14" height="10" rx="2" fill="white"/>
            <circle cx="8" cy="15" r="1.5" fill="#e17000"/>
            <circle cx="16" cy="15" r="1.5" fill="#e17000"/>
            <rect x="6" y="9" width="12" height="4" fill="#e17000"/>
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

        if (isMobile) {
            map.zoomControl.setPosition('bottomright');
        }

        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            zIndex: 1,
            maxZoom: 19
        });

        const topoLayer = L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png', {
            attribution: '© PDOK',
            zIndex: 1,
            maxZoom: 19
        });

        const satelliteLayer = L.tileLayer('https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg', {
            attribution: '© PDOK Luchtfoto',
            zIndex: 1,
            maxZoom: 19
        });

        const terrainLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            zIndex: 1,
            maxZoom: 19
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

        // Initialize simple layer groups
        campingLayer = L.layerGroup();
        vriendenLayer = L.layerGroup();
        ovStopsLayer = L.layerGroup();
        
        // Try to initialize clustering if available
        initializeClustering();

        setupEventListeners();
        setupTabNavigation();
        setupMobileFeatures();
        setupViewportBasedLoading();
        
        console.log('Map initialized successfully');
    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

// Initialize clustering if library is available
function initializeClustering() {
    if (typeof L.markerClusterGroup !== 'undefined') {
        console.log('MarkerCluster library loaded, initializing clustering...');
        
        campingClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: ZOOM_LEVELS.CLUSTER_DISABLE,
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
            disableClusteringAtZoom: ZOOM_LEVELS.CLUSTER_DISABLE,
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

        ovStopsClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 40,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: ZOOM_LEVELS.CLUSTER_DISABLE,
            iconCreateFunction: function(cluster) {
                const count = cluster.getChildCount();
                let size = 'small';
                if (count > 15) size = 'medium';
                if (count > 30) size = 'large';
                
                return L.divIcon({
                    html: `<div class="cluster-inner ov-cluster">${count}</div>`,
                    className: `marker-cluster marker-cluster-${size}`,
                    iconSize: L.point(40, 40)
                });
            }
        });
    } else {
        console.log('MarkerCluster library not available, using simple layer groups');
        campingClusterGroup = campingLayer;
        vriendenClusterGroup = vriendenLayer;
        ovStopsClusterGroup = ovStopsLayer;
    }
}

// Setup viewport-based loading
function setupViewportBasedLoading() {
    // Listen to map events for viewport updates
    map.on('zoomend moveend', function() {
        clearTimeout(viewportUpdateTimeout);
        viewportUpdateTimeout = setTimeout(updateViewportData, 300); // Debounce
    });
}

// Update data based on current viewport and zoom
function updateViewportData() {
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    
    console.log(`Viewport update: zoom ${zoom}, bounds:`, bounds);
    
    // Update camping data
    if (campingVisible && zoom >= ZOOM_LEVELS.CAMPING_MIN) {
        updateCampingInViewport(bounds);
    }
    
    // Update vrienden data
    if (vriendenVisible && zoom >= ZOOM_LEVELS.VRIENDEN_MIN) {
        updateVriendenInViewport(bounds);
    }
    
    // Update OV data
    if (ovStopsVisible && zoom >= ZOOM_LEVELS.OV_MIN) {
        updateOVInViewport(bounds);
    }
    
    lastViewportBounds = bounds;
}

// Check if point is in bounds with buffer
function isInBounds(lat, lng, bounds, buffer = 0.01) {
    return lat >= bounds.getSouth() - buffer &&
           lat <= bounds.getNorth() + buffer &&
           lng >= bounds.getWest() - buffer &&
           lng <= bounds.getEast() + buffer;
}

// Update camping markers in viewport
function updateCampingInViewport(bounds) {
    if (!campingData) return;
    
    // Clear existing markers
    currentCampingMarkers.forEach(marker => {
        campingClusterGroup.removeLayer(marker);
    });
    currentCampingMarkers = [];
    
    // Add markers in viewport
    let addedCount = 0;
    const maxMarkers = 200; // Limit markers for performance
    
    campingData.features.forEach(feature => {
        if (addedCount >= maxMarkers) return;
        
        const coords = feature.geometry.coordinates;
        const lat = coords[1];
        const lng = coords[0];
        
        if (isInBounds(lat, lng, bounds, 0.02)) {
            const marker = createCampingMarker(feature);
            campingClusterGroup.addLayer(marker);
            currentCampingMarkers.push(marker);
            addedCount++;
        }
    });
    
    console.log(`Added ${addedCount} camping markers in viewport`);
}

// Update vrienden markers in viewport
function updateVriendenInViewport(bounds) {
    if (!vriendenData) return;
    
    // Clear existing markers
    currentVriendenMarkers.forEach(marker => {
        vriendenClusterGroup.removeLayer(marker);
    });
    currentVriendenMarkers = [];
    
    // Add markers in viewport
    let addedCount = 0;
    const maxMarkers = 200;
    
    vriendenData.features.forEach(feature => {
        if (addedCount >= maxMarkers) return;
        
        const coords = feature.geometry.coordinates;
        const lat = coords[1];
        const lng = coords[0];
        
        if (isInBounds(lat, lng, bounds, 0.02)) {
            const marker = createVriendenMarker(feature);
            vriendenClusterGroup.addLayer(marker);
            currentVriendenMarkers.push(marker);
            addedCount++;
        }
    });
    
    console.log(`Added ${addedCount} vrienden markers in viewport`);
}

// Update OV markers in viewport
function updateOVInViewport(bounds) {
    if (!ovStopsData) return;
    
    // Clear existing markers
    currentOVMarkers.forEach(marker => {
        ovStopsClusterGroup.removeLayer(marker);
    });
    currentOVMarkers = [];
    
    // Add markers in viewport
    let addedCount = 0;
    const maxMarkers = 300; // More OV stops allowed
    
    ovStopsData.features.forEach(feature => {
        if (addedCount >= maxMarkers) return;
        
        const coords = feature.geometry.coordinates;
        const lat = coords[1];
        const lng = coords[0];
        
        if (isInBounds(lat, lng, bounds, 0.01)) {
            const marker = createOVMarker(feature);
            ovStopsClusterGroup.addLayer(marker);
            currentOVMarkers.push(marker);
            addedCount++;
        }
    });
    
    console.log(`Added ${addedCount} OV markers in viewport`);
}

// Create camping marker
function createCampingMarker(feature) {
    const coords = feature.geometry.coordinates;
    const props = feature.properties;
    
    const popupContent = `
        <div class="camping-popup">
            <h4><i class="fas fa-campground"></i> ${props.name || 'Camping'}</h4>
            ${props.operator ? `<p><strong>Beheerder:</strong> ${props.operator}</p>` : ''}
            ${props.access ? `<p><strong>Toegang:</strong> ${props.access}</p>` : ''}
            ${props.house ? `<p><strong>Accommodatie:</strong> ${props.house}</p>` : ''}
        </div>
    `;
    
    return L.marker([coords[1], coords[0]], {
        icon: campingIcon
    }).bindPopup(popupContent);
}

// Create vrienden marker
function createVriendenMarker(feature) {
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
    
    const popupContent = `
        <div class="vrienden-popup">
            <h4><i class="fas fa-bicycle"></i> ${props.name || props.naam || 'Vrienden op de Fiets'}</h4>
            ${props.adres || props.address ? `<p><strong>Adres:</strong> ${props.adres || props.address}</p>` : ''}
            ${props.plaats || props.city ? `<p><strong>Plaats:</strong> ${props.plaats || props.city}</p>` : ''}
            ${availabilityText}
            ${props.telefoon || props.phone ? `<p><strong>Telefoon:</strong> ${props.telefoon || props.phone}</p>` : ''}
        </div>
    `;
    
    return L.marker([coords[1], coords[0]], {
        icon: vriendenIcon
    }).bindPopup(popupContent);
}

// Create OV marker
function createOVMarker(feature) {
    const coords = feature.geometry.coordinates;
    const props = feature.properties;
    
    let icon = busIcon;
    let typeLabel = 'Bushalte';
    
    if (props.stop_type === 'train' || props.route_type === '1') {
        icon = trainIcon;
        typeLabel = 'Treinstation';
    } else if (props.stop_type === 'tram' || props.route_type === '0') {
        icon = trainIcon;
        typeLabel = 'Tramhalte';
    }
    
    const popupContent = `
        <div class="ov-popup">
            <h4><i class="fas fa-bus"></i> ${props.stop_name || props.name}</h4>
            <p><strong>Type:</strong> ${typeLabel}</p>
            ${props.stop_code ? `<p><strong>Haltecode:</strong> ${props.stop_code}</p>` : ''}
            <div class="ov-actions">
                <button class="popup-button" onclick="planRouteToStop('${coords[1]}', '${coords[0]}')">
                    <i class="fas fa-route"></i> Route plannen
                </button>
            </div>
        </div>
    `;
    
    return L.marker([coords[1], coords[0]], {
        icon: icon
    }).bindPopup(popupContent);
}

// ============ LAYER TOGGLE FUNCTIONS ============

function toggleCampingLayer() {
    campingVisible = !campingVisible;
    const card = document.getElementById('camping-layer-card');
    
    if (campingVisible) {
        if (!campingData) {
            loadCampingData();
        } else {
            map.addLayer(campingClusterGroup);
            card.classList.add('active');
            updateViewportData(); // Update viewport immediately
            showNotification('Campings zichtbaar - zoom in voor details', 'success');
        }
    } else {
        clearCampingMarkers();
        map.removeLayer(campingClusterGroup);
        card.classList.remove('active');
        showNotification('Campings verborgen', 'info');
    }
}

function toggleVriendenLayer() {
    vriendenVisible = !vriendenVisible;
    const card = document.getElementById('vrienden-layer-card');
    
    if (vriendenVisible) {
        if (!vriendenData) {
            loadVriendenData();
        } else {
            map.addLayer(vriendenClusterGroup);
            card.classList.add('active');
            updateViewportData();
            showNotification('Vrienden op de Fiets zichtbaar - zoom in voor details', 'success');
        }
    } else {
        clearVriendenMarkers();
        map.removeLayer(vriendenClusterGroup);
        card.classList.remove('active');
        showNotification('Vrienden op de Fiets verborgen', 'info');
    }
}

function toggleOVStopsLayer() {
    ovStopsVisible = !ovStopsVisible;
    const card = document.getElementById('ov-layer-card');
    
    if (ovStopsVisible) {
        if (!ovStopsData) {
            loadOVStopsData();
        } else {
            map.addLayer(ovStopsClusterGroup);
            card.classList.add('active');
            updateViewportData();
            showNotification('Openbaar vervoer zichtbaar - zoom in voor details', 'success');
        }
    } else {
        clearOVMarkers();
        map.removeLayer(ovStopsClusterGroup);
        card.classList.remove('active');
        showNotification('Openbaar vervoer verborgen', 'info');
    }
}

// ============ DATA LOADING FUNCTIONS ============

function loadCampingData() {
    if (campingData) return; // Already loaded
    
    showLoadingOverlay('Camping data laden...');
    
    fetch('./data/campings.geojson')
        .then(response => {
            if (!response.ok) {
                throw new Error('GeoJSON bestand niet gevonden');
            }
            return response.json();
        })
        .then(geojsonData => {
            campingData = geojsonData;
            
            map.addLayer(campingClusterGroup);
            campingVisible = true;
            
            const card = document.getElementById('camping-layer-card');
            if (card) {
                card.classList.add('active');
            }
            
            hideLoadingOverlay();
            
            showNotification(`${geojsonData.features.length} campings geladen - zoom in voor details`, 'success');
            
            // Update viewport if zoom is sufficient
            if (map.getZoom() >= ZOOM_LEVELS.CAMPING_MIN) {
                updateViewportData();
            }
        })
        .catch(error => {
            hideLoadingOverlay();
            showNotification('Campings GeoJSON niet gevonden in data/campings.geojson', 'error');
        });
}

function loadVriendenData() {
    if (vriendenData) return; // Already loaded
    
    showLoadingOverlay('Vrienden op de Fiets data laden...');
    
    fetch('./data/vrienden-op-de-fiets.geojson')
        .then(response => {
            if (!response.ok) {
                throw new Error('GeoJSON bestand niet gevonden');
            }
            return response.json();
        })
        .then(geojsonData => {
            vriendenData = geojsonData;
            
            map.addLayer(vriendenClusterGroup);
            vriendenVisible = true;
            
            const card = document.getElementById('vrienden-layer-card');
            if (card) {
                card.classList.add('active');
            }
            
            hideLoadingOverlay();
            
            showNotification(`${geojsonData.features.length} Vrienden op de Fiets locaties geladen - zoom in voor details`, 'success');
            
            if (map.getZoom() >= ZOOM_LEVELS.VRIENDEN_MIN) {
                updateViewportData();
            }
        })
        .catch(error => {
            hideLoadingOverlay();
            showNotification('Vrienden op de Fiets GeoJSON niet gevonden in data/vrienden-op-de-fiets.geojson', 'error');
        });
}

async function loadOVStopsData() {
    if (ovStopsData) return; // Already loaded
    
    showLoadingOverlay('Openbaar vervoer data laden...');
    
    try {
        // Try to load local GeoJSON first
        try {
            const response = await fetch('./data/ov-stops.geojson');
            if (response.ok) {
                const geojsonData = await response.json();
                ovStopsData = geojsonData;
                
                map.addLayer(ovStopsClusterGroup);
                ovStopsVisible = true;
                
                const card = document.getElementById('ov-layer-card');
                if (card) {
                    card.classList.add('active');
                }
                
                hideLoadingOverlay();
                showNotification(`${geojsonData.features.length} OV haltes geladen - zoom in voor details`, 'success');
                
                if (map.getZoom() >= ZOOM_LEVELS.OV_MIN) {
                    updateViewportData();
                }
                return;
            }
        } catch (error) {
            console.log('Local OV data niet gevonden, gebruik NS stations...');
        }
        
        // Fallback to NS stations
        await loadNSStationsAsGeoJSON();
        
    } catch (error) {
        console.error('Fout bij laden OV data:', error);
        hideLoadingOverlay();
        showNotification('Kon openbaar vervoer data niet laden', 'error');
    }
}

async function loadNSStationsAsGeoJSON() {
    try {
        const response = await fetch('https://www.rijdendetreinen.nl/api/v2/stations');
        const stationsData = await response.json();
        
        // Convert to GeoJSON format
        const features = stationsData
            .filter(station => station.land === 'NL')
            .map(station => ({
                type: "Feature",
                properties: {
                    stop_id: `ns:${station.code.toLowerCase()}`,
                    stop_name: station.namen.lang,
                    stop_code: station.code,
                    stop_type: 'train',
                    route_type: '1',
                    station_type: station.stationType
                },
                geometry: {
                    type: "Point",
                    coordinates: [station.lng, station.lat]
                }
            }));
        
        ovStopsData = {
            type: "FeatureCollection",
            features: features
        };
        
        map.addLayer(ovStopsClusterGroup);
        ovStopsVisible = true;
        
        const card = document.getElementById('ov-layer-card');
        if (card) {
            card.classList.add('active');
        }
        
        hideLoadingOverlay();
        showNotification(`${features.length} treinstations geladen - zoom in voor details`, 'success');
        
        if (map.getZoom() >= ZOOM_LEVELS.OV_MIN) {
            updateViewportData();
        }
        
    } catch (error) {
        console.error('Fout bij laden NS stations:', error);
        throw error;
    }
}

// ============ CLEAR FUNCTIONS ============

function clearCampingMarkers() {
    currentCampingMarkers.forEach(marker => {
        campingClusterGroup.removeLayer(marker);
    });
    currentCampingMarkers = [];
}

function clearVriendenMarkers() {
    currentVriendenMarkers.forEach(marker => {
        vriendenClusterGroup.removeLayer(marker);
    });
    currentVriendenMarkers = [];
}

function clearOVMarkers() {
    currentOVMarkers.forEach(marker => {
        ovStopsClusterGroup.removeLayer(marker);
    });
    currentOVMarkers = [];
}

// ============ SMART OV FUNCTIONS ============

function showNearbyOVStops(latlng, radius = 2000) {
    if (!ovStopsVisible) {
        showNotification('Activeer eerst de O

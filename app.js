
// Minimal working app.js (OV removed)
// Basemap + simple UI utils + Roots Natuurpad loader

let map;
let baseLayers = {};
let currentBase = null;

// Simple state
let activeRoutes = [];
let highlightLayer = null;

// ----- Utilities (stubs to keep UI happy) -----
function showNotification(msg, type='info') { console.log(`[${type}] ${msg}`); }
function showLoadingOverlay(msg='Laden...') { console.log(msg); }
function hideLoadingOverlay() {}
function updateActiveRoutesDisplay() {}
function showRouteInfoInPanel(feature) { console.log('Route info:', feature && feature.properties); }
function highlightEtappe(feature) {
    if (!feature || !feature.geometry) return;
    if (!highlightLayer) highlightLayer = L.layerGroup().addTo(map);
    highlightLayer.clearLayers();
    L.geoJSON(feature, {style: {color:'#22c55e', weight:5, opacity:0.9}}).addTo(highlightLayer);
}
function toggleSidebar() {}
function addCurrentViewToFavorites() {}
function addLAWRoute(v) { showNotification('LAW laden niet geïmplementeerd in deze minimale build', 'warning'); }
function toggleCampingLayer() { showNotification('Campings toggle niet geïmplementeerd in deze minimale build', 'warning'); }
function toggleVriendenLayer() { showNotification('Vrienden op de Fiets toggle niet geïmplementeerd in deze minimale build', 'warning'); }

function zoomToNetherlands() {
    map.setView([52.1326, 5.2913], 7);
}

// ----- Basemap handling -----
function changeBasemap(type) {
    if (currentBase) map.removeLayer(currentBase);
    if (type === 'osm') currentBase = baseLayers.osm;
    else if (type === 'topo') currentBase = baseLayers.topo;
    else if (type === 'sat') currentBase = baseLayers.sat;
    else if (type === 'terrain') currentBase = baseLayers.terrain;
    if (currentBase) map.addLayer(currentBase);
}

// ----- Roots Natuurpad -----
let rootsRoute = null;
async function addRootsNatuurpad() {
    if (activeRoutes.some(r => r.value === 'ROOTS')) {
        showNotification('Route "Roots Natuurpad" is al toegevoegd!', 'warning');
        return;
    }
    showLoadingOverlay('Roots Natuurpad laden...');

    let data = null;
    try {
        const res = await fetch('./data/roots_json.geojson');
        if (res.ok) data = await res.json();
    } catch (e) {}

    hideLoadingOverlay();
    if (!data) { showNotification('Kon Roots Natuurpad niet vinden (./data/roots_json.geojson)', 'error'); return; }

    rootsRoute = L.geoJSON(data, {
        style: { color:'#22c55e', weight:6, opacity:0.95 },
        onEachFeature: function (feature, layer) {
            const name = (feature.properties && (feature.properties.naam || feature.properties.name)) || 'Roots Natuurpad';
            layer.bindPopup(`<strong>${name}</strong>`);
            layer.on('click', function () {
                let coords = [];
                const latlngs = layer.getLatLngs();
                function pushLL(ll){ if(!ll) return; if (Array.isArray(ll) && Array.isArray(ll[0])) ll.forEach(pushLL); else if (Array.isArray(ll)) coords.push(ll.map(p=>[p.lng,p.lat])); }
                pushLL(latlngs);
                const faux = (coords.length>1)
                    ? { type:'Feature', geometry:{type:'MultiLineString', coordinates:coords}, properties:{lawnaam:'Roots Natuurpad'} }
                    : { type:'Feature', geometry:{type:'LineString', coordinates:coords[0]||[]}, properties:{lawnaam:'Roots Natuurpad'} };
                showRouteInfoInPanel(faux);
                highlightEtappe(faux);
            });
        }
    }).addTo(map);
    if (rootsRoute.bringToFront) rootsRoute.bringToFront();

    activeRoutes.push({ id: Date.now(), name:'Roots Natuurpad', type:'custom', filter:'Roots Natuurpad', layerName:'roots-geojson', value:'ROOTS', layer: rootsRoute });
    updateActiveRoutesDisplay();

    try { map.fitBounds(rootsRoute.getBounds(), { padding:[20,20] }); } catch(e){}
    showNotification('Route "Roots Natuurpad" toegevoegd', 'success');
}

// ----- Init -----
function initMap(){
    map = L.map('map', { zoomControl: true }).setView([52.1326, 5.2913], 7);

    baseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19
    }).addTo(map);

    baseLayers.topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap contributors', maxZoom: 17
    });
    baseLayers.sat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'], attribution: '© Imagery'
    });
    baseLayers.terrain = L.tileLayer('https://{s}.tile.stamen.com/terrain/{z}/{x}/{y}.jpg', {
        attribution: 'Map tiles by Stamen', maxZoom: 17
    });
    currentBase = baseLayers.osm;

    highlightLayer = L.layerGroup().addTo(map);
}

document.addEventListener('DOMContentLoaded', initMap);

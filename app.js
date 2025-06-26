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

// Icons
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

// Initialize map
function initMap() {
    console.log('Initializing map...');
    
    try {
        map = L.map('map').setView([52.1326, 5.2913], 7);

        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        });

        osmLayer.addTo(map);
        
        campingLayer = L.layerGroup();
        vriendenLayer = L.layerGroup();
        
        setupEventListeners();
        
        console.log('Map initialized successfully');
    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
            const targetPanel = document.getElementById(targetTab + '-panel');
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

// Sidebar functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    sidebarOpen = !sidebarOpen;
    
    if (sidebarOpen) {
        sidebar.classList.add('open');
    } else {
        sidebar.classList.remove('open');
    }
}

// Camping functions
function toggleCampingLayer() {
    console.log('Toggle camping called');
    campingVisible = !campingVisible;
    const card = document.getElementById('camping-layer-card');
    
    if (campingVisible) {
        if (campingLayer.getLayers().length === 0) {
            loadCampingGeoJSON();
        } else {
            map.addLayer(campingLayer);
            if (card) card.classList.add('active');
        }
    } else {
        map.removeLayer(campingLayer);
        if (card) card.classList.remove('active');
    }
}

function loadCampingGeoJSON() {
    fetch('./data/campings.geojson')
        .then(response => response.json())
        .then(geojsonData => {
            campingLayer.clearLayers();
            
            geojsonData.features.forEach(feature => {
                const coords = feature.geometry.coordinates;
                const props = feature.properties;
                
                const popupContent = `
                    <div class="camping-popup">
                        <h4><i class="fas fa-campground"></i> ${props.name || 'Camping'}</h4>
                        ${props.operator ? `<p><strong>Beheerder:</strong> ${props.operator}</p>` : ''}
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
            if (card) card.classList.add('active');
            
            console.log('Campings loaded');
        })
        .catch(error => {
            console.error('Error loading campings:', error);
        });
}

// Vrienden functions  
function toggleVriendenLayer() {
    console.log('Toggle vrienden called');
    vriendenVisible = !vriendenVisible;
    const card = document.getElementById('vrienden-layer-card');
    
    if (vriendenVisible) {
        if (vriendenLayer.getLayers().length === 0) {
            loadVriendenGeoJSON();
        } else {
            map.addLayer(vriendenLayer);
            if (card) card.classList.add('active');
        }
    } else {
        map.removeLayer(vriendenLayer);
        if (card) card.classList.remove('active');
    }
}

function loadVriendenGeoJSON() {
    fetch('./data/vrienden-op-de-fiets.geojson')
        .then(response => response.json())
        .then(geojsonData => {
            vriendenLayer.clearLayers();
            
            geojsonData.features.forEach(feature => {
                const coords = feature.geometry.coordinates;
                const props = feature.properties;
                
                const popupContent = `
                    <div class="vrienden-popup">
                        <h4><i class="fas fa-bicycle"></i> ${props.name || props.naam || 'Vrienden op de Fiets'}</h4>
                        ${props.plaats ? `<p><strong>Plaats:</strong> ${props.plaats}</p>` : ''}
                        ${props.verblijftype ? `<p><strong>Type:</strong> ${props.verblijftype}</p>` : ''}
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
            if (card) card.classList.add('active');
            
            console.log('Vrienden loaded');
        })
        .catch(error => {
            console.error('Error loading vrienden:', error);
        });
}

// Route functions
function addLAWRoute(routeValue, routeFilter) {
    console.log('Adding route:', routeValue, routeFilter);
    alert(`Route ${routeValue} - ${routeFilter} zou worden toegevoegd`);
}

// Utility functions
function zoomToNetherlands() {
    if (map) {
        map.setView([52.1326, 5.2913], 7);
    }
}

function getCurrentLocation() {
    alert('Locatie functie zou hier komen');
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
    console.log('DOM loaded, initializing...');
    initMap();
});

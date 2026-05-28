// Lat/Lon mapping. Math maps it to the vector geometry natively. 
const SITES = {
    ewa:   { lat: 47.47, lon: -122.25, type: 'datacenter', label: "EWA_TUK" },
    phx:   { lat: 33.44, lon: -112.07, type: 'datacenter', label: "PHX_AZ" },
    clt:   { lat: 35.22, lon: -80.84,  type: 'datacenter', label: "CLT_NC" },
    sea:   { lat: 47.60, lon: -122.33, type: 'client', label: "SEA_PUG" },
    socal: { lat: 34.05, lon: -118.24, type: 'client', label: "SOCAL" },
    stl:   { lat: 38.62, lon: -90.19,  type: 'client', label: "STL_BER" },
    rid:   { lat: 39.95, lon: -75.16,  type: 'client', label: "RID_PA" },
    chs:   { lat: 32.77, lon: -79.93,  type: 'client', label: "CHS_SC" },
    dab:   { lat: 29.21, lon: -81.02,  type: 'client', label: "DAB_FL" },
    
    // Abstracted Periphery: Logical layout bypassing geographic map constraints
    sjc:   { logical: true, lx: 980, ly: 600, type: 'client', label: "SJC_BRA" },
    pol:   { logical: true, lx: 1020, ly: 290, type: 'client', label: "POL_WAR" },
    blr:   { logical: true, lx: 1040, ly: 440, type: 'client', label: "BLR_IND" }
};

// Expanded realistic pool of logical IT/Engineering services
let SERVICES = [
    { id: "ANSYS_HPC", state: "crit", triad: ["ewa", "phx", "clt"], down: ["phx", "clt"] },
    { id: "K8S_CTRL", state: "crit", triad: ["ewa", "phx", "clt"], down: ["ewa", "phx"] },
    { id: "MATLAB_R2", state: "warn", triad: ["ewa", "phx", "clt"], down: ["ewa"] },
    { id: "JIRA_CORE", state: "warn", triad: ["ewa", "phx", "clt"], down: ["clt"] },
    { id: "AUTOCAD_EL", state: "warn", triad: ["ewa", "phx", "clt"], down: ["phx"] },
    { id: "NX_SIEMENS", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "CATIA_V6", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "SOLIDWORKS", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "GITLAB_CI", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "SPLUNK_IDX", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "ORACLE_ERP", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "SAP_HANA", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "VMWARE_VC", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "MAYA_3D", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "JENKINS_M", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "DOCKER_REG", state: "ok", triad: ["ewa", "phx", "clt"], down: [] }
];

const STATE_WEIGHT = { "crit": 3, "warn": 2, "ok": 1 };
let currentView = null;
let streamInterval = null;
let clientPaths = [];

function init() {
    renderVectorMapUnderlay();
    sortServices();
    renderSidebar();
    loadMacroView();
    startStreamOrchestrator();
}

// Equirectangular projection engine
function getMapCoords(site) {
    if (site.logical) return { x: site.lx, y: site.ly };
    // Mapped precisely to the Wikipedia 2754x1398 coordinate space
    const x = (site.lon + 180) * (2754 / 360);
    const y = (90 - site.lat) * (1398 / 180);
    return { x, y };
}

function renderVectorMapUnderlay() {
    const layer = document.getElementById('layer-map-underlay');
    fetch('https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg')
        .then(r => r.text())
        .then(svgText => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, 'image/svg+xml');
            const paths = doc.querySelectorAll('path');
            let combinedPaths = '';
            paths.forEach(p => {
                combinedPaths += `<path d="${p.getAttribute('d')}" class="vector-map-element" />`;
            });
            layer.innerHTML = combinedPaths;
        }).catch(err => {
            layer.innerHTML = `<rect width="2754" height="1398" fill="none" stroke="rgba(255,255,255,0.02)"/>`;
        });
}

function sortServices() {
    SERVICES.sort((a, b) => STATE_WEIGHT[b.state] - STATE_WEIGHT[a.state]);
}

function renderSidebar() {
    const grid = document.getElementById('service-grid');
    grid.innerHTML = SERVICES.map(s => `
        <div class="service-hex state-${s.state} ${currentView === s.id ? 'active-view' : ''}" 
             onclick="handleHexClick('${s.id}')">
            <span class="lbl">${s.id.split('_')[0]}</span>
            <span class="stat" style="color: ${s.state === 'ok' ? 'var(--text-dim)' : (s.state === 'warn' ? 'var(--amber)' : 'var(--red)')}">
                ${s.state.toUpperCase()}
            </span>
        </div>
    `).join('');
}

function handleHexClick(serviceId) {
    if (currentView === serviceId) loadMacroView();
    else loadTopology(serviceId);
}

function loadMacroView() {
    currentView = null;
    renderSidebar();
    
    document.getElementById('view-title').innerText = "MACRO FLEET VIEW";
    document.getElementById('view-subtitle').innerText = "GLOBAL QUORUM OVERVIEW";
    document.getElementById('view-subtitle').style.color = "var(--text-dim)";
    document.getElementById('core-panel').style.backgroundColor = "transparent";

    drawMap(null, ["ewa", "phx", "clt"]); 
}

function loadTopology(serviceId) {
    currentView = serviceId;
    renderSidebar();
    
    const svc = SERVICES.find(s => s.id === serviceId);
    document.getElementById('view-title').innerText = `POOL ROUTING: ${svc.id}`;
    
    const upNodes = svc.triad.filter(n => !svc.down.includes(n));
    let quorumText = upNodes.length >= 2 ? "QUORUM MET" : "QUORUM LOST (HALTED)";
    if (upNodes.length === 2) quorumText = "QUORUM DEGRADED (1 FAULT TILL HALT)";
    
    const corePanel = document.getElementById('core-panel');
    const subtitle = document.getElementById('view-subtitle');
    subtitle.innerText = `TRIAD STATUS: ${quorumText}`;
    
    if (upNodes.length >= 2) {
        subtitle.style.color = upNodes.length === 3 ? "var(--cyan)" : "var(--amber)";
        corePanel.style.backgroundColor = upNodes.length === 3 ? "transparent" : "rgba(245, 158, 11, 0.05)";
    } else {
        subtitle.style.color = "var(--red)";
        corePanel.style.backgroundColor = "rgba(239, 68, 68, 0.05)";
    }

    drawMap(svc, upNodes);
}

function drawMap(svc, upNodes) {
    const gNodes = document.getElementById('layer-nodes');
    const gQuorum = document.getElementById('layer-quorum-links');
    const gClients = document.getElementById('layer-client-links');
    const gPlasma = document.getElementById('layer-plasma');
    
    gNodes.innerHTML = ''; gQuorum.innerHTML = ''; gClients.innerHTML = ''; gPlasma.innerHTML = '';
    clientPaths = [];

    const isMacro = (svc === null);
    
    const drawQuorum = (n1, n2, id) => {
        const c1 = getMapCoords(SITES[n1]);
        const c2 = getMapCoords(SITES[n2]);
        drawLink(c1, c2, gQuorum, 'quorum ' + (upNodes.length<3 && !isMacro ?'degraded':''), id);
        
        if (upNodes.includes(n1) && upNodes.includes(n2)) {
            const speed = Math.hypot(c1.x - c2.x, c1.y - c2.y) / 100;
            drawPlasmaHighlight(id, Math.max(3, speed), (upNodes.length < 3 && !isMacro) ? 'var(--amber)' : 'var(--cyan)', gPlasma);
        }
    };

    if (upNodes.includes("ewa") || (!isMacro && svc.down.includes("ewa"))) drawQuorum("ewa", "phx", "q-ewa-phx");
    if (upNodes.includes("phx") || (!isMacro && svc.down.includes("phx"))) drawQuorum("phx", "clt", "q-phx-clt");
    if (upNodes.includes("clt") || (!isMacro && svc.down.includes("clt"))) drawQuorum("clt", "ewa", "q-clt-ewa");

    Object.keys(SITES).forEach(key => {
        const site = SITES[key];
        const coords = getMapCoords(site);
        const isFault = !isMacro && svc.down.includes(key);

        if (!isMacro && site.type === 'client' && upNodes.length > 0) {
            let closest = upNodes[0];
            let minDist = 9999;
            upNodes.forEach(t => {
                const tCoords = getMapCoords(SITES[t]);
                const d = Math.hypot(coords.x - tCoords.x, coords.y - tCoords.y);
                if (d < minDist) { minDist = d; closest = t; }
            });
            const pathId = `path-${key}`;
            const pathEl = drawLink(coords, getMapCoords(SITES[closest]), gClients, 'client', pathId);
            clientPaths.push(pathEl);
        }
        
        if (isMacro && site.type === 'client') return; 

        const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeG.setAttribute('class', `node ${isFault ? 'fault' : ''}`);
        
        if (site.type === 'datacenter') {
            const hexBg = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            hexBg.setAttribute('points', getHexPoints(coords.x, coords.y, 11));
            hexBg.setAttribute('class', 'node-datacenter-bg');
            
            const hexCore = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            hexCore.setAttribute('points', getHexPoints(coords.x, coords.y, 5));
            hexCore.setAttribute('class', 'node-datacenter-core');

            nodeG.appendChild(hexBg); nodeG.appendChild(hexCore);
        } else {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', coords.x); circle.setAttribute('cy', coords.y);
            circle.setAttribute('r', '3');
            circle.setAttribute('class', 'node-client');
            nodeG.appendChild(circle);
        }

        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', coords.x + 9); lbl.setAttribute('y', coords.y - 9);
        lbl.setAttribute('class', 'node-label');
        lbl.textContent = site.label;
        nodeG.appendChild(lbl);

        gNodes.appendChild(nodeG);
    });
}

function drawLink(c1, c2, group, className, id = null) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const cx = (c1.x + c2.x) / 2;
    const cy = Math.min(c1.y, c2.y) - 60;
    path.setAttribute('d', `M ${c1.x} ${c1.y} Q ${cx} ${cy} ${c2.x} ${c2.y}`);
    path.setAttribute('class', `link ${className}`);
    if (id) path.setAttribute('id', id);
    group.appendChild(path);
    return path;
}

function drawPlasmaHighlight(pathId, duration, color, group) {
    const plasma = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    plasma.setAttribute('rx', '25'); plasma.setAttribute('ry', '3.5');
    plasma.setAttribute('fill', color); plasma.setAttribute('opacity', '0.25');
    plasma.setAttribute('filter', 'url(#conduit-blur)');
    
    const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
    animate.setAttribute('dur', `${duration}s`);
    animate.setAttribute('repeatCount', 'indefinite');
    animate.setAttribute('rotate', 'auto');
    
    const mPath = document.createElementNS('http://www.w3.org/2000/svg', 'mpath');
    mPath.setAttribute('href', `#${pathId}`);
    
    animate.appendChild(mPath); plasma.appendChild(animate); group.appendChild(plasma);
}

function startStreamOrchestrator() {
    if (streamInterval) clearInterval(streamInterval);
    streamInterval = setInterval(() => {
        clientPaths.forEach(p => { p.classList.remove('stream-active'); p.style.animation = 'none'; });
        if (clientPaths.length === 0) return;

        const activeCount = Math.floor(Math.random() * 3) + 1;
        for(let i=0; i<activeCount; i++) {
            const rndPath = clientPaths[Math.floor(Math.random() * clientPaths.length)];
            rndPath.classList.add('stream-active');
            rndPath.animate([{ strokeDashoffset: '16' }, { strokeDashoffset: '0' }], { duration: 1500, iterations: Infinity, easing: 'linear' });
        }
    }, 4000);
}

function getHexPoints(x, y, r) {
    let pts = [];
    for (let i = 0; i < 6; i++) {
        let a = (Math.PI / 180) * (60 * i - 30);
        pts.push(`${x + r * Math.cos(a)},${y + r * Math.sin(a)}`);
    }
    return pts.join(' ');
}

window.onload = init;

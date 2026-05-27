// Calibrated Coordinates pinned to the static vector map projection boundaries
const SITES = {
    ewa: { x: 145, y: 155, type: 'datacenter', label: "EWA_TUK" },
    phx: { x: 165, y: 220, type: 'datacenter', label: "PHX_AZ" },
    clt: { x: 295, y: 215, type: 'datacenter', label: "CLT_NC" },
    sea: { x: 140, y: 130, type: 'client', label: "SEA_PUG" },
    socal: { x: 150, y: 240, type: 'client', label: "SOCAL" },
    stl: { x: 245, y: 195, type: 'client', label: "STL_BER" },
    rid: { x: 320, y: 180, type: 'client', label: "RID_PA" },
    chs: { x: 305, y: 240, type: 'client', label: "CHS_SC" },
    dab: { x: 310, y: 265, type: 'client', label: "DAB_FL" },
    // Core-Periphery Layout (pinned elegantly to perimeter bounds)
    sjc: { x: 410, y: 420, type: 'client', label: "SJC_BRA" },
    pol: { x: 575, y: 135, type: 'client', label: "POL_WAR" },
    blr: { x: 810, y: 290, type: 'client', label: "BLR_IND" }
};

let SERVICES = [
    { id: "NX_SIEMENS", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "MATLAB_R2", state: "warn", triad: ["ewa", "phx", "clt"], down: ["ewa"] },
    { id: "ANSYS_HPC", state: "crit", triad: ["ewa", "phx", "clt"], down: ["phx", "clt"] },
    { id: "CATIA_V6", state: "ok", triad: ["ewa", "phx", "clt"], down: [] }
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

// Injects the vector world background inside the same coordinate container
function renderVectorMapUnderlay() {
    const layer = document.getElementById('layer-map-underlay');
    // Transform parameters focus cleanly on NA, scaling map features smoothly
    layer.setAttribute('transform', 'translate(-220, -50) scale(1.85)');
    
    // Fetch external low-res world paths securely or embed high performance layout geometry
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
            // Fallback structural bounding box to ensure grid layout safety if offline
            layer.innerHTML = `<rect width="1000" height="500" fill="none" stroke="rgba(255,255,255,0.02)"/>`;
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
        drawLink(SITES[n1], SITES[n2], gQuorum, 'quorum ' + (upNodes.length<3 && !isMacro ?'degraded':''), id);
        if (upNodes.includes(n1) && upNodes.includes(n2)) {
            const speed = Math.hypot(SITES[n1].x - SITES[n2].x, SITES[n1].y - SITES[n2].y) / 40;
            drawPlasmaHighlight(id, Math.max(2.5, speed), (upNodes.length < 3 && !isMacro) ? 'var(--amber)' : 'var(--cyan)', gPlasma);
        }
    };

    if (upNodes.includes("ewa") || (!isMacro && svc.down.includes("ewa"))) drawQuorum("ewa", "phx", "q-ewa-phx");
    if (upNodes.includes("phx") || (!isMacro && svc.down.includes("phx"))) drawQuorum("phx", "clt", "q-phx-clt");
    if (upNodes.includes("clt") || (!isMacro && svc.down.includes("clt"))) drawQuorum("clt", "ewa", "q-clt-ewa");

    Object.keys(SITES).forEach(key => {
        const site = SITES[key];
        const isFault = !isMacro && svc.down.includes(key);

        if (!isMacro && site.type === 'client' && upNodes.length > 0) {
            let closest = upNodes[0];
            let minDist = 9999;
            upNodes.forEach(t => {
                const d = Math.hypot(site.x - SITES[t].x, site.y - SITES[t].y);
                if (d < minDist) { minDist = d; closest = t; }
            });
            const pathId = `path-${key}`;
            const pathEl = drawLink(site, SITES[closest], gClients, 'client', pathId);
            clientPaths.push(pathEl);
        }
        
        if (isMacro && site.type === 'client') return; 

        const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeG.setAttribute('class', `node ${isFault ? 'fault' : ''}`);
        
        if (site.type === 'datacenter') {
            const hexBg = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            hexBg.setAttribute('points', getHexPoints(site.x, site.y, 14));
            hexBg.setAttribute('class', 'node-datacenter-bg');
            
            const hexCore = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            hexCore.setAttribute('points', getHexPoints(site.x, site.y, 7));
            hexCore.setAttribute('class', 'node-datacenter-core');

            nodeG.appendChild(hexBg);
            nodeG.appendChild(hexCore);
        } else {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', site.x); circle.setAttribute('cy', site.y);
            circle.setAttribute('r', '4');
            circle.setAttribute('class', 'node-client');
            nodeG.appendChild(circle);
        }

        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', site.x + 10); lbl.setAttribute('y', site.y - 10);
        lbl.setAttribute('class', 'node-label');
        lbl.textContent = site.label;
        nodeG.appendChild(lbl);

        gNodes.appendChild(nodeG);
    });
}

function drawLink(n1, n2, group, className, id = null) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const cx = (n1.x + n2.x) / 2;
    const cy = Math.min(n1.y, n2.y) - 25;
    path.setAttribute('d', `M ${n1.x} ${n1.y} Q ${cx} ${cy} ${n2.x} ${n2.y}`);
    path.setAttribute('class', `link ${className}`);
    if (id) path.setAttribute('id', id);
    group.appendChild(path);
    return path;
}

function drawPlasmaHighlight(pathId, duration, color, group) {
    const plasma = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    plasma.setAttribute('rx', '10'); plasma.setAttribute('ry', '2.5');
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

        const activeCount = Math.floor(Math.random() * 2) + 1;
        for(let i=0; i<activeCount; i++) {
            const rndPath = clientPaths[Math.floor(Math.random() * clientPaths.length)];
            rndPath.classList.add('stream-active');
            rndPath.animate([{ strokeDashoffset: '16' }, { strokeDashoffset: '0' }], { duration: 1200, iterations: Infinity, easing: 'linear' });
        }
    }, 4500);
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

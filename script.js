let gameState = {
    plates: 3,
    gems: 0,
    collection: [],
    stats: { totalSpins: 0, totalConsumed: 0, platesEarned: 0, freeSpins: 5, lastFreeSpin: Date.now(), pity: 0 },
    pendingItem: null,
    unlockedAchievements: [],
    activeBuffs: { doubleLuckSpins: 0, infinitePlatesUntil: 0 },
    cosmetics: { background: "clouds", liveBackground: null },
    purchasedBackgrounds: [],
    upgrades: { clover: false, magnet: false },
    settings: { volume: 0.8, darkMode: false, powerSaving: false }
};

let config = {};
let allFoods = [];
let inventoryItemForModal = null;
let bgmUnlocked = false;
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [configRes, itemsRes] = await Promise.all([fetch('config.json'), fetch('items.json')]);
        if (!configRes.ok || !itemsRes.ok) throw new Error('Load fail');
        config = await configRes.json();
        allFoods = (await itemsRes.json()).foods;
        
        loadSave();
        applySettingsUI();
        applyBackground();
        applyLiveBackground();
        updateUI();
        renderGrid('collectionGrid', 'collection');
        renderShop();
        renderUpgrades();
        renderCreatorTab();
        renderUpdateLog();
        setupEvents();
        setupNavigation();
        
        setInterval(checkFreeSpin, 60000);
        setInterval(checkBuffs, 1000);
        checkFreeSpin(); checkBuffs();

        document.addEventListener('click', () => {
            if (!bgmUnlocked) {
                const bgm = document.getElementById('bgm');
                if(bgm) { bgm.volume = gameState.settings.volume; bgm.play().catch(()=>{}); }
                bgmUnlocked = true;
            }
        }, { once: true });
    } catch (e) {
        console.error("Error:", e);
        showNotif("Gagal load data.", "error");
    }
});

function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(btn.dataset.view).classList.add('active');
        });
    });
    document.querySelectorAll('.tab-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderGrid('collectionGrid', 'collection');
        });
    });
}

function loadSave() {
    const saved = localStorage.getItem('foodRNGSave');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.keys(parsed).forEach(k => { if(gameState[k] !== undefined) gameState[k] = parsed[k]; });
            if (!gameState.purchasedBackgrounds) gameState.purchasedBackgrounds = [];
            if (!gameState.settings) gameState.settings = { volume: 0.8, darkMode: false, powerSaving: false };
            if (!gameState.upgrades) gameState.upgrades = { clover: false, magnet: false };
            if (gameState.gems === undefined) gameState.gems = 0;
            if (gameState.stats.pity === undefined) gameState.stats.pity = 0;
        } catch (e) { console.error("Save Error", e); }
    }
}

function saveGame() {
    try { localStorage.setItem('foodRNGSave', JSON.stringify(gameState)); updateUI(); } catch (e) {}
}

function setupEvents() {
    document.getElementById('spinBtn').addEventListener('click', doSpin);
    document.getElementById('multiSpinBtn').addEventListener('click', doMultiSpin);
    document.getElementById('freeSpinBtn').addEventListener('click', doFreeSpin);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('closeMultiModal').addEventListener('click', () => document.getElementById('multiModal').classList.remove('active'));
    document.getElementById('itemModal').addEventListener('click', (e) => { if(e.target.id === 'itemModal') closeModal(); });
    document.getElementById('consumeBtn').addEventListener('click', handleConsume);
    document.getElementById('keepBtn').addEventListener('click', handleKeep);
    
    const volSlider = document.getElementById('volumeSlider');
    if(volSlider) {
        volSlider.value = gameState.settings.volume;
        volSlider.addEventListener('input', (e) => {
            gameState.settings.volume = parseFloat(e.target.value);
            applyAudioSettings(); saveGame();
        });
    }
    document.getElementById('darkModeToggle')?.addEventListener('click', toggleDarkMode);
    document.getElementById('powerSavingToggle')?.addEventListener('click', togglePowerSaving);
}

function applySettingsUI() {
    if (gameState.settings.darkMode) document.body.classList.add('dark-mode');
    if (gameState.settings.powerSaving) document.body.classList.add('power-saving');
    const dmBtn = document.getElementById('darkModeToggle');
    const psBtn = document.getElementById('powerSavingToggle');
    if(dmBtn) { dmBtn.textContent = gameState.settings.darkMode ? 'ON' : 'OFF'; dmBtn.classList.toggle('active', gameState.settings.darkMode); }
    if(psBtn) { psBtn.textContent = gameState.settings.powerSaving ? 'ON' : 'OFF'; psBtn.classList.toggle('active', gameState.settings.powerSaving); }
    applyAudioSettings();
}

function toggleDarkMode() {
    gameState.settings.darkMode = !gameState.settings.darkMode;
    document.body.classList.toggle('dark-mode', gameState.settings.darkMode);
    applySettingsUI(); saveGame();
}

function togglePowerSaving() {
    gameState.settings.powerSaving = !gameState.settings.powerSaving;
    document.body.classList.toggle('power-saving', gameState.settings.powerSaving);
    applySettingsUI();
    const video = document.getElementById('liveBgVideo');
    if(video) gameState.settings.powerSaving ? video.pause() : (gameState.cosmetics.liveBackground && video.play().catch(()=>{}));
    saveGame();
}

function applyAudioSettings() {
    const vol = gameState.settings.volume;
    ['sfx-spin','sfx-win','bgm'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.volume = vol;
    });
}

function playSfx(type) {
    if (gameState.settings.powerSaving) return;
    const sfx = type === 'spin' ? document.getElementById('sfx-spin') : document.getElementById('sfx-win');
    if (sfx) { sfx.currentTime = 0; sfx.play().catch(()=>{}); }
}

function applyBackground() {
    const layer = document.querySelector('.bg-layer');
    if (!layer) return;
    if (gameState.cosmetics.liveBackground) { layer.style.backgroundImage = 'none'; return; }
    const bgId = gameState.cosmetics.background || 'clouds';
    const bg = config.shopBackgrounds?.find(b => b.id === bgId);
    layer.style.backgroundImage = bg?.path ? `url('${bg.path}')` : 'url("assets/background/clouds.png")';
}

function applyLiveBackground() {
    const layer = document.querySelector('.live-bg-layer');
    const video = document.getElementById('liveBgVideo');
    const id = gameState.cosmetics.liveBackground;
    if (!id || !config.liveBackgrounds) { layer.classList.remove('active'); video.pause(); video.src = ""; return; }
    applyBackground();
    const bg = config.liveBackgrounds.find(b => b.id === id);
    if (bg) {
        video.src = bg.path; video.load();
        if (!gameState.settings.powerSaving) video.play().catch(()=>{});
        layer.classList.add('active');
    }
}

function renderShop() {
    const grid = document.getElementById('shopGrid'); grid.innerHTML = '';
    if (config.shopBackgrounds) {
        grid.innerHTML += `<h3 style="font-size:0.45em; margin:10px 0; color:#FFF; text-shadow:1px 1px 0 #000;">🖼️ Static BG</h3>`;
        config.shopBackgrounds.forEach(bg => createShopCard(bg, 'static', grid));
    }
    if (config.liveBackgrounds) {
        grid.innerHTML += `<h3 style="font-size:0.45em; margin:10px 0; color:#FFF; text-shadow:1px 1px 0 #000;">🎬 Live BG</h3>`;
        config.liveBackgrounds.forEach(bg => createShopCard(bg, 'live', grid));
    }
}

function createShopCard(bg, type, container) {
    const card = document.createElement('div'); card.className = 'shop-item';
    const isOwned = gameState.purchasedBackgrounds.includes(bg.id);
    const isActive = type === 'static' ? gameState.cosmetics.background === bg.id : gameState.cosmetics.liveBackground === bg.id;
    if (isOwned) card.classList.add('owned');
    if (isActive) card.style.borderColor = '#FF6B6B';
    
    card.innerHTML = `
        <div style="font-weight:bold;">${bg.name}</div>
        <div class="shop-price">${isActive ? '✓ AKTIF' : (isOwned ? 'PUNYA' : `${bg.price} 🍽️`)}</div>
    `;
    card.onclick = () => buyBackground(bg, type);
    container.appendChild(card);
}

function buyBackground(bg, type) {
    if (gameState.purchasedBackgrounds.includes(bg.id)) {
        if (type === 'static') { gameState.cosmetics.background = bg.id; gameState.cosmetics.liveBackground = null; }
        else { gameState.cosmetics.liveBackground = bg.id; gameState.cosmetics.background = 'clouds'; }
        applyBackground(); applyLiveBackground(); showNotif(`${bg.name} diaktifkan!`, "success");
    } else {
        if (gameState.plates < bg.price) return showNotif("Piring kurang!", "error");
        gameState.plates -= bg.price; gameState.purchasedBackgrounds.push(bg.id);
        if (type === 'static') { gameState.cosmetics.background = bg.id; gameState.cosmetics.liveBackground = null; applyBackground(); }
        else { gameState.cosmetics.liveBackground = bg.id; gameState.cosmetics.background = 'clouds'; applyBackground(); applyLiveBackground(); }
        showNotif(`Dibeli: ${bg.name}`, "success");
    }
    saveGame(); renderShop(); updateUI();
}

function renderUpgrades() {
    const grid = document.getElementById('upgradeGrid');
    if(!grid || !config.upgrades) return;
    grid.innerHTML = '';
    config.upgrades.forEach(up => {
        const card = document.createElement('div');
        const isOwnedPermanent = up.type === 'permanent' && gameState.upgrades[up.id];
        card.className = `upgrade-card ${isOwnedPermanent ? 'owned-permanent' : ''}`;
        card.innerHTML = `
            <div style="font-size:1.2em;">${up.name.split(' ')[0]}</div>
            <div style="font-weight:bold;">${up.name.substring(up.name.indexOf(' ')+1)}</div>
            <div style="font-size:0.8em; color:#555;">${up.description}</div>
            <div class="upgrade-price">${isOwnedPermanent ? '✓ AKTIF' : `${up.price} 💎`}</div>
        `;
        if (!isOwnedPermanent) card.onclick = () => buyUpgrade(up);
        grid.appendChild(card);
    });
}

function buyUpgrade(up) {
    if (gameState.gems < up.price) return showNotif("Gems kurang!", "error");
    gameState.gems -= up.price;
    if (up.type === 'permanent') {
        gameState.upgrades[up.id] = true;
        showNotif(`Upgrade ${up.name} aktif!`, "success");
    } else if (up.id === 'timer') {
        gameState.stats.lastFreeSpin -= up.effect.freeSpinReduction;
        showNotif("Waktu Free Spin dipercepat!", "success");
    } else if (up.id === 'luckpotion') {
        gameState.activeBuffs.doubleLuckSpins += up.effect.addDoubleLuck;
        showNotif(`+${up.effect.addDoubleLuck} Double Luck!`, "success");
    }
    saveGame(); renderUpgrades(); updateUI();
}

function renderCreatorTab() {
    const list = document.getElementById('creatorList'); if (!config.credits) return;
    list.innerHTML = '';
    config.credits.forEach(c => { 
        list.innerHTML += `<div style="margin-bottom:8px;"><strong>${c.name}</strong><br><a href="${c.link}" target="_blank" style="color:#4ECDC4;">${c.source}</a></div>`; 
    });
}

function renderUpdateLog() {
    const list = document.getElementById('updateLogList'); if (!config.updateLog) return; list.innerHTML = '';
    config.updateLog.forEach(log => {
        const el = document.createElement('div'); el.style.marginBottom = '12px';
        el.innerHTML = `<div class="update-ver">v${log.v}</div><div class="update-date">${log.date}</div><ul class="update-changes">${log.changes.map(c => `<li>${c}</li>`).join('')}</ul>`;
        list.appendChild(el);
    });
}

function doSpin() {
    if (gameState.activeBuffs.infinitePlatesUntil <= Date.now() && gameState.plates < 1) return showNotif("Piring habis!", "error");
    if (gameState.activeBuffs.infinitePlatesUntil <= Date.now()) gameState.plates--;
    gameState.stats.totalSpins++;
    playSfx('spin');
    runSpinAnimation(false);
}

function doMultiSpin() {
    const cost = 9;
    if (gameState.activeBuffs.infinitePlatesUntil <= Date.now() && gameState.plates < cost) return showNotif("Piring kurang untuk 10x Pull!", "error");
    if (gameState.activeBuffs.infinitePlatesUntil <= Date.now()) gameState.plates -= cost;
    
    document.getElementById('spinBtn').disabled = true;
    document.getElementById('multiSpinBtn').disabled = true;
    document.getElementById('freeSpinBtn').disabled = true;
    playSfx('spin');

    const display = document.getElementById('spinDisplay');
    display.classList.add('shaking');
    let count = 0;
    const interval = setInterval(() => {
        displayItem(display, allFoods[Math.floor(Math.random() * allFoods.length)]);
        if (++count >= 15) { 
            clearInterval(interval); 
            display.classList.remove('shaking'); 
            let results = [];
            for(let i=0; i<10; i++) {
                gameState.stats.totalSpins++;
                results.push(finalizeSpin(true));
            }
            showMultiModal(results);
            document.getElementById('spinBtn').disabled = false;
            document.getElementById('multiSpinBtn').disabled = false;
            document.getElementById('freeSpinBtn').disabled = gameState.stats.freeSpins <= 0;
        }
    }, 50);
}

function doFreeSpin() {
    if (gameState.stats.freeSpins <= 0) return;
    gameState.stats.freeSpins--; gameState.stats.totalSpins++;
    playSfx('spin');
    runSpinAnimation(false);
}

function runSpinAnimation(isMulti) {
    const display = document.getElementById('spinDisplay');
    document.getElementById('spinBtn').disabled = true; 
    document.getElementById('multiSpinBtn').disabled = true;
    document.getElementById('freeSpinBtn').disabled = true;
    display.classList.add('shaking'); let count = 0;
    const interval = setInterval(() => {
        displayItem(display, allFoods[Math.floor(Math.random() * allFoods.length)]);
        if (++count >= 30) { clearInterval(interval); display.classList.remove('shaking'); finalizeSpin(isMulti); }
    }, 100);
}

function finalizeSpin(isMulti = false) {
    const display = document.getElementById('spinDisplay');
    const hasBuff = gameState.activeBuffs.doubleLuckSpins > 0;
    
    gameState.stats.pity++;
    let forcedRarity = null;
    if (gameState.stats.pity >= config.pity.legendaryGuarantee) forcedRarity = 'legendary';
    else if (gameState.stats.pity >= config.pity.epicGuarantee) forcedRarity = 'epic';

    const rarity = forcedRarity || getRarityFromWeights(config.rarityWeights, hasBuff);
    if (rarity === 'epic' || rarity === 'legendary') gameState.stats.pity = 0;

    if (hasBuff) gameState.activeBuffs.doubleLuckSpins--;
    const pool = allFoods.filter(f => f.rarity === rarity);
    const baseResult = pool[Math.floor(Math.random() * pool.length)];
    
    const isShiny = Math.random() < 0.01;
    const result = { ...baseResult, isShiny: isShiny };

    if (!isMulti) {
        gameState.pendingItem = result; 
        displayItem(display, result);
        showModal(result, false); 
        playSfx('win');
        document.getElementById('spinBtn').disabled = false;
        document.getElementById('multiSpinBtn').disabled = false;
        document.getElementById('freeSpinBtn').disabled = gameState.stats.freeSpins <= 0;
    }
    
    if (rarity === 'legendary') gameState.gems += 2;
    else if (rarity === 'epic') gameState.gems += 1;

    saveGame(); checkAchievements(); updateUI();
    return result;
}

function showMultiModal(items) {
    const grid = document.getElementById('multiModalGrid');
    grid.innerHTML = '';
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = `item-card ${item.rarity} ${item.isShiny ? 'shiny' : ''}`;
        card.style.cursor = 'default';
        const img = document.createElement('div');
        img.className = 'item-image';
        displayItem(img, item);
        card.appendChild(img);
        card.innerHTML += `<div class="item-name">${item.name}</div>`;
        grid.appendChild(card);
        
        const ex = gameState.collection.find(i => i.id === item.id && i.isShiny === item.isShiny);
        if (ex) ex.count++; 
        else gameState.collection.push({...item, count:1});
    });
    document.getElementById('multiModal').classList.add('active');
    saveGame();
    renderGrid('collectionGrid', 'collection');
}

function handleConsume() {
    const item = gameState.pendingItem || inventoryItemForModal; if (!item) return;
    let reward = config.plateReward.consume; let msg = " ";
    const map = { common: {p:1}, rare: {p:2, m: " Free Spin cepat "}, epic: {p:3, m: "🍀 Double Luck "}, legendary: {p:5, m: "♾️ Inf Plates "} };
    const r = map[item.rarity] || {p:0}; reward += r.p; msg = r.m || " ";
    
    if (item.isShiny) { reward *= 2; msg += " (SHINY 2x!)"; }
    if (gameState.upgrades.magnet && Math.random() < 0.1) { reward *= 2; msg += " (Magnet 2x!)"; }

    if (item.rarity === 'rare') gameState.stats.lastFreeSpin -= 300000;
    else if (item.rarity === 'epic') gameState.activeBuffs.doubleLuckSpins += 5;
    else if (item.rarity === 'legendary') { gameState.activeBuffs.infinitePlatesUntil = Date.now() + 30000; gameState.plates = Math.max(gameState.plates, 999); }

    if (inventoryItemForModal) {
        const idx = gameState.collection.findIndex(i => i.id === item.id && i.isShiny === item.isShiny);
        if (idx > -1) { gameState.collection[idx].count--; if(gameState.collection[idx].count <=0) gameState.collection.splice(idx,1); }
        inventoryItemForModal = null;
    }
    
    gameState.stats.totalConsumed++; gameState.stats.platesEarned += reward; gameState.plates += reward;
    showNotif(`+${reward} Piring. ${msg}`, "success"); closeModal(); saveGame();
    renderGrid('collectionGrid', 'collection');
}

function handleKeep() {
    const item = gameState.pendingItem; if (!item) return;
    const ex = gameState.collection.find(i => i.id === item.id && i.isShiny === item.isShiny);
    if (ex) ex.count++; else gameState.collection.push({...item, count:1});
    showNotif("Disimpan!", "success"); closeModal(); saveGame();
    renderGrid('collectionGrid', 'collection');
}

function checkAchievements() {
    const s = gameState.stats, c = gameState.unlockedAchievements;
    const achs = [
        {id:'firstSpin', c:s.totalSpins>=1, t:config.achievements.firstSpin}, 
        {id:'c10', c:gameState.collection.length>=10, t:config.achievements.collector10},
        {id:'c50', c:gameState.collection.length>=50, t:config.achievements.collector50},
        {id:'foodie', c:s.totalConsumed>=20, t:config.achievements.foodie}
    ];
    achs.forEach(a => {
        if(a.c && !c.includes(a.id)) { c.push(a.id); showNotif(`🏆 ${a.t}`, "success"); }
    });
}

function renderGrid(gridId, type) {
    const grid = document.getElementById(gridId); if (!grid) return; grid.innerHTML = '';
    let itemsToShow = (type === 'collection') ? allFoods : gameState.collection.filter(i => i.count > 0);
    if (currentFilter !== 'all') itemsToShow = itemsToShow.filter(i => i.rarity === currentFilter);
    
    itemsToShow.forEach(food => {
        const ownedNormal = gameState.collection.find(i => i.id === food.id && !i.isShiny);
        const ownedShiny = gameState.collection.find(i => i.id === food.id && i.isShiny);
        let count = 0;
        let isShiny = false;
        if (ownedShiny) { count += ownedShiny.count; isShiny = true; }
        if (ownedNormal) { count += ownedNormal.count; }
        
        const displayData = isShiny ? {...food, isShiny: true} : food;
        const card = createCard(displayData, count, type);
        grid.appendChild(card);
    });
}

function createCard(item, count, type) {
    const card = document.createElement('div');
    const locked = type === 'collection' && count === 0;
    card.className = `item-card ${item.rarity} ${item.isShiny ? 'shiny' : ''} ${locked ? 'locked' : ''}`;
    const img = document.createElement('div');
    img.className = `item-image ${locked ? 'silhouette' : ''}`;
    displayItem(img, item); card.appendChild(img);
    card.innerHTML += `<div class="item-name">${locked ? '???' : item.name}</div>`;
    card.innerHTML += `<div class="item-count">${locked ? '🔒' : (count ? `x${count}` : '')}</div>`;
    
    if (count > 0) {
        card.style.cursor = 'pointer';
        card.onclick = () => {
            const invItem = gameState.collection.find(i => i.id === item.id && i.isShiny === item.isShiny);
            if(invItem) showModal(invItem, true);
        };
    }
    return card;
}

function displayItem(el, item) {
    if (item?.image) { el.style.backgroundImage = `url('${item.image}')`; el.textContent = ''; }
    else { el.style.backgroundImage = 'none'; el.textContent = item?.emoji || '?'; }
}

function showModal(item, fromInv) {
    inventoryItemForModal = fromInv ? item : null; gameState.pendingItem = fromInv ? null : item;
    const m = document.getElementById('itemModal');
    const imgEl = document.getElementById('modalImage');
    displayItem(imgEl, item);
    if(item.isShiny) imgEl.classList.add('shiny'); else imgEl.classList.remove('shiny');
    
    document.getElementById('modalTitle').textContent = item.name + (item.isShiny ? ' ✨' : '');
    document.getElementById('modalDesc').textContent = item.description;
    const rEl = document.getElementById('modalRarity');
    rEl.textContent = item.rarity.toUpperCase(); rEl.className = `modal-rarity ${item.rarity}`;
    document.getElementById('consumeBtn').textContent = `MAKAN (+${item.rarity==='legendary'?5:item.rarity==='epic'?3:item.rarity==='rare'?2:1})`;
    m.classList.add('active');
}

function closeModal() { document.getElementById('itemModal').classList.remove('active'); inventoryItemForModal = null; }

function checkFreeSpin() {
    const now = Date.now(), int = config.freeSpinInterval || 3600000;
    if (now - gameState.stats.lastFreeSpin >= int) {
        const amt = Math.floor((now - gameState.stats.lastFreeSpin) / int);
        gameState.stats.freeSpins = Math.min(gameState.stats.freeSpins + amt, config.freeSpinMax || 5);
        gameState.stats.lastFreeSpin = now; saveGame(); updateUI(); showNotif(`+${amt} Free Spin!`, "success");
    }
}

function checkBuffs() {
    const el = document.getElementById('buffIndicator'), now = Date.now(); let msg = [];
    if (gameState.activeBuffs.doubleLuckSpins > 0) msg.push(`🍀 Luck:${gameState.activeBuffs.doubleLuckSpins}`);
    if (gameState.activeBuffs.infinitePlatesUntil > now) msg.push(`♾️ Inf:${Math.ceil((gameState.activeBuffs.infinitePlatesUntil-now)/1000)}s`);
    el.textContent = msg.length ? msg.join(' | ') : '⏳ No Buffs';
}

function updateUI() {
    const p = document.getElementById('plateCount');
    if (p) { p.textContent = gameState.plates; p.style.animation='none'; setTimeout(()=>p.style.animation='',10); }
    
    const g = document.getElementById('gemCount');
    if(g) g.textContent = gameState.gems;
    
    const f = document.getElementById('freeSpinBtn');
    if (f) f.textContent = `FREE (${gameState.stats.freeSpins})`;
    
    const pity = document.getElementById('pityCount');
    if(pity) pity.textContent = gameState.stats.pity;
    
    const pityBar = document.getElementById('pityBar');
    if(pityBar) {
        const pct = (gameState.stats.pity / config.pity.legendaryGuarantee) * 100;
        pityBar.style.width = `${pct}%`;
    }
}

function showNotif(msg, type='success') {
    const n = document.createElement('div'); n.className = `notification ${type}`; n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => { n.style.opacity='0'; setTimeout(()=>n.remove(), 300); }, 2000);
}

function getRarityFromWeights(w, buff) {
    let wt = {...w}; 
    if(buff) { wt.legendary *= 2; wt.epic *= 1.5; }
    if(gameState.upgrades.clover) { wt.legendary += 0.5; wt.epic += 0.5; }
    const tot = Object.values(wt).reduce((a,b)=>a+b,0); 
    let r = Math.random()*tot;
    for(const [key, val] of Object.entries(wt)) { if(r < val) return key; r -= val; }
    return 'common';
}
let gameState = {
    plates: 3,
    collection: [],
    stats: { totalSpins: 0, totalConsumed: 0, platesEarned: 0, freeSpins: 5, lastFreeSpin: Date.now() },
    pendingItem: null,
    unlockedAchievements: [],
    activeBuffs: { doubleLuckSpins: 0, infinitePlatesUntil: 0 },
    cosmetics: { background: "clouds" }
};

let config = {};
let allFoods = [];
let inventoryItemForModal = null;

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [configRes, itemsRes] = await Promise.all([
            fetch('config.json'),
            fetch('items.json')
        ]);

        if (!configRes.ok || !itemsRes.ok) throw new Error('Failed to load resources');

        config = await configRes.json();
        allFoods = (await itemsRes.json()).foods;
        
        loadSave();
        applyBackground();
        updateUI();
        renderGrid('collectionGrid', gameState.collection, 'collection');
        renderGrid('inventoryGrid', gameState.collection, 'inventory');
        renderShop();
        renderUpdateLog();
        setupEvents();
        
        setInterval(checkFreeSpin, 60000);
        setInterval(checkBuffs, 1000);
        checkFreeSpin();
        checkBuffs();
    } catch (e) {
        console.error("Error loading game:", e);
        showNotif("Gagal load data. Pastikan file JSON ada.", "error");
    }
});

// ═══════════════════════════════════════════════════════════════
// SAVE & LOAD SYSTEM
// ═══════════════════════════════════════════════════════════════
function loadSave() {
    const saved = localStorage.getItem('foodRNGSave');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.keys(parsed).forEach(k => { 
                if (gameState[k] !== undefined) gameState[k] = parsed[k]; 
            });
            if (Date.now() > gameState.activeBuffs.infinitePlatesUntil) {
                gameState.activeBuffs.infinitePlatesUntil = 0;
            }
        } catch (e) {
            console.error("Error loading save:", e);
        }
    }
}

function saveGame() {
    try {
        localStorage.setItem('foodRNGSave', JSON.stringify(gameState));
        updateUI();
    } catch (e) {
        console.error("Error saving game:", e);
    }
}

// ═══════════════════════════════════════════════════════════════
// EVENT SETUP
// ═══════════════════════════════════════════════════════════════
function setupEvents() {
    document.getElementById('spinBtn').addEventListener('click', doSpin);
    document.getElementById('freeSpinBtn').addEventListener('click', doFreeSpin);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            const tabId = e.target.dataset.tab;
            document.getElementById(tabId).classList.add('active');
            e.target.setAttribute('aria-selected', 'true');
            Array.from(e.target.parentElement.querySelectorAll('.tab-btn')).forEach(b => {
                if (b !== e.target) b.setAttribute('aria-selected', 'false');
            });
        });
    });

    document.getElementById('consumeBtn').addEventListener('click', handleConsume);
    document.getElementById('keepBtn').addEventListener('click', handleKeep);
    document.getElementById('tradeCommonBtn').addEventListener('click', () => doTrade('rare'));
    document.getElementById('tradeEpicBtn').addEventListener('click', () => doTrade('epic'));

    // Close modal on backdrop click
    document.getElementById('itemModal').addEventListener('click', (e) => {
        if (e.target.id === 'itemModal') closeModal();
    });
}

// ═══════════════════════════════════════════════════════════════
// RARITY & RANDOMIZATION
// ═══════════════════════════════════════════════════════════════
function getRarityFromWeights(weights, buffed = false) {
    let w = { ...weights };
    if (buffed) w.legendary *= 2;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    
    for (const [rarity, weight] of Object.entries(w)) {
        if (rand < weight) return rarity;
        rand -= weight;
    }
    return 'legendary';
}

// ═══════════════════════════════════════════════════════════════
// SPIN MECHANICS
// ═══════════════════════════════════════════════════════════════
function doSpin() {
    if (gameState.activeBuffs.infinitePlatesUntil <= Date.now() && gameState.plates < 1) {
        return showNotif("Piring habis!", "error");
    }
    
    if (gameState.activeBuffs.infinitePlatesUntil <= Date.now()) {
        gameState.plates--;
    }
    
    gameState.stats.totalSpins++;
    runSpinAnimation();
}

function doFreeSpin() {
    if (gameState.stats.freeSpins <= 0) return;
    gameState.stats.freeSpins--;
    gameState.stats.totalSpins++;
    runSpinAnimation();
}

function runSpinAnimation() {
    const display = document.getElementById('spinDisplay');
    const btnSpin = document.getElementById('spinBtn');
    const btnFree = document.getElementById('freeSpinBtn');
    
    btnSpin.disabled = true;
    btnFree.disabled = true;
    display.classList.add('shaking');
    
    let count = 0;
    const interval = setInterval(() => {
        const randomItem = allFoods[Math.floor(Math.random() * allFoods.length)];
        displayItem(display, randomItem);
        
        if (++count > 15) {
            clearInterval(interval);
            display.classList.remove('shaking');
            finalizeSpin();
        }
    }, 80);
}

function finalizeSpin() {
    const display = document.getElementById('spinDisplay');
    const hasBuff = gameState.activeBuffs.doubleLuckSpins > 0;
    const rarity = getRarityFromWeights(config.rarityWeights, hasBuff);
    
    if (hasBuff) gameState.activeBuffs.doubleLuckSpins--;
    
    const pool = allFoods.filter(f => f.rarity === rarity);
    const result = pool[Math.floor(Math.random() * pool.length)];
    
    gameState.pendingItem = result;
    displayItem(display, result);
    showModal(result, false);
    
    document.getElementById('spinBtn').disabled = false;
    document.getElementById('freeSpinBtn').disabled = gameState.stats.freeSpins <= 0;
    
    saveGame();
    checkAchievements();
}

// ═══════════════════════════════════════════════════════════════
// CONSUME & KEEP MECHANICS
// ═══════════════════════════════════════════════════════════════
function handleConsume() {
    const item = gameState.pendingItem || inventoryItemForModal;
    if (!item) return;

    let platesReward = config.plateReward.consume;
    let buffMsg = "";

    // Calculate rewards based on rarity
    const rarityRewards = {
        common: { plates: 1, msg: "" },
        rare: { plates: 2, msg: "⏳ Free Spin lebih cepat!" },
        epic: { plates: 3, msg: "🍀 Double Luck (5 Spin)!" },
        legendary: { plates: 5, msg: "♾️ Infinite Plates (30s)!" }
    };

    const reward = rarityRewards[item.rarity] || { plates: 0, msg: "" };
    platesReward += reward.plates;
    buffMsg = reward.msg;

    // Apply buff effects
    if (item.rarity === 'rare') {
        gameState.stats.lastFreeSpin -= 300000;
    } else if (item.rarity === 'epic') {
        gameState.activeBuffs.doubleLuckSpins += 5;
    } else if (item.rarity === 'legendary') {
        gameState.activeBuffs.infinitePlatesUntil = Date.now() + 30000;
        gameState.plates = 999;
    }

    // Remove from inventory if applicable
    if (inventoryItemForModal) {
        const idx = gameState.collection.findIndex(i => i.id === item.id);
        if (idx !== -1) {
            gameState.collection[idx].count--;
            if (gameState.collection[idx].count <= 0) {
                gameState.collection.splice(idx, 1);
            }
        }
        inventoryItemForModal = null;
    }

    gameState.stats.totalConsumed++;
    gameState.stats.platesEarned += platesReward;
    gameState.plates += platesReward;

    showNotif(`Enak! +${platesReward} Piring. ${buffMsg}`, "success");
    closeModal();
    saveGame();
    
    renderGrid('collectionGrid', gameState.collection, 'collection');
    renderGrid('inventoryGrid', gameState.collection, 'inventory');
    checkAchievements();
}

function handleKeep() {
    const item = gameState.pendingItem;
    if (!item) return;

    const existing = gameState.collection.find(i => i.id === item.id);
    if (existing) {
        existing.count++;
    } else {
        gameState.collection.push({ ...item, count: 1 });
    }

    showNotif("Disimpan ke Inventory!", "success");
    closeModal();
    saveGame();
    
    renderGrid('collectionGrid', gameState.collection, 'collection');
    renderGrid('inventoryGrid', gameState.collection, 'inventory');
}

// ═══════════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ═══════════════════════════════════════════════════════════════
function checkAchievements() {
    const s = gameState.stats;
    const c = gameState.unlockedAchievements;
    
    const list = [
        { id: 'firstSpin', cond: s.totalSpins >= 1, title: config.achievements.firstSpin },
        { id: 'collector10', cond: gameState.collection.length >= 10, title: config.achievements.collector10 },
        { id: 'collector50', cond: gameState.collection.length >= 50, title: config.achievements.collector50 },
        { id: 'foodie', cond: s.totalConsumed >= 20, title: config.achievements.foodie },
        { id: 'plateMaster', cond: s.platesEarned >= 50, title: config.achievements.plateMaster }
    ];

    list.forEach(a => {
        if (a.cond && !c.includes(a.id)) {
            c.push(a.id);
            showNotif(`🏆 ${a.title}`, "success");
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// TRADE SYSTEM
// ═══════════════════════════════════════════════════════════════
function doTrade(targetRarity) {
    const cost = targetRarity === 'rare' ? config.trade.commonToRareCost : config.trade.commonToEpicCost;
    
    const commons = gameState.collection.reduce((sum, item) => {
        return sum + (item.rarity === 'common' ? item.count : 0);
    }, 0);

    if (commons < cost) {
        return showNotif(`Butuh ${cost} Common!`, "error");
    }

    // Remove commons
    let removed = cost;
    for (let i = gameState.collection.length - 1; i >= 0; i--) {
        if (gameState.collection[i].rarity === 'common') {
            if (gameState.collection[i].count <= removed) {
                removed -= gameState.collection[i].count;
                gameState.collection.splice(i, 1);
            } else {
                gameState.collection[i].count -= removed;
                removed = 0;
            }
            if (removed <= 0) break;
        }
    }

    // Add new item
    const pool = allFoods.filter(f => f.rarity === targetRarity);
    const reward = pool[Math.floor(Math.random() * pool.length)];
    
    const existing = gameState.collection.find(i => i.id === reward.id);
    if (existing) {
        existing.count++;
    } else {
        gameState.collection.push({ ...reward, count: 1 });
    }

    showNotif(`Trade Berhasil! Dapat ${reward.name}`, "success");
    saveGame();
    
    renderGrid('collectionGrid', gameState.collection, 'collection');
    renderGrid('inventoryGrid', gameState.collection, 'inventory');
}

// ═══════════════════════════════════════════════════════════════
// SHOP & COSMETICS
// ═══════════════════════════════════════════════════════════════
function renderShop() {
    const grid = document.getElementById('shopGrid');
    grid.innerHTML = '';

    config.shopBackgrounds.forEach(bg => {
        const card = document.createElement('div');
        card.className = 'shop-item';
        
        const isOwned = gameState.cosmetics.background === bg.id;
        if (isOwned) card.classList.add('owned');

        card.innerHTML = `
            <div class="item-image" style="background: linear-gradient(135deg, #8B8B8B 0%, #696969 100%);"></div>
            <div class="item-name">${bg.name}</div>
            <div class="shop-price">${isOwned ? 'DIPAKAI' : `${bg.price} 🍽️`}</div>
        `;

        card.onclick = () => buyBackground(bg);
        grid.appendChild(card);
    });
}

function buyBackground(bg) {
    if (gameState.cosmetics.background === bg.id) return;
    if (gameState.plates < bg.price) {
        return showNotif("Piring tidak cukup!", "error");
    }

    gameState.plates -= bg.price;
    gameState.cosmetics.background = bg.id;
    applyBackground();
    showNotif("Background Baru Terpasang!", "success");
    saveGame();
    renderShop();
    updateUI();
}

function applyBackground() {
    const bg = config.shopBackgrounds.find(b => b.id === gameState.cosmetics.background);
    const el = document.querySelector('.bg-layer');
    if (bg && bg.path) {
        el.style.backgroundImage = `url('${bg.path}')`;
    } else {
        el.style.backgroundImage = 'url("assets/background/clouds.png")';
    }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE LOG
// ═══════════════════════════════════════════════════════════════
function renderUpdateLog() {
    const list = document.getElementById('updateLogList');
    list.innerHTML = '';

    config.updateLog.forEach((log, index) => {
        const entry = document.createElement('div');
        entry.className = 'update-entry';
        entry.style.animationDelay = `${index * 0.1}s`;

        entry.innerHTML = `
            <div class="update-ver">v${log.v}</div>
            <div class="update-date">${log.date}</div>
            <ul class="update-changes">
                ${log.changes.map(c => `<li>- ${c}</li>`).join('')}
            </ul>
        `;

        list.appendChild(entry);
    });
}

// ═══════════════════════════════════════════════════════════════
// BUFF SYSTEM
// ═══════════════════════════════════════════════════════════════
function checkBuffs() {
    const ind = document.getElementById('buffIndicator');
    const now = Date.now();
    let msgs = [];

    if (gameState.activeBuffs.doubleLuckSpins > 0) {
        msgs.push(`🍀 Double Luck: ${gameState.activeBuffs.doubleLuckSpins} spin`);
    }

    if (gameState.activeBuffs.infinitePlatesUntil > now) {
        const sec = Math.ceil((gameState.activeBuffs.infinitePlatesUntil - now) / 1000);
        msgs.push(`♾️ Inf Plates: ${sec}s`);
    }

    ind.textContent = msgs.length > 0 ? msgs.join(' | ') : '⏳ No Active Buffs';
}

// ═══════════════════════════════════════════════════════════════
// UI UPDATES
// ═══════════════════════════════════════════════════════════════
function updateUI() {
    const plateCountEl = document.getElementById('plateCount');
    plateCountEl.textContent = gameState.plates;
    plateCountEl.style.animation = 'none';
    setTimeout(() => { plateCountEl.style.animation = ''; }, 10);

    document.getElementById('freeSpinBtn').textContent = `FREE (${gameState.stats.freeSpins})`;
}

// ═══════════════════════════════════════════════════════════════
// DISPLAY HELPERS
// ═══════════════════════════════════════════════════════════════
function displayItem(element, item) {
    if (item?.image) {
        element.style.backgroundImage = `url('${item.image}')`;
        element.textContent = '';
    } else {
        element.style.backgroundImage = 'none';
        element.textContent = item?.emoji || '?';
    }
}

// ═══════════════════════════════════════════════════════════════
// MODAL SYSTEM
// ═══════════════════════════════════════════════════════════════
function showModal(item, fromInventory = false) {
    inventoryItemForModal = fromInventory ? item : null;
    gameState.pendingItem = fromInventory ? null : item;

    const modal = document.getElementById('itemModal');
    const img = document.getElementById('modalImage');
    displayItem(img, item);

    document.getElementById('modalTitle').textContent = item.name;
    document.getElementById('modalDesc').textContent = item.description;

    const rarityEl = document.getElementById('modalRarity');
    rarityEl.textContent = item.rarity.toUpperCase();
    rarityEl.className = `modal-rarity ${item.rarity}`;

    // Update consume button text
    if (fromInventory) {
        const rarityPlates = { common: 2, rare: 3, epic: 4, legendary: 6 };
        const plates = rarityPlates[item.rarity] || 1;
        document.getElementById('consumeBtn').textContent = `MAKAN (+${plates})`;
    } else {
        document.getElementById('consumeBtn').textContent = 'MAKAN (+1)';
    }

    modal.classList.add('active');
    modal.focus();
}

function closeModal() {
    document.getElementById('itemModal').classList.remove('active');
    inventoryItemForModal = null;
}

// ═══════════════════════════════════════════════════════════════
// GRID RENDERING
// ═══════════════════════════════════════════════════════════════
function renderGrid(elementId, items, type) {
    const grid = document.getElementById(elementId);
    grid.innerHTML = '';

    if (type === 'inventory' && items.length === 0) {
        grid.innerHTML = '<p style="font-size:0.4em; text-align:center; padding:20px; color:#999; grid-column: 1/-1;">Kosong</p>';
        return;
    }
    
    const list = type === 'collection' ? allFoods : items;
    
    list.forEach((food, index) => {
        const owned = items.find(i => i.id === food.id);
        if (type === 'inventory' && !owned) return;
        
        const card = createCard(food, owned ? owned.count : 0, type);
        card.style.animationDelay = `${index * 0.05}s`;
        grid.appendChild(card);
    });
}

function createCard(item, count, type) {
    const card = document.createElement('div');
    const isLocked = type === 'collection' && count === 0;
    
    card.className = `item-card ${item.rarity} ${isLocked ? 'locked' : ''}`;

    // Image
    const imgDiv = document.createElement('div');
    imgDiv.className = 'item-image';
    if (isLocked) {
        imgDiv.textContent = '?';
        imgDiv.style.color = '#666';
    } else {
        displayItem(imgDiv, item);
    }
    card.appendChild(imgDiv);

    // Name
    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = isLocked ? '???' : item.name;
    card.appendChild(name);

    // Count
    const cnt = document.createElement('div');
    cnt.className = 'item-count';
    cnt.textContent = isLocked ? '🔒' : (count > 0 ? `x${count}` : '');
    card.appendChild(cnt);

    // Click handler for inventory items
    if (type === 'inventory' && count > 0) {
        card.addEventListener('click', () => showModal(item, true));
        card.style.cursor = 'pointer';
    }

    return card;
}

// ═══════════════════════════════════════════════════════════════
// FREE SPIN SYSTEM
// ═══════════════════════════════════════════════════════════════
function checkFreeSpin() {
    const now = Date.now();
    const interval = config.freeSpinInterval || 3600000;
    const elapsed = now - gameState.stats.lastFreeSpin;

    if (elapsed >= interval) {
        const amount = Math.floor(elapsed / interval);
        gameState.stats.freeSpins = Math.min(
            gameState.stats.freeSpins + amount,
            config.freeSpinMax || 5
        );
        gameState.stats.lastFreeSpin = now;
        saveGame();
        updateUI();
        showNotif(`Dapat ${amount} Free Spin!`, "success");
    }
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════
function showNotif(msg, type = "success") {
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.textContent = msg;
    notif.className += ` ${type}`;
    
    document.body.appendChild(notif);

    setTimeout(() => {
        notif.style.opacity = '0';
        setTimeout(() => notif.remove(), 300);
    }, 2500);
}

// ===============================================
// EDUSEARCH AI - Logique Principale V3 (Anti-Panne)
// ===============================================

const API_KEY = 'AIzaSyD9kZm89bENZXyErbv7oYZFAIY4383kfqs'; 

// Proxy pour contourner les erreurs CORS
const PROXY_URL = 'https://api.allorigins.win/raw?url='; 

let synth = window.speechSynthesis;
let currentUtterance = null;
let db; 

// ===============================================
// 1. UI & NAVIGATION
// ===============================================

document.getElementById('hamburger-menu').addEventListener('click', () => {
    document.getElementById('nav-links').classList.toggle('show');
});

function showSection(id) {
    document.getElementById('recherche-section').classList.add('hidden');
    document.querySelectorAll('.hidden-section').forEach(s => s.classList.add('hidden'));
    
    document.getElementById(id).classList.remove('hidden');
    document.getElementById('nav-logo').classList.remove('hidden');
    document.getElementById('nav-links').classList.remove('show');
    
    if(id === 'historique') loadHistory();
    if(id === 'favoris') loadFavorites();
}

function resetToHome() {
    document.querySelectorAll('.hidden-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('recherche-section').classList.remove('hidden');
    document.getElementById('recherche-section').classList.remove('results-active');
    document.getElementById('search-results-container').classList.add('hidden');
    document.getElementById('nav-logo').classList.add('hidden');
    document.getElementById('main-search-query').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle(); 
    initializeIndexedDB();
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if(user && user.niveau) document.getElementById('user-profile').value = user.niveau;
});

function handleKeyPress(e) { 
    if (e.key === 'Enter') executeSearch(); 
}

function feelingLucky() {
    const q =["Pédagogie différenciée", "Félix Tshisekedi", "Comment fonctionne une IA ?", "Les lois de Newton", "Histoire de la RDC"];
    document.getElementById('main-search-query').value = q[Math.floor(Math.random() * q.length)];
    executeSearch();
}

// ===============================================
// 2. RECHERCHE VOCALE (Micro)
// ===============================================

function startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Votre navigateur ne supporte pas la recherche vocale.");
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    const btn = document.getElementById('voice-btn');
    
    recognition.onstart = () => btn.classList.add('listening');
    recognition.onresult = (event) => {
        document.getElementById('main-search-query').value = event.results[0][0].transcript;
        executeSearch();
    };
    recognition.onend = () => btn.classList.remove('listening');
    recognition.start();
}

// ===============================================
// 3. ANIMATION DE CHARGEMENT (Skeleton Loader)
// ===============================================

function showSkeletonLoader() {
    const imagesHub = document.getElementById('images-hub');
    const resultsList = document.getElementById('results-list');
    
    imagesHub.innerHTML = Array(4).fill('<div class="skeleton-box skeleton-img"></div>').join('');
    resultsList.innerHTML = Array(3).fill(`
        <div class="search-result">
            <div class="skeleton-box" style="width: 30%; height: 12px; margin-bottom: 8px;"></div>
            <div class="skeleton-box skeleton-title"></div>
            <div class="skeleton-box"></div>
            <div class="skeleton-box" style="width: 80%;"></div>
        </div>
    `).join('');
}

// ===============================================
// 4. LOGIQUE API & MODE SECOURS (Wikipedia)
// ===============================================

async function executeSearch() {
    const query = document.getElementById('main-search-query').value.trim();
    const profile = document.getElementById('user-profile').value;
    if (!query) return;

    document.getElementById('recherche-section').classList.add('results-active');
    document.getElementById('nav-logo').classList.remove('hidden');
    document.getElementById('search-results-container').classList.remove('hidden');
    
    showSkeletonLoader();

    if (!navigator.onLine) {
        document.getElementById('results-list').innerHTML = '<p>🌐 Mode hors ligne. Veuillez vérifier votre connexion internet.</p>';
        document.getElementById('images-hub').innerHTML = '';
        return;
    }

    try {
        const results = await fetchSerpApi(query, profile);
        displayResults(results);
        saveToHistory({ id: Date.now(), query, level: profile, timestamp: new Date().toLocaleString('fr-FR') });
    } catch (error) {
        document.getElementById('results-list').innerHTML = `<p style="color:var(--g-red);">⚠️ Erreur: ${error.message}</p>`;
        document.getElementById('images-hub').innerHTML = '';
    }
}

async function fetchSerpApi(query, level) {
    const filters = {
        'eleve': 'wikipedia.org|vikidia.org|maxicours.com|lumni.fr',
        'etudiant': 'wikipedia.org|cairn.info|jstor.org|scholar.google.com|hal.science',
        'professeur': 'eduscol.education.fr|reseau-canope.fr|education.gouv.fr'
    };
    
    try {
        const params = new URLSearchParams({ engine: 'google', q: query, api_key: API_KEY, gl: 'fr', hl: 'fr', num: 10 });
        if (filters[level]) params.append('as_sitesearch', filters[level]);

        let response = await fetch(PROXY_URL + encodeURIComponent(`https://serpapi.com/search?${params.toString()}`));
        let data = await response.json();
        
        if(data.error) throw new Error("API Limit"); // Déclenche le catch si limite atteinte

        let processed = processResults(data);

        // Fallback sans filtre si aucun résultat
        if (processed.web.length === 0) {
            params.delete('as_sitesearch');
            response = await fetch(PROXY_URL + encodeURIComponent(`https://serpapi.com/search?${params.toString()}`));
            data = await response.json();
            if(data.error) throw new Error("API Limit");
            processed = processResults(data);
        }
        
        if (processed.web.length === 0) throw new Error("API Limit");
        return processed;

    } catch (error) {
        console.warn("API Google indisponible ou limite atteinte. Passage au Mode Secours (Wikipedia)...");
        return await fetchWikipediaFallback(query);
    }
}

// Le Mode Secours : Si la clé Google est épuisée
async function fetchWikipediaFallback(query) {
    // origin=* est très important pour contourner les erreurs CORS de Wikipedia
    const url = `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.query || !data.query.search || data.query.search.length === 0) {
        throw new Error("Aucun résultat trouvé, même sur notre encyclopédie de secours. Essayez de reformuler la question.");
    }
    
    const res = { web:[], images:[] };
    
    // Message informatif pour l'utilisateur
    res.web.push({
        title: "ℹ️ Base de données encyclopédique",
        snippet: "Mode secours activé. Voici les résultats issus de l'encyclopédie libre (Wikipedia) pour garantir que vous ayez toujours accès à l'éducation.",
        source: "Système de secours EduSearch",
        link: "#",
        thumb: null // Pas de miniature pour le message d'alerte
    });

    data.query.search.slice(0, 10).forEach(item => {
        let cleanSnippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, ""); // Nettoyer les balises HTML de Wikipedia
        res.web.push({
            title: item.title,
            snippet: cleanSnippet + "...",
            source: "Wikipedia",
            link: `https://fr.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
            thumb: null // <--- CORRECTION : On met "null" pour enlever l'image cassée
        });
    });
    return res;
}

function processResults(data) {
    const res = { web:[], images: data.inline_images ? data.inline_images.slice(0, 6).map(i => i.thumbnail) :[] };
    
    if (data.answer_box) {
         res.web.push({ title: data.answer_box.title || 'Définition Rapide', snippet: data.answer_box.answer || data.answer_box.snippet, source: 'Réponse Directe', link: data.answer_box.source?.link || '#', thumb: data.answer_box.thumbnail });
    }
    
    if (data.organic_results) {
        data.organic_results.slice(0, 10).forEach(item => {
            let domain = 'Web'; try { domain = new URL(item.link).hostname; } catch(e){}
            res.web.push({ title: item.title, snippet: item.snippet, source: domain, link: item.link, thumb: item.thumbnail });
            if(res.images.length < 5 && item.thumbnail) res.images.push(item.thumbnail);
        });
    }
    return res;
}

// ===============================================
// 5. AFFICHAGE DES RÉSULTATS
// ===============================================

function displayResults(results) {
    const imagesHub = document.getElementById('images-hub');
    const resultsList = document.getElementById('results-list');
    
    imagesHub.innerHTML = results.images.map(img => `<img src="${img}" alt="Image illustrant la recherche">`).join('');
    
    resultsList.innerHTML = results.web.map(res => {
        const titleEsc = res.title.replace(/"/g, '\\"');
        const snipEsc = res.snippet ? res.snippet.replace(/"/g, '\\"') : '';
        const thumbHtml = res.thumb ? `<img src="${res.thumb}" class="thumbnail" alt="miniature" onerror="this.style.display='none'">` : '';
        
        return `
        <div class="search-result">
            <div class="source">
                <img src="https://www.google.com/s2/favicons?domain=${res.link}&sz=16" style="width:16px; height:16px; border-radius:50%;" onerror="this.style.display='none'"> 
                ${res.source}
            </div>
            <h3><a href="${res.link}" target="_blank">${res.title}</a></h3>
            <div class="snippet-container">
                <p>${res.snippet || 'Aucune description fournie pour ce lien.'}</p>
                ${thumbHtml}
            </div>
            <div class="result-actions">
                <button class="btn-primary-action" onclick="readAloud(\`${titleEsc}. ${snipEsc}\`, this)">▶️ Écouter</button>
                <button onclick="addToFavorites(\`${titleEsc}\`, \`${snipEsc}\`, \`${res.link}\`)">⭐ Garder en favoris</button>
            </div>
        </div>`;
    }).join('');
}

// ===============================================
// 6. OUTILS (Lecture vocale, Historique, Favoris, Thème)
// ===============================================

function readAloud(text, btn) {
    if(!synth) return alert("Lecture vocale non supportée sur ce navigateur.");
    if(synth.speaking) { 
        synth.cancel(); 
        btn.innerHTML="▶️ Écouter"; 
        return; 
    }
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = 'fr-FR';
    currentUtterance.onstart = () => btn.innerHTML = "⏹️ Arrêter";
    currentUtterance.onend = () => btn.innerHTML = "▶️ Écouter";
    synth.speak(currentUtterance);
}

document.getElementById('registration-form').addEventListener('submit', (e) => {
    e.preventDefault();
    localStorage.setItem('currentUser', JSON.stringify({ 
        prenom: document.getElementById('prenom').value, 
        niveau: document.getElementById('niveau').value 
    }));
    document.getElementById('registration-message').textContent = "Profil enregistré avec succès !";
    setTimeout(() => resetToHome(), 1500);
});

function setupThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    const isDark = localStorage.getItem('theme') === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    btn.textContent = isDark ? '🌙' : '☀️';
    btn.onclick = () => {
        const dark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', dark ? 'dark' : 'light');
        btn.textContent = dark ? '🌙' : '☀️';
    };
}

// -- Gestion de l'Historique --
function saveToHistory(item) {
    let hist = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    hist.unshift(item);
    localStorage.setItem('searchHistory', JSON.stringify(hist.slice(0, 15)));
}

function loadHistory() {
    const list = document.getElementById('history-list');
    const hist = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    list.innerHTML = hist.map(h => `
        <li class="history-item">
            <div>
                <strong>${h.query}</strong><br>
                <small>${h.level} | ${h.timestamp}</small>
            </div>
        </li>`).join('') || '<p>Votre historique est vide.</p>';
}

// -- Gestion des Favoris --
function addToFavorites(t, s, l) {
    let fav = JSON.parse(localStorage.getItem('favorites') || '[]');
    if(!fav.find(f => f.title === t)) { 
        fav.push({title: t, snippet: s, link: l}); 
        localStorage.setItem('favorites', JSON.stringify(fav)); 
        alert("Ressource ajoutée aux favoris ! ⭐");
    } else {
        alert("Déjà dans vos favoris !");
    }
}

function loadFavorites() {
    const list = document.getElementById('favorites-list');
    const fav = JSON.parse(localStorage.getItem('favorites') || '[]');
    list.innerHTML = fav.map(f => `
        <li class="favorite-item">
            <div style="flex-grow: 1; margin-right: 15px;">
                <a href="${f.link}" target="_blank" style="color:var(--g-blue);font-weight:bold;text-decoration:none;">${f.title}</a><br>
                <small>${f.snippet}</small>
            </div> 
            <button onclick="deleteFav('${f.title.replace(/'/g, "\\'")}')" style="background:#ea4335;color:white;border:none;padding:8px 12px;border-radius:4px;cursor:pointer;font-weight:bold;">X</button>
        </li>`).join('') || '<p>Vous n\'avez aucun favori pour l\'instant.</p>';
}

function deleteFav(title) { 
    let fav = JSON.parse(localStorage.getItem('favorites') || '[]');
    // On garde tous les favoris sauf celui qu'on veut supprimer
    fav = fav.filter(f => f.title !== title);
    localStorage.setItem('favorites', JSON.stringify(fav));
    loadFavorites();
}

// ===============================================
// 7. GESTION HORS LIGNE (IndexedDB)
// ===============================================

const DB_NAME = 'EduSearchDB';
const DB_VERSION = 1;
const STORE_NAME = 'searches';

function initializeIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Erreur IndexedDB:", event.target.errorCode);
            reject(event.target.errorCode);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
    });
}

function saveToIndexedDB(searchData) {
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(searchData);
}

// FIN DU FICHIER
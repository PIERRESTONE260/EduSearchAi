// ===============================================
// EDUSEARCH AI - Logique Principale Finale (Version Ultime)
// ===============================================

const API_KEY = '1228fa094e3fc5c0cec02da190f00c94094a5ceb17332a536d8642313734a662'; 
const PROXY_URL = 'https://api.allorigins.win/raw?url='; 

let synth = window.speechSynthesis;
let currentUtterance = null;
let typingTimeout = null; 
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
    if(id === 'inscription') {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (user && user.prenom) {
            document.getElementById('display-user-name').innerText = `Bonjour, ${user.prenom} !`;
        } else {
            document.getElementById('display-user-name').innerText = `Mon Profil`;
        }
    }
}

function resetToHome() {
    document.querySelectorAll('.hidden-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('recherche-section').classList.remove('hidden');
    document.getElementById('recherche-section').classList.remove('results-active');
    document.getElementById('search-results-container').classList.add('hidden');
    document.getElementById('nav-logo').classList.add('hidden');
    document.getElementById('main-search-query').value = '';
    clearTimeout(typingTimeout);
}

document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle(); 
    initializeIndexedDB();
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if(user && user.niveau) document.getElementById('user-profile').value = user.niveau;
    if(user && user.lang) document.getElementById('lang-trad').value = user.lang;
});

function handleKeyPress(e) { 
    if (e.key === 'Enter') {
        document.getElementById('autocomplete-list').innerHTML = '';
        executeSearch(); 
    }
}

function feelingLucky() {
    const q =["L'histoire des ordinateurs", "Kinshasa", "Comment fonctionne une IA ?", "Les lois de Newton", "La photosynthèse RDC"];
    document.getElementById('main-search-query').value = q[Math.floor(Math.random() * q.length)];
    executeSearch();
}

// ===============================================
// 2. AUTOCOMPLÉTION & VOIX
// ===============================================

const searchInput = document.getElementById('main-search-query');
const autoList = document.getElementById('autocomplete-list');

searchInput.addEventListener('input', async function() {
    let val = this.value.trim();
    autoList.innerHTML = '';
    if (!val || val.length < 2) return; 

    try {
        const res = await fetch(`https://fr.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(val)}&limit=5&format=json&origin=*`);
        const data = await res.json();
        
        data[1].forEach(sugg => {
            let div = document.createElement('div');
            div.innerHTML = `🔍 <strong>${sugg.substr(0, val.length)}</strong>${sugg.substr(val.length)}`;
            div.addEventListener('click', function() {
                searchInput.value = sugg;
                autoList.innerHTML = '';
                executeSearch(); 
            });
            autoList.appendChild(div);
        });
    } catch(e) {}
});

document.addEventListener('click', (e) => {
    if (e.target !== searchInput) autoList.innerHTML = '';
});

function startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Recherche vocale non supportée.");
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    const btn = document.getElementById('voice-btn');
    
    recognition.onstart = () => btn.classList.add('listening');
    recognition.onresult = (e) => {
        document.getElementById('main-search-query').value = e.results[0][0].transcript;
        executeSearch();
    };
    recognition.onend = () => btn.classList.remove('listening');
    recognition.start();
}

// ===============================================
// 3. LOGIQUE DE RECHERCHE & FALLBACK
// ===============================================

function showSkeletonLoader() {
    document.getElementById('images-hub').innerHTML = Array(4).fill('<div class="skeleton-box skeleton-img"></div>').join('');
    document.getElementById('results-list').innerHTML = Array(3).fill(`
        <div class="search-result">
            <div class="skeleton-box" style="width: 30%; height: 12px; margin-bottom: 8px;"></div>
            <div class="skeleton-box skeleton-title"></div>
            <div class="skeleton-box"></div>
            <div class="skeleton-box" style="width: 80%;"></div>
        </div>
    `).join('');
    document.getElementById('ai-summary-card').classList.add('hidden');
}

async function executeSearch() {
    const query = document.getElementById('main-search-query').value.trim();
    const profile = document.getElementById('user-profile').value;
    if (!query) return;

    document.getElementById('recherche-section').classList.add('results-active');
    document.getElementById('nav-logo').classList.remove('hidden');
    document.getElementById('search-results-container').classList.remove('hidden');
    autoList.innerHTML = '';
    
    showSkeletonLoader();

    if (!navigator.onLine) {
        document.getElementById('results-list').innerHTML = '<p>🌐 Mode hors ligne. Connexion requise.</p>';
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
        if (data.error) throw new Error("API Limit"); 

        let processed = processResults(data);

        if (processed.web.length === 0) {
            params.delete('as_sitesearch');
            response = await fetch(PROXY_URL + encodeURIComponent(`https://serpapi.com/search?${params.toString()}`));
            data = await response.json();
            if (data.error) throw new Error("API Limit");
            processed = processResults(data);
        }
        
        if (processed.web.length === 0) throw new Error("API Limit");
        return processed;

    } catch (error) {
        return await fetchUnlimitedSources(query, level);
    }
}

function processResults(data) {
    const res = { web:[], images: data.inline_images ? data.inline_images.slice(0, 6).map(i => i.thumbnail) :[] };
    if (data.answer_box) {
         res.web.push({ title: data.answer_box.title || 'Définition', snippet: data.answer_box.answer || data.answer_box.snippet, source: 'Réponse Directe', link: data.answer_box.source?.link || '#', thumb: data.answer_box.thumbnail, priority: 1 });
    }
    if (data.organic_results) {
        data.organic_results.slice(0, 10).forEach(item => {
            let domain = 'Web'; try { domain = new URL(item.link).hostname; } catch(e){}
            res.web.push({ title: item.title, snippet: item.snippet, source: domain, link: item.link, thumb: item.thumbnail, priority: 2 });
            if(res.images.length < 5 && item.thumbnail) res.images.push(item.thumbnail);
        });
    }
    return res;
}

// ===============================================
// 4. LE MÉTA-MOTEUR (10 API SIMULTANÉES)
// ===============================================

async function fetchUnlimitedSources(query, level) {
    const res = { web: [], images:[] };
    const fetchAPI = async (name, task) => { try { await task(); } catch (e) {} };
    const promises =[];

    promises.push(fetchAPI('Wikipedia', async () => {
        const url = `https://fr.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&prop=pageimages|extracts&exchars=250&exintro=1&pithumbsize=400&format=json&origin=*`;
        const data = await (await fetch(url)).json();
        if (data.query && data.query.pages) {
            Object.values(data.query.pages).forEach(p => {
                res.web.push({ title: p.title, snippet: p.extract ? p.extract.replace(/<\/?[^>]+(>|$)/g, "") : "Pas de description.", source: "Wikipedia", link: `https://fr.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, thumb: p.thumbnail ? p.thumbnail.source : null, priority: 1 });
                if(p.thumbnail) res.images.push(p.thumbnail.source);
            });
        }
    }));

    promises.push(fetchAPI('Commons', async () => {
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url&format=json&origin=*`;
        const data = await (await fetch(url)).json();
        if (data.query && data.query.pages) {
            Object.values(data.query.pages).forEach(p => { if(p.imageinfo && p.imageinfo[0]) res.images.push(p.imageinfo[0].url); });
        }
    }));

    promises.push(fetchAPI('Wiktionary', async () => {
        const url = `https://fr.wiktionary.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
        const data = await (await fetch(url)).json();
        if (data.query && data.query.search) {
            data.query.search.slice(0, 2).forEach(p => {
                res.web.push({ title: "Définition : " + p.title, snippet: p.snippet.replace(/<\/?[^>]+(>|$)/g, "") + "...", source: "Wiktionary", link: `https://fr.wiktionary.org/wiki/${encodeURIComponent(p.title)}`, thumb: null, priority: 2 });
            });
        }
    }));

    promises.push(fetchAPI('OpenLibrary', async () => {
        const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=2`;
        const data = await (await fetch(url)).json();
        if (data.docs) {
            data.docs.forEach(doc => {
                res.web.push({ title: "Livre : " + doc.title, snippet: `Auteur: ${doc.author_name ? doc.author_name.join(', ') : 'Inconnu'}. Année: ${doc.first_publish_year || 'N/A'}.`, source: "Open Library", link: `https://openlibrary.org${doc.key}`, thumb: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null, priority: 4 });
            });
        }
    }));

    if (level === 'etudiant' || level === 'professeur') {
        promises.push(fetchAPI('HAL', async () => {
            const url = `https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(query)}&wt=json&fl=title_s,uri_s,abstract_s&rows=2`;
            const data = await (await fetch(url)).json();
            if (data.response && data.response.docs) {
                data.response.docs.forEach(doc => {
                    res.web.push({ title: "Thèse : " + doc.title_s[0], snippet: doc.abstract_s ? doc.abstract_s[0].substring(0, 200) + "..." : "Document issu des archives.", source: "HAL Science", link: doc.uri_s, thumb: "https://hal.science/img/logo-hal.svg", priority: 3 });
                });
            }
        }));

        promises.push(fetchAPI('OpenAlex', async () => {
            const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=2`;
            const data = await (await fetch(url)).json();
            if (data.results) {
                data.results.forEach(doc => {
                    res.web.push({ title: "Recherche : " + (doc.title || 'Document'), snippet: `Année: ${doc.publication_year}. Citations: ${doc.cited_by_count}.`, source: "OpenAlex", link: doc.doi || doc.id, thumb: null, priority: 4 });
                });
            }
        }));
    }

    await Promise.allSettled(promises);
    res.images =[...new Set(res.images)].slice(0, 15);

    if (res.web.length === 0) throw new Error("Aucun résultat trouvé. Vérifiez l'orthographe.");
    res.web.sort((a, b) => (a.priority || 10) - (b.priority || 10));

    return res;
}

// ===============================================
// 5. AFFICHAGE ET SYNTHÈSE IA
// ===============================================

function displayResults(results) {
    const imagesHub = document.getElementById('images-hub');
    const resultsList = document.getElementById('results-list');
    const aiCard = document.getElementById('ai-summary-card');
    const aiText = document.getElementById('ai-summary-text');
    
    clearTimeout(typingTimeout); 
    
    // IA TYPING EFFECT
    let bestResultIndex = results.web.findIndex(r => r.priority === 1 || r.source.includes('Wikipedia') || r.source.includes('Directe'));
    
    if (bestResultIndex !== -1 && results.web[bestResultIndex].snippet && results.web[bestResultIndex].snippet.length > 30) {
        aiCard.classList.remove('hidden');
        aiText.innerHTML = ''; 
        let textToType = results.web[bestResultIndex].snippet;
        results.web.splice(bestResultIndex, 1); 
        
        let i = 0;
        function typeWriter() {
            if (i < textToType.length) {
                aiText.innerHTML += textToType.charAt(i);
                i++;
                typingTimeout = setTimeout(typeWriter, 15);
            }
        }
        typeWriter();
    } else {
        aiCard.classList.add('hidden');
    }

    // LISTE DES RESULTATS
    imagesHub.innerHTML = results.images.map(img => `<img src="${img}" alt="Image" onerror="this.style.display='none'">`).join('');
    
    resultsList.innerHTML = results.web.map(res => {
        const safeTitle = encodeURIComponent(res.title);
        const safeSnippet = encodeURIComponent(res.snippet || '');
        const safeLink = encodeURIComponent(res.link);
        const thumbHtml = res.thumb ? `<img src="${res.thumb}" class="thumbnail" alt="mini" onerror="this.style.display='none'">` : '';
        
        return `
        <div class="search-result">
            <div class="source">
                <img src="https://www.google.com/s2/favicons?domain=${res.link}&sz=16" style="width:16px; height:16px; border-radius:50%;" onerror="this.style.display='none'"> 
                ${res.source}
            </div>
            <h3><a href="${res.link}" target="_blank" class="res-title-link">${res.title}</a></h3>
            <div class="snippet-container">
                <p class="res-snippet-text">${res.snippet || 'Aucune description fournie.'}</p>
                ${thumbHtml}
            </div>
            <div class="result-actions">
                <button class="btn-primary-action" onclick="readAloud(decodeURIComponent('${safeTitle}'), decodeURIComponent('${safeSnippet}'), this)">▶️ Écouter</button>
                <button onclick="addToFavorites(decodeURIComponent('${safeTitle}'), decodeURIComponent('${safeSnippet}'), decodeURIComponent('${safeLink}'))">⭐ Garder</button>
                <button onclick="translateCard(this)" title="Traduire ce résultat">🌍 Traduire</button>
            </div>
        </div>`;
    }).join('');
}

// ===============================================
// 6. TRADUCTION GOOGLE (MULTI-LANGUES)
// ===============================================

async function translateCard(btn) {
    const user = JSON.parse(localStorage.getItem('currentUser')) || {};
    const targetLang = user.lang || 'fr'; 

    const card = btn.closest('.search-result');
    const titleLink = card.querySelector('.res-title-link');
    const snippetP = card.querySelector('.res-snippet-text');

    const originalTitle = titleLink.innerText;
    const originalSnippet = snippetP.innerText;

    btn.innerHTML = '⏳...';
    btn.disabled = true;

    try {
        const urlTitle = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(originalTitle)}`;
        const urlSnippet = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(originalSnippet)}`;

        const[resTitle, resSnippet] = await Promise.all([fetch(urlTitle), fetch(urlSnippet)]);
        const dataTitle = await resTitle.json();
        const dataSnippet = await resSnippet.json();

        titleLink.innerText = dataTitle[0].map(x => x[0]).join('');
        snippetP.innerText = dataSnippet[0].map(x => x[0]).join('');

        btn.innerHTML = '✅ Traduit';
        btn.style.color = 'var(--g-green)';
    } catch (e) {
        btn.innerHTML = '❌ Erreur';
        btn.disabled = false;
    }
}

// ===============================================
// 7. PROFILS & VOIX
// ===============================================

function readAloud(title, snippet, btn) {
    if(!synth) return alert("Lecture vocale non supportée.");
    if(synth.speaking) { 
        synth.cancel(); 
        btn.innerHTML="▶️ Écouter"; 
        return; 
    }
    currentUtterance = new SpeechSynthesisUtterance(title + ". " + snippet);
    currentUtterance.lang = 'fr-FR';
    currentUtterance.onstart = () => btn.innerHTML = "⏹️ Arrêter";
    currentUtterance.onend = () => btn.innerHTML = "▶️ Écouter";
    synth.speak(currentUtterance);
}

document.getElementById('registration-form').addEventListener('submit', (e) => {
    e.preventDefault();
    localStorage.setItem('currentUser', JSON.stringify({ 
        prenom: document.getElementById('prenom').value, 
        niveau: document.getElementById('niveau').value,
        lang: document.getElementById('lang-trad').value
    }));
    document.getElementById('registration-message').textContent = "Profil enregistré avec succès !";
    setTimeout(() => { document.getElementById('registration-message').textContent = ""; resetToHome(); }, 1500);
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

// ===============================================
// 8. HISTORIQUE & FAVORIS (Nouveau Design Dashboard)
// ===============================================

function saveToHistory(item) {
    let hist = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    hist.unshift(item);
    localStorage.setItem('searchHistory', JSON.stringify(hist.slice(0, 30))); 
}

function loadHistory() {
    const list = document.getElementById('history-list');
    const hist = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    list.innerHTML = hist.map(h => `
        <div class="timeline-item">
            <div class="timeline-content">
                <strong>🔍 ${h.query}</strong>
                <small>${h.level.toUpperCase()} • ${h.timestamp}</small>
            </div>
        </div>`).join('') || '<p style="text-align:center; color:var(--secondary-text); width:100%;">Votre historique est vide.</p>';
}

function clearHistory() {
    if(confirm("Voulez-vous vraiment effacer tout votre historique ?")) {
        localStorage.setItem('searchHistory', '[]');
        loadHistory();
    }
}

function addToFavorites(t, s, l) {
    let fav = JSON.parse(localStorage.getItem('favorites') || '[]');
    if(!fav.find(f => f.title === t)) { 
        fav.push({title: t, snippet: s, link: l}); 
        localStorage.setItem('favorites', JSON.stringify(fav)); 
        alert("⭐ Ressource ajoutée aux favoris !");
    } else {
        alert("Déjà dans vos favoris !");
    }
}

function loadFavorites() {
    const list = document.getElementById('favorites-list');
    const fav = JSON.parse(localStorage.getItem('favorites') || '[]');
    list.innerHTML = fav.map(f => {
        const safeTitle = encodeURIComponent(f.title);
        return `
        <div class="favorite-card">
            <div>
                <a href="${f.link}" target="_blank" class="fav-title">${f.title}</a>
                <p class="fav-snippet">${f.snippet}</p>
            </div>
            <div class="fav-actions">
                <span style="font-size:12px; color:var(--secondary-text);">Sauvegardé</span>
                <button class="delete-item-btn" title="Supprimer ce favori" onclick="deleteFav(decodeURIComponent('${safeTitle}'))">❌</button>
            </div>
        </div>`;
    }).join('') || '<p style="text-align:center; color:var(--secondary-text); grid-column: 1 / -1;">Vous n\'avez aucun favori pour l\'instant.</p>';
}

function deleteFav(title) { 
    let fav = JSON.parse(localStorage.getItem('favorites') || '[]');
    fav = fav.filter(f => f.title !== title);
    localStorage.setItem('favorites', JSON.stringify(fav));
    loadFavorites();
}

function clearFavorites() {
    if(confirm("Voulez-vous vraiment effacer tous vos favoris ?")) {
        localStorage.setItem('favorites', '[]');
        loadFavorites();
    }
}

// ===============================================
// 9. HORS LIGNE (IndexedDB)
// ===============================================

function initializeIndexedDB() {
    const request = indexedDB.open('EduSearchDB', 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains('searches')) db.createObjectStore('searches', { keyPath: 'id' });
    };
    request.onsuccess = (e) => { db = e.target.result; };
}

function saveToIndexedDB(data) {
    if (!db) return;
    db.transaction(['searches'], 'readwrite').objectStore('searches').put(data);
}

// FIN DU FICHIER COMPLET
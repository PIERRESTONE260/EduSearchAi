const API_KEY = '1228fa094e3fc5c0cec02da190f00c94094a5ceb17332a536d8642313734a662'; 
const PROXY_URL = 'https://api.allorigins.win/raw?url='; 

let synth = window.speechSynthesis;
let currentUtterance = null;
let typingTimeout = null; 
let db; 
let currentPageNumber = 1;
let currentSearchQuery = "";

// ==========================================
// SCROLL INTELLIGENT 
// ==========================================
let lastScrollY = window.scrollY;
const mainHeader = document.getElementById('main-header');
const searchContainer = document.getElementById('search-container');

window.addEventListener('scroll', () => {
    let currentScrollY = window.scrollY;
    
    if(currentScrollY > 10) mainHeader.classList.add('header-scrolled');
    else mainHeader.classList.remove('header-scrolled');

    if (document.getElementById('recherche-section').classList.contains('results-active')) {
        if (currentScrollY > lastScrollY && currentScrollY > 100) {
            mainHeader.style.transform = 'translateY(-100%)';
            searchContainer.style.top = '0px'; 
        } else {
            mainHeader.style.transform = 'translateY(0)';
            searchContainer.style.top = window.innerWidth <= 768 ? '60px' : '70px';
        }
    }
    lastScrollY = currentScrollY;
});


// ==========================================
// UI & NAVIGATION
// ==========================================
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
    document.getElementById('search-tabs').classList.add('hidden');
    document.getElementById('nav-logo').classList.add('hidden');
    document.getElementById('main-search-query').value = '';
    
    mainHeader.style.transform = 'translateY(0)';
    searchContainer.style.top = 'auto';

    clearTimeout(typingTimeout);
}

function switchTab(tabId, btnElement) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.getElementById(`tab-content-${tabId}`).classList.remove('hidden');

    if(tabId === 'images' && document.getElementById('full-images-grid').innerHTML === '') {
        fetchTabImages();
    }
    if(tabId === 'videos' && document.getElementById('youtube-videos-grid').innerHTML === '') {
        fetchTabVideos();
    }
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
        executeSearch(1); 
    }
}

function feelingLucky() {
    const q =["L'histoire des ordinateurs", "Kinshasa", "Comment fonctionne une IA ?", "Les lois de Newton", "La photosynthèse"];
    document.getElementById('main-search-query').value = q[Math.floor(Math.random() * q.length)];
    executeSearch(1);
}

// ==========================================
// AUTOCOMPLETION & VOIX
// ==========================================
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
                executeSearch(1); 
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
        executeSearch(1);
    };
    recognition.onend = () => btn.classList.remove('listening');
    recognition.start();
}

// ==========================================
// INTELLIGENCE : DÉFINITIONS (Wiktionary)
// ==========================================
function isDefinitionIntent(q) {
    const words = q.trim().split(/\s+/);
    if (words.length === 1) return true; 
    const regex = /^(définition|definition|c'est quoi|que signifie|que veut dire|définir|sens du mot|sens de)\b/i;
    return regex.test(q); 
}

async function fetchDefinition(q) {
    let cleanQ = q.replace(/^(définition de|definition de|définition|definition|c'est quoi( un| une| le| la| l')?|que signifie|que veut dire|définir|sens du mot|sens de)\s*/i, '').trim();
    try {
        const url = `https://fr.wiktionary.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&utf8=&format=json&origin=*`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.query && data.query.search && data.query.search.length > 0) {
            const snippet = data.query.search[0].snippet.replace(/<\/?[^>]+(>|$)/g, "");
            return {
                title: "📖 Définition : " + data.query.search[0].title,
                snippet: snippet + "...",
                source: "Wiktionary",
                link: `https://fr.wiktionary.org/wiki/${encodeURIComponent(data.query.search[0].title)}`,
                thumb: null,
                priority: 0 
            };
        }
    } catch(e) {}
    return null;
}

// ==========================================
// RECHERCHE PRINCIPALE & PAGINATION
// ==========================================
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
    document.getElementById('pagination-web').innerHTML = '';
}

async function executeSearch(page = 1) {
    const query = document.getElementById('main-search-query').value.trim();
    const profile = document.getElementById('user-profile').value;
    if (!query) return;

    currentSearchQuery = query;
    currentPageNumber = page;

    document.getElementById('recherche-section').classList.add('results-active');
    document.getElementById('nav-logo').classList.remove('hidden');
    document.getElementById('search-tabs').classList.remove('hidden');
    document.getElementById('search-results-container').classList.remove('hidden');
    
    // Réinitialiser les autres onglets pour forcer un rechargement
    document.getElementById('full-images-grid').innerHTML = '';
    document.getElementById('youtube-videos-grid').innerHTML = '';

    autoList.innerHTML = '';
    showSkeletonLoader();
    window.scrollTo(0, 0);

    if (!navigator.onLine) {
        document.getElementById('results-list').innerHTML = '<p>🌐 Mode hors ligne. Connexion requise.</p>';
        document.getElementById('images-hub').innerHTML = '';
        return;
    }

    try {
        let results = await fetchUnlimitedSources(query, profile, page);
        
        // Intercepter la définition si page 1
        if (page === 1 && isDefinitionIntent(query)) {
            const def = await fetchDefinition(query);
            if (def) {
                results.web = results.web.filter(r => !r.source.includes('Wiktionary'));
                results.web.unshift(def); 
            }
        }

        displayResults(results, page);
        if(page === 1) {
            saveToHistory({ id: Date.now(), query, level: profile, timestamp: new Date().toLocaleString('fr-FR') });
        }
    } catch (error) {
        document.getElementById('results-list').innerHTML = `<p style="color:var(--g-red);">⚠️ Erreur: ${error.message}</p>`;
        document.getElementById('images-hub').innerHTML = '';
    }
}

// ==========================================
// MÉTAMOTEUR DE RECHERCHE (ILLIMITÉ)
// ==========================================
async function fetchUnlimitedSources(query, level, page) {
    const res = { web: [], images:[] };
    const fetchAPI = async (name, task) => { try { await task(); } catch (e) {} };
    const promises =[];

    const offset = (page - 1) * 10;

    promises.push(fetchAPI('Wikipedia', async () => {
        const url = `https://fr.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsroffset=${offset}&gsrlimit=8&prop=pageimages|extracts&explaintext=1&exsentences=3&exintro=1&pithumbsize=400&format=json&origin=*`;
        const data = await (await fetch(url)).json();
        if (data.query && data.query.pages) {
            Object.values(data.query.pages).forEach(p => {
                res.web.push({ title: p.title, snippet: p.extract ? p.extract : "Pas de description.", source: "Wikipedia", link: `https://fr.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, thumb: p.thumbnail ? p.thumbnail.source : null, priority: 1 });
                if(p.thumbnail) res.images.push(p.thumbnail.source);
            });
        }
    }));

    promises.push(fetchAPI('Wiktionary', async () => {
        if(page > 1) return; // Seulement page 1
        const url = `https://fr.wiktionary.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
        const data = await (await fetch(url)).json();
        if (data.query && data.query.search) {
            data.query.search.slice(0, 2).forEach(p => {
                res.web.push({ title: "Définition : " + p.title, snippet: p.snippet.replace(/<\/?[^>]+(>|$)/g, "") + "...", source: "Wiktionary", link: `https://fr.wiktionary.org/wiki/${encodeURIComponent(p.title)}`, thumb: null, priority: 2 });
            });
        }
    }));

    promises.push(fetchAPI('OpenLibrary', async () => {
        const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&page=${page}&limit=3`;
        const data = await (await fetch(url)).json();
        if (data.docs) {
            data.docs.forEach(doc => {
                res.web.push({ title: "Livre : " + doc.title, snippet: `Auteur: ${doc.author_name ? doc.author_name.join(', ') : 'Inconnu'}. Année: ${doc.first_publish_year || 'N/A'}.`, source: "Open Library", link: `https://openlibrary.org${doc.key}`, thumb: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null, priority: 4 });
            });
        }
    }));

    if (level === 'etudiant' || level === 'professeur') {
        promises.push(fetchAPI('HAL', async () => {
            const url = `https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(query)}&wt=json&fl=title_s,uri_s,abstract_s&start=${offset}&rows=3`;
            const data = await (await fetch(url)).json();
            if (data.response && data.response.docs) {
                data.response.docs.forEach(doc => {
                    res.web.push({ title: "Thèse : " + doc.title_s[0], snippet: doc.abstract_s ? doc.abstract_s[0].substring(0, 200) + "..." : "Document issu des archives.", source: "HAL Science", link: doc.uri_s, thumb: "https://hal.science/img/logo-hal.svg", priority: 3 });
                });
            }
        }));

        promises.push(fetchAPI('OpenAlex', async () => {
            const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&page=${page}&per-page=3`;
            const data = await (await fetch(url)).json();
            if (data.results) {
                data.results.forEach(doc => {
                    res.web.push({ title: "Recherche : " + (doc.title || 'Document'), snippet: `Année: ${doc.publication_year}. Citations: ${doc.cited_by_count}.`, source: "OpenAlex", link: doc.doi || doc.id, thumb: null, priority: 4 });
                });
            }
        }));
    }

    await Promise.allSettled(promises);
    res.images = [...new Set(res.images)].slice(0, 15);

    if (res.web.length === 0) throw new Error("Aucun résultat trouvé pour cette page.");
    res.web.sort((a, b) => (a.priority || 10) - (b.priority || 10));

    return res;
}

// ==========================================
// AFFICHAGE WEB ET PAGINATION
// ==========================================
function displayResults(results, page) {
    const imagesHub = document.getElementById('images-hub');
    const resultsList = document.getElementById('results-list');
    const aiCard = document.getElementById('ai-summary-card');
    const aiText = document.getElementById('ai-summary-text');
    
    clearTimeout(typingTimeout); 
    
    // IA TYPING
    if(page === 1) {
        let synthesisText = "";
        let bestResult = results.web.find(r => r.priority === 0 || r.source.includes('Wiktionary') || r.source === 'Réponse Directe' || r.source === 'Wikipedia');
        
        if (bestResult && bestResult.snippet && bestResult.snippet.length > 20) {
            synthesisText = bestResult.snippet;
        }

        if (synthesisText) {
            aiCard.classList.remove('hidden');
            aiText.innerHTML = ''; 
            let i = 0;
            function typeWriter() {
                if (i < synthesisText.length) {
                    aiText.innerHTML += synthesisText.charAt(i);
                    i++;
                    typingTimeout = setTimeout(typeWriter, 15);
                }
            }
            typeWriter();
        } else {
            aiCard.classList.add('hidden');
        }
    } else {
        aiCard.classList.add('hidden');
    }

    // IMAGES HUB (Page 1)
    if(page === 1) {
        imagesHub.innerHTML = results.images.map(img => `<a href="${img}" target="_blank"><img src="${img}" alt="Image" onerror="this.style.display='none'"></a>`).join('');
    } else {
        imagesHub.innerHTML = '';
    }
    
    // RESULTATS WEB
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

    renderPagination(page);
}

function renderPagination(currentPage) {
    const pagDiv = document.getElementById('pagination-web');
    let html = '';
    let startPage = Math.max(1, currentPage - 2);
    let endPage = startPage + 4;

    for(let i = startPage; i <= endPage; i++) {
        if(i === currentPage) {
            html += `<button class="page-btn active">${i}</button>`;
        } else {
            html += `<button class="page-btn" onclick="executeSearch(${i})">${i}</button>`;
        }
    }
    html += `<button class="page-btn" style="width:auto; padding:0 15px; border-radius:20px;" onclick="executeSearch(${currentPage + 1})">Suivant &raquo;</button>`;
    pagDiv.innerHTML = html;
}

// ==========================================
// ONGLET : IMAGES 
// ==========================================
async function fetchTabImages() {
    const grid = document.getElementById('full-images-grid');
    grid.innerHTML = '<p>Chargement des images...</p>';
    
    try {
        grid.innerHTML = '';
        
        // On récupère d'abord les images de l'onglet principal
        const mainImages = Array.from(document.querySelectorAll('#images-hub img')).map(img => img.src);
        mainImages.forEach(src => {
            grid.innerHTML += `<a href="${src}" target="_blank"><img src="${src}" loading="lazy" onerror="this.style.display='none'"></a>`;
        });

        // Complète avec Wikimedia Commons
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(currentSearchQuery)}&gsrnamespace=6&gsrlimit=30&prop=imageinfo&iiprop=url&format=json&origin=*`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.query && data.query.pages) {
            Object.values(data.query.pages).forEach(p => { 
                if(p.imageinfo && p.imageinfo[0] && !mainImages.includes(p.imageinfo[0].url)) {
                    grid.innerHTML += `<a href="${p.imageinfo[0].url}" target="_blank"><img src="${p.imageinfo[0].url}" loading="lazy" onerror="this.style.display='none'"></a>`;
                }
            });
        }

        if(grid.innerHTML === '') grid.innerHTML = '<p>Aucune image trouvée.</p>';
    } catch(e) {
        if(grid.innerHTML === '') grid.innerHTML = '<p>Erreur lors du chargement des images.</p>';
    }
}

// ==========================================
// ONGLET : VIDEOS (PROXY 100% FIABLE)
// ==========================================
async function fetchTabVideos() {
    const grid = document.getElementById('youtube-videos-grid');
    grid.innerHTML = '<p>Recherche de vidéos éducatives YouTube en cours... ⏳</p>';
    
    try {
        // Proxy gratuit pour scraper directement YouTube
        const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(currentSearchQuery + " éducation cours explication")}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(ytSearchUrl)}`;
        
        const res = await fetch(proxyUrl);
        const data = await res.json();
        const htmlText = data.contents;
        
        // Extraction des IDs vidéos (Regex hyper stable)
        const videoIds =[];
        const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
        let match;
        while ((match = regex.exec(htmlText)) !== null && videoIds.length < 12) {
            if (!videoIds.includes(match[1])) videoIds.push(match[1]);
        }
        
        grid.innerHTML = '';
        if (videoIds.length > 0) {
            videoIds.forEach(id => {
                grid.innerHTML += `
                    <a href="https://www.youtube.com/watch?v=${id}" target="_blank" class="video-card">
                        <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" class="video-thumbnail" onerror="this.style.display='none'">
                        <div class="video-info">
                            <div class="video-title">🎥 Regarder la vidéo sur YouTube</div>
                            <div class="video-channel">Ouvrir le lien pour visionner</div>
                        </div>
                    </a>
                `;
            });
        } else {
            grid.innerHTML = '<p>Aucune vidéo trouvée pour cette recherche.</p>';
        }
    } catch(e) {
        grid.innerHTML = `<p>Impossible d'afficher les vidéos ici. <br><br><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(currentSearchQuery)}" target="_blank" style="color:var(--g-blue); font-weight:bold;">👉 Cliquez pour ouvrir YouTube directement</a>.</p>`;
    }
}

// ==========================================
// TS1 TRANSLATER MODAL & INLINE TRANSLATION
// ==========================================
function toggleTranslator() {
    const modal = document.getElementById('ts1-modal');
    modal.classList.toggle('hidden');
}

async function translateUserInput() {
    const text = document.getElementById('ts1-input').value.trim();
    const targetLang = document.getElementById('ts1-lang-to').value;
    const resultBox = document.getElementById('ts1-result');

    if (!text) {
        resultBox.innerHTML = '<span style="color:var(--g-red);">Veuillez saisir un texte.</span>';
        return;
    }

    resultBox.innerHTML = 'Traduction en cours... ⏳';

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        resultBox.innerHTML = data[0].map(x => x[0]).join('');
    } catch (e) {
        resultBox.innerHTML = '<span style="color:var(--g-red);">❌ Erreur de connexion. Veuillez réessayer.</span>';
    }
}

function translateAllResults() {
    const translateBtns = document.querySelectorAll('.search-result .result-actions button:last-child');
    if (translateBtns.length === 0) return alert("Rien à traduire pour le moment.");
    
    translateBtns.forEach(btn => {
        if (btn.innerText.includes('Traduire')) translateCard(btn);
    });
    
    const aiText = document.getElementById('ai-summary-text');
    if (aiText && aiText.innerText.trim().length > 0) {
        const user = JSON.parse(localStorage.getItem('currentUser')) || {};
        const targetLang = user.lang || 'fr'; 
        fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(aiText.innerText)}`)
        .then(r => r.json())
        .then(d => {
            aiText.innerText = d[0].map(x => x[0]).join('');
        });
    }
}

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

// ==========================================
// PROFILS, VOIX, HISTORIQUE, FAVORIS
// ==========================================
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
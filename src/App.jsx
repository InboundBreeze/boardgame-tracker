import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Loader2, Star, Play, Library, AlertCircle, TrendingUp, Filter, LayoutDashboard, Grid, BarChart3, Trophy, History, Calendar, Users, Award, UserCircle, X, Trash2, Settings, ArrowRight, UploadCloud, Download, RefreshCw } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- SAFE FIREBASE INITIALIZATION ---
const firebaseConfigStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
let firebaseConfig = {
  apiKey: "AIzaSyBbRbosmqtueb_rUjojNRZzpfvWk4wSiFc",
  authDomain: "boardgame-tracker-76d32.firebaseapp.com",
  projectId: "boardgame-tracker-76d32",
  storageBucket: "boardgame-tracker-76d32.firebasestorage.app",
  messagingSenderId: "878855163365",
  appId: "1:878855163365:web:1723f1e5ec50ae4bf1b30c"
};

if (firebaseConfigStr) {
  try { firebaseConfig = JSON.parse(firebaseConfigStr); } catch (e) { console.warn("Could not parse injected firebase config"); }
}

const isFirebaseValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.apiKey !== "";
const app = isFirebaseValid ? initializeApp(firebaseConfig) : null;
const auth = isFirebaseValid ? getAuth(app) : null;
const db = isFirebaseValid ? getFirestore(app) : null;

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "boardgame-tracker-live";
const safeAppId = rawAppId.replace(/\//g, '_');

export default function App() {
  // Hardcoded Username for Production
  const [username] = useState('Inboundbreeze'); 
  
  const [collection, setCollection] = useState([]);
  const [playsData, setPlaysData] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null); 
  
  // Dashboard State
  const [sortBy, setSortBy] = useState('name');
  const [filterPlayers, setFilterPlayers] = useState('any'); 
  const [filterMinRating, setFilterMinRating] = useState('0'); 
  const [filterRatingType, setFilterRatingType] = useState('avgRating'); 
  const [activeTab, setActiveTab] = useState('collection'); 
  const [selectedPlayerName, setSelectedPlayerName] = useState(''); 
  const [showManualSync, setShowManualSync] = useState(false);

  // Alias State
  const [aliases, setAliases] = useState({}); 
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [aliasForm, setAliasForm] = useState({ from: '', to: '' });
  
  const resolveName = (name) => {
    if (!name) return "Unknown";
    const lowerName = name.trim().toLowerCase();
    return aliases[lowerName] || name.trim();
  };

  // --- FIREBASE AUTH & ALIAS SYNC ---
  useEffect(() => {
    if (!auth) return; 
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) { console.error("Auth initialization error:", error); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    
    // Listen for aliases saved in cloud
    const aliasRef = doc(db, 'artifacts', safeAppId, 'users', user.uid, 'settings', 'aliases');
    const unsubscribeAliases = onSnapshot(aliasRef, (docSnap) => {
      if (docSnap.exists()) {
        setAliases(docSnap.data());
      } else {
        setAliases({}); 
      }
    });

    return () => unsubscribeAliases();
  }, [user]);

  // --- MANUAL XML PARSING LOGIC ---
  const parseCollectionXML = (xmlText) => {
    const parser = new DOMParser();
    const collXml = parser.parseFromString(xmlText, "text/xml");
    const errorNode = collXml.querySelector("error message") || collXml.querySelector("message");
    if (errorNode) throw new Error(`BGG API Message: ${errorNode.textContent}`);

    const items = collXml.querySelectorAll("item");
    if (items.length === 0) throw new Error(`No games found in the provided XML.`);

    const parsedGames = Array.from(items).map(item => {
      const statsNode = item.querySelector("stats");
      const myRatingStr = statsNode?.querySelector("rating")?.getAttribute("value");
      const avgRatingStr = statsNode?.querySelector("rating average")?.getAttribute("value");
      
      return {
        id: item.getAttribute("objectid"),
        name: item.querySelector("name")?.textContent || "Unknown Game",
        thumbnail: item.querySelector("thumbnail")?.textContent || null,
        image: item.querySelector("image")?.textContent || null,
        year: item.querySelector("yearpublished")?.textContent || "-",
        plays: parseInt(item.querySelector("numplays")?.textContent || "0", 10),
        myRating: myRatingStr !== "N/A" ? parseFloat(myRatingStr) : null,
        avgRating: avgRatingStr ? parseFloat(avgRatingStr) : null,
        minPlayers: parseInt(statsNode?.getAttribute("minplayers") || "0", 10),
        maxPlayers: parseInt(statsNode?.getAttribute("maxplayers") || "0", 10),
      };
    });

    setCollection(parsedGames);
    return parsedGames;
  };

  const parsePlaysXML = (xmlText, currentCollection) => {
    const parser = new DOMParser();
    const playsXml = parser.parseFromString(xmlText, "text/xml");
    
    const playNodes = playsXml.querySelectorAll("play");
    
    const parsedPlays = Array.from(playNodes).map(play => {
      const itemNode = play.querySelector("item");
      const gameId = itemNode?.getAttribute("objectid");
      const gameName = itemNode?.getAttribute("name") || "Unknown Game";
      const matchedGame = currentCollection.find(g => g.id === gameId);
      const playerNodes = play.querySelectorAll("player");
      const players = Array.from(playerNodes).map(p => ({
        name: p.getAttribute("name") || p.getAttribute("username") || "Anonymous",
        score: p.getAttribute("score"),
        win: p.getAttribute("win") === "1"
      }));

      return {
        id: play.getAttribute("id"),
        date: play.getAttribute("date"),
        game: gameName,
        image: matchedGame?.image || null,
        players: players
      };
    });
    setPlaysData(parsedPlays);
  };

  const handleCollectionUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        parseCollectionXML(event.target.result);
        setError(null);
        setShowManualSync(false);
      } catch (err) { setError("Failed to parse Collection XML: " + err.message); }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handlePlaysUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        parsePlaysXML(event.target.result, collection);
        setError(null);
        setShowManualSync(false);
      } catch (err) { setError("Failed to parse Plays XML: " + err.message); }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  // --- AUTOMATIC FETCHING ---
  const fetchCollectionAuto = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    const fetchBGG = async (targetUrl, apiType) => {
      let finalResponse = null;
      let finalStatus = null;
      let isRateLimited = false;

      // Prioritize Direct Fetch (Assumes CORS extension is active or running locally via Vite proxy)
      const endpoints = [
        { name: "Direct", url: targetUrl },
        { name: "Vercel API", url: `/api/bgg?user=${encodeURIComponent(username)}&type=${apiType}` },
        { name: "Vite Proxy", url: `/bgg-proxy/xmlapi2/${apiType === 'plays' ? 'plays' : 'collection'}?username=${encodeURIComponent(username)}${apiType === 'collection' ? '&stats=1' : ''}` },
        { name: "CodeTabs", url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}` }
      ];

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint.url);
          if (res.status === 429) { isRateLimited = true; continue; }

          const text = await res.text();
          if (res.ok && text && text.trim().length > 20 && !text.trim().toLowerCase().startsWith("<!doctype") && !text.trim().toLowerCase().startsWith("<html")) {
            finalResponse = text;
            finalStatus = res.status;
            break; 
          }
        } catch (err) { /* ignore and try next */ }
      }

      if (!finalResponse) {
        if (isRateLimited) throw new Error("BGG Rate Limit Reached (429). Please wait 60 seconds.");
        throw new Error(`Auto-Sync failed due to CORS or BGG Bot Protection. If you are on PC, please install a "Allow CORS" browser extension and try again, or use Manual Import.`);
      }

      return { text: finalResponse, status: finalStatus };
    };

    try {
      const collectionRes = await fetchBGG(`https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&stats=1`, 'collection');
      
      if (collectionRes.status === 202) {
        setError("BGG is preparing your data. This can take a few moments. Please click Auto Sync again in 30 seconds.");
        setLoading(false);
        return;
      }

      const parsedGames = parseCollectionXML(collectionRes.text);

      // Delay to avoid hitting BGG's 429 Rate Limiter
      await new Promise(resolve => setTimeout(resolve, 1500));

      try {
        const playsRes = await fetchBGG(`https://boardgamegeek.com/xmlapi2/plays?username=${encodeURIComponent(username)}`, 'plays');
        parsePlaysXML(playsRes.text, parsedGames);
      } catch (playErr) {
        console.warn("Failed to fetch plays via API, continuing with collection...", playErr);
      }

    } catch (err) {
      setError(err.message || "An unexpected error occurred. Please use Manual Import.");
    } finally {
      setLoading(false);
    }
  };

  // --- DATA PROCESSING ---
  const sortedCollection = useMemo(() => {
    let filtered = [...collection]; 

    if (filterPlayers !== 'any') {
      const pCount = parseInt(filterPlayers, 10);
      filtered = filtered.filter(g => {
        return (g.minPlayers === 0 && g.maxPlayers === 0) || (pCount >= g.minPlayers && pCount <= g.maxPlayers);
      });
    }

    if (filterMinRating !== '0') {
      const minScore = parseFloat(filterMinRating);
      filtered = filtered.filter(g => {
        const ratingValue = filterRatingType === 'myRating' ? g.myRating : g.avgRating;
        return ratingValue !== null && ratingValue >= minScore;
      });
    }

    switch (sortBy) {
      case 'plays': return filtered.sort((a, b) => b.plays - a.plays);
      case 'myRating': return filtered.sort((a, b) => (b.myRating || 0) - (a.myRating || 0));
      case 'avgRating': return filtered.sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0));
      case 'name':
      default: return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [collection, sortBy, filterPlayers, filterMinRating, filterRatingType]);

  const stats = useMemo(() => {
    if (!collection.length) return null;

    const totalGames = collection.length;
    const totalPlays = collection.reduce((sum, game) => sum + game.plays, 0);
    const ratedGames = collection.filter(g => g.myRating !== null);
    const avgRating = ratedGames.length ? (ratedGames.reduce((sum, g) => sum + g.myRating, 0) / ratedGames.length).toFixed(1) : 'N/A';

    const playCounts = collection.map(g => g.plays).sort((a, b) => b - a);
    let hIndex = 0;
    while (hIndex < playCounts.length && playCounts[hIndex] > hIndex) hIndex++;

    const topPlayed = [...collection].sort((a, b) => b.plays - a.plays).slice(0, 5);
    const topRated = [...collection].filter(g => g.myRating).sort((a, b) => b.myRating - a.myRating).slice(0, 5);

    return { totalGames, totalPlays, avgRating, hIndex, topPlayed, topRated };
  }, [collection]);

  const combinedPlays = useMemo(() => {
    return [...playsData].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [playsData]);

  const playerStatsArray = useMemo(() => {
    if (!combinedPlays || combinedPlays.length === 0) return [];
    
    const pStats = {};

    combinedPlays.forEach(play => {
      if (!play.players || play.players.length === 0) return;

      let sortedPlayers = [...play.players].map(p => ({
        ...p,
        resolvedName: resolveName(p.name),
        parsedScore: parseFloat(p.score) || 0,
        hasScore: p.score !== undefined && p.score !== null && p.score.toString().trim() !== '' && !isNaN(parseFloat(p.score))
      }));

      sortedPlayers.sort((a, b) => {
        if (a.win && !b.win) return -1;
        if (!a.win && b.win) return 1;
        if (a.hasScore && b.hasScore) return b.parsedScore - a.parsedScore;
        return 0;
      });

      let currentRank = 1;
      let previousScore = null;
      let previousWin = null;

      sortedPlayers.forEach((p, index) => {
        if (index > 0) {
          if (p.hasScore && p.parsedScore !== previousScore) {
             currentRank = index + 1;
          } else if (!p.hasScore && p.win !== previousWin) {
             currentRank = index + 1;
          }
        }

        previousScore = p.parsedScore;
        previousWin = p.win;
        const name = p.resolvedName;

        if (!pStats[name]) {
          pStats[name] = { name: name, plays: 0, wins: 0, placements: {} };
        }

        pStats[name].plays += 1;
        if (p.win || currentRank === 1) pStats[name].wins += 1;
        pStats[name].placements[currentRank] = (pStats[name].placements[currentRank] || 0) + 1;
      });
    });

    return Object.values(pStats).sort((a, b) => b.plays - a.plays);
  }, [combinedPlays, aliases]); 

  const topWinners = useMemo(() => {
    return [...playerStatsArray].filter(p => p.wins > 0).sort((a, b) => b.wins - a.wins).slice(0, 10);
  }, [playerStatsArray]);

  // Load collection automatically on mount
  useEffect(() => {
    fetchCollectionAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- ALIAS HANDLERS ---
  const handleSaveAlias = async (e) => {
    e.preventDefault();
    if (!aliasForm.from.trim() || !aliasForm.to.trim()) return;
    
    const newAliases = { 
      ...aliases, 
      [aliasForm.from.trim().toLowerCase()]: aliasForm.to.trim() 
    };

    setAliases(newAliases); 
    setAliasForm({ from: '', to: '' });

    if (user && db) {
      try {
        const aliasRef = doc(db, 'artifacts', safeAppId, 'users', user.uid, 'settings', 'aliases');
        await setDoc(aliasRef, newAliases);
      } catch (error) { console.error("Error saving alias to cloud:", error); }
    }
  };

  const handleRemoveAlias = async (keyToRemove) => {
    const newAliases = { ...aliases };
    delete newAliases[keyToRemove];
    
    setAliases(newAliases);

    if (user && db) {
      try {
        const aliasRef = doc(db, 'artifacts', safeAppId, 'users', user.uid, 'settings', 'aliases');
        await setDoc(aliasRef, newAliases);
      } catch (error) { console.error("Error removing alias from cloud:", error); }
    }
  };

  return (
    <div className="dark">
      <div className="min-h-screen bg-slate-900 text-slate-100 font-sans transition-colors duration-200 pb-12">
        <header className="bg-slate-800 text-white shadow-md border-b border-slate-700">
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <Library className="h-8 w-8 text-indigo-400" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Boardgame Tracker</h1>
                <p className="text-slate-400 text-sm">Dashboard for {resolveName(username)}</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => setShowManualSync(true)}
                className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center shadow-sm w-full sm:w-auto"
              >
                <UploadCloud className="h-4 w-4 mr-2" />
                <span className="font-medium text-sm">Manual Import</span>
              </button>
              
              <button
                onClick={fetchCollectionAuto}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center shadow-sm disabled:bg-slate-600 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                <span className="font-medium text-sm">Sync with BGG</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          
          {!isFirebaseValid && (
             <div className="bg-amber-900/30 border border-amber-800 text-amber-200 px-4 py-3 rounded-lg mb-6 flex items-center shadow-sm">
               <AlertCircle className="h-5 w-5 mr-3 text-amber-400 shrink-0" />
               <p className="text-sm"><strong>Database Not Connected:</strong> You have not entered your Firebase Keys in App.jsx. Your Dashboard will still pull from BGG, but Player Aliases won't be saved to the cloud.</p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border-l-4 border-red-500 p-4 mb-8 rounded-r-md shadow-sm flex items-start flex-col sm:flex-row">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-red-300 font-medium">Error syncing with BoardGameGeek</h3>
                <p className="text-red-400 text-sm mt-1 font-mono break-words">{error}</p>
                <button onClick={() => setShowManualSync(true)} className="mt-3 bg-red-800/50 hover:bg-red-800 text-red-100 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center">
                  <UploadCloud className="h-4 w-4 mr-2" /> Try Manual Import
                </button>
              </div>
            </div>
          )}

          {!loading && collection.length === 0 && !error && (
            <div className="text-center py-20 bg-slate-800 rounded-xl shadow-sm border border-slate-700">
              <UploadCloud className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-200">No Collection Loaded</h2>
              <p className="text-slate-400 mt-2 mb-6 max-w-md mx-auto">
                BGG limits automated access. The most reliable way to view your data is via Manual Import, or by enabling a CORS extension in your browser.
              </p>
              <button 
                onClick={() => setShowManualSync(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-sm inline-flex items-center"
              >
                <UploadCloud className="h-5 w-5 mr-2" /> Upload BGG Data
              </button>
            </div>
          )}

          {collection.length > 0 && (
            <div className="space-y-6">
              
              {/* Tab Navigation */}
              <div className="border-b border-slate-700">
                <nav className="-mb-px flex space-x-8 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab('collection')}
                    className={`${
                      activeTab === 'collection'
                        ? 'border-indigo-400 text-indigo-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}
                  >
                    <Grid className="h-4 w-4 mr-2" />
                    Collection View
                  </button>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`${
                      activeTab === 'dashboard'
                        ? 'border-indigo-400 text-indigo-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}
                  >
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Stats Dashboard
                  </button>
                  <button
                    onClick={() => setActiveTab('plays')}
                    className={`${
                      activeTab === 'plays'
                        ? 'border-indigo-400 text-indigo-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}
                  >
                    <History className="h-4 w-4 mr-2" />
                    Recent Plays
                  </button>
                  <button
                    onClick={() => setActiveTab('players')}
                    className={`${
                      activeTab === 'players'
                        ? 'border-indigo-400 text-indigo-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Player Stats
                  </button>
                </nav>
              </div>

              {/* Collection Tab Content */}
              {activeTab === 'collection' && (
                <>
                  <div className="flex flex-col bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-700 gap-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="text-slate-300 font-medium whitespace-nowrap">
                        Showing <span className="text-indigo-400">{sortedCollection.length}</span> of {collection.length} games
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <div className="flex items-center space-x-2 bg-slate-900 rounded-md border border-slate-600 p-1 flex-1 md:flex-none">
                          <Users className="h-4 w-4 text-slate-400 ml-2" />
                          <select
                            value={filterPlayers}
                            onChange={(e) => setFilterPlayers(e.target.value)}
                            className="bg-transparent text-slate-200 text-sm focus:ring-0 border-0 p-1 outline-none cursor-pointer w-full"
                          >
                            <option value="any">Any Players</option>
                            <option value="1">1 Player</option>
                            <option value="2">2 Players</option>
                            <option value="3">3 Players</option>
                            <option value="4">4 Players</option>
                            <option value="5">5+ Players</option>
                          </select>
                        </div>

                        <div className="flex items-center space-x-2 bg-slate-900 rounded-md border border-slate-600 p-1 flex-1 md:flex-none">
                          <Star className="h-4 w-4 text-slate-400 ml-2" />
                          <select
                            value={filterRatingType}
                            onChange={(e) => setFilterRatingType(e.target.value)}
                            className="bg-transparent text-slate-200 text-sm focus:ring-0 border-0 p-1 pr-0 outline-none cursor-pointer font-medium"
                          >
                            <option value="avgRating">BGG Avg</option>
                            <option value="myRating">My Rating</option>
                          </select>
                          <span className="text-slate-600">|</span>
                          <select
                            value={filterMinRating}
                            onChange={(e) => setFilterMinRating(e.target.value)}
                            className="bg-transparent text-slate-200 text-sm focus:ring-0 border-0 p-1 outline-none cursor-pointer"
                          >
                            <option value="0">Any Score</option>
                            <option value="7">7.0+</option>
                            <option value="8">8.0+</option>
                            <option value="9">9.0+</option>
                          </select>
                        </div>

                        <div className="flex items-center space-x-2 ml-auto md:ml-2">
                          <Filter className="h-4 w-4 text-slate-400" />
                          <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none w-full sm:w-auto"
                          >
                            <option value="name">Name (A-Z)</option>
                            <option value="plays">Most Played</option>
                            <option value="myRating">My Rating (High to Low)</option>
                            <option value="avgRating">BGG Rating (High to Low)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
                    {sortedCollection.map((game) => (
                      <div key={game.id} className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden hover:shadow-md transition-shadow group flex flex-col">
                        
                        <div className="h-48 bg-slate-700/50 relative flex items-center justify-center p-4 overflow-hidden">
                          {game.image ? (
                            <img 
                              src={game.image} 
                              alt={game.name} 
                              className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-slate-500">No Image</span>
                          )}
                          {game.plays > 0 && (
                             <div className="absolute top-3 right-3 bg-indigo-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center shadow-sm">
                               <Play className="h-3 w-3 mr-1 fill-current" /> {game.plays}
                             </div>
                          )}
                        </div>

                        <div className="p-4 flex-grow flex flex-col">
                          <h3 className="font-bold text-white line-clamp-1" title={game.name}>
                            {game.name}
                          </h3>
                          
                          <div className="flex items-center justify-between mt-1 mb-4">
                            <p className="text-sm text-slate-400">{game.year}</p>
                            {(game.minPlayers > 0) && (
                              <p className="text-xs font-medium text-slate-400 flex items-center bg-slate-700/50 px-2 py-1 rounded border border-slate-700">
                                <Users className="h-3 w-3 mr-1" />
                                {game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}-${game.maxPlayers}`} Players
                              </p>
                            )}
                          </div>
                          
                          <div className="mt-auto pt-4 border-t border-slate-700 flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider mb-1">My Rating</span>
                              <div className="flex items-center text-amber-500 font-bold">
                                <Star className="h-4 w-4 mr-1 fill-current" />
                                {game.myRating ? game.myRating.toFixed(1) : <span className="text-slate-500 font-normal italic text-sm">N/A</span>}
                              </div>
                            </div>

                            <div className="flex flex-col items-end">
                              <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider mb-1 flex items-center">
                                <TrendingUp className="h-3 w-3 mr-1" /> BGG Avg
                              </span>
                              <div className="flex items-center text-slate-300 font-medium">
                                <Star className="h-4 w-4 mr-1 text-slate-600" />
                                {game.avgRating ? game.avgRating.toFixed(1) : '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Dashboard Tab Content */}
              {activeTab === 'dashboard' && stats && (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700 flex items-center space-x-4">
                      <div className="bg-indigo-900/50 p-3 rounded-lg text-indigo-400"><Library className="h-6 w-6" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-400">Total Games</p>
                        <p className="text-2xl font-bold text-white">{stats.totalGames}</p>
                      </div>
                    </div>
                    <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700 flex items-center space-x-4">
                      <div className="bg-green-900/30 p-3 rounded-lg text-green-400"><Play className="h-6 w-6 fill-current" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-400">Total Plays</p>
                        <p className="text-2xl font-bold text-white">{stats.totalPlays}</p>
                      </div>
                    </div>
                    <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700 flex items-center space-x-4">
                      <div className="bg-amber-900/30 p-3 rounded-lg text-amber-500"><Star className="h-6 w-6 fill-current" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-400">Avg Personal Rating</p>
                        <p className="text-2xl font-bold text-white">{stats.avgRating}</p>
                      </div>
                    </div>
                    <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700 flex items-center space-x-4">
                      <div className="bg-purple-900/30 p-3 rounded-lg text-purple-400"><BarChart3 className="h-6 w-6" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-400">H-Index</p>
                        <p className="text-2xl font-bold text-white">{stats.hIndex}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
                      <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700 flex items-center">
                        <Trophy className="h-5 w-5 text-indigo-400 mr-2" />
                        <h3 className="font-bold text-slate-200">Most Played Games</h3>
                      </div>
                      <ul className="divide-y divide-slate-700">
                        {stats.topPlayed.map((game, idx) => (
                          <li key={`played-${game.id}`} className="px-6 py-4 flex items-center hover:bg-slate-700/50 transition-colors">
                            <span className="text-slate-500 font-bold w-6">{idx + 1}.</span>
                            <div className="h-10 w-10 bg-slate-700 rounded overflow-hidden flex-shrink-0 mr-4 border border-slate-600">
                              {game.image ? <img src={game.image} alt={game.name} className="h-full w-full object-cover" /> : null}
                            </div>
                            <span className="font-medium text-white flex-1 truncate">{game.name}</span>
                            <div className="flex items-center text-sm font-bold text-slate-300 bg-slate-700 px-3 py-1 rounded-full">
                              <Play className="h-3 w-3 mr-1.5 fill-slate-500 text-slate-500" /> {game.plays} plays
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
                      <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700 flex items-center">
                        <Star className="h-5 w-5 text-amber-500 mr-2 fill-current" />
                        <h3 className="font-bold text-slate-200">Highest Rated by You</h3>
                      </div>
                      <ul className="divide-y divide-slate-700">
                        {stats.topRated.map((game, idx) => (
                          <li key={`rated-${game.id}`} className="px-6 py-4 flex items-center hover:bg-slate-700/50 transition-colors">
                            <span className="text-slate-500 font-bold w-6">{idx + 1}.</span>
                            <div className="h-10 w-10 bg-slate-700 rounded overflow-hidden flex-shrink-0 mr-4 border border-slate-600">
                              {game.image ? <img src={game.image} alt={game.name} className="h-full w-full object-cover" /> : null}
                            </div>
                            <span className="font-medium text-white flex-1 truncate">{game.name}</span>
                            <div className="flex items-center text-sm font-bold text-amber-400 bg-amber-900/30 px-3 py-1 rounded-full">
                              <Star className="h-3 w-3 mr-1.5 fill-current" /> {game.myRating.toFixed(1)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Plays Tab Content */}
              {activeTab === 'plays' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
                    <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex items-center">
                        <History className="h-5 w-5 text-indigo-400 mr-2" />
                        <h3 className="font-bold text-slate-200">Play History</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                        <span className="text-sm text-slate-400 font-medium hidden md:inline mr-2">Showing latest {combinedPlays.length} sessions</span>
                      </div>
                    </div>
                    
                    {combinedPlays.length === 0 ? (
                      <div className="p-8 text-center text-slate-400">
                        <Calendar className="h-12 w-12 mx-auto mb-3 text-slate-600" />
                        <p>No recent plays found.</p>
                        <p className="text-sm mt-1 mb-4">You have a collection loaded, but no plays were found in the Plays XML file.</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-700">
                        {combinedPlays.map((play) => (
                          <li key={play.id} className="p-6 hover:bg-slate-700/50 transition-colors flex flex-col sm:flex-row gap-6 items-start sm:items-center relative group">
                            <div className="flex items-center gap-4 w-full sm:w-1/3">
                              <div className="h-16 w-16 bg-slate-700 rounded-lg overflow-hidden flex-shrink-0 border border-slate-600 flex items-center justify-center">
                                {play.image ? (
                                  <img src={play.image} alt={play.game} className="h-full w-full object-cover" />
                                ) : (
                                  <Grid className="h-6 w-6 text-slate-500" />
                                )}
                              </div>
                              <div>
                                <h4 className="font-bold text-white leading-tight">{play.game}</h4>
                                <p className="text-sm text-slate-400 flex items-center mt-1">
                                  <Calendar className="h-3 w-3 mr-1" /> {play.date}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex-1 w-full bg-slate-700/30 sm:bg-transparent rounded-lg p-3 sm:p-0">
                              <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                <Users className="h-3 w-3 mr-1" /> Players
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {play.players.length > 0 ? play.players.map((p, idx) => {
                                  const resolvedPName = resolveName(p.name);
                                  return (
                                    <div 
                                      key={idx} 
                                      className={`flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${p.win ? 'bg-amber-900/30 border-amber-800 text-amber-300 shadow-sm' : 'bg-slate-800 border-slate-600 text-slate-300'}`}
                                    >
                                      {p.win && <Trophy className="h-3 w-3 mr-1.5 text-amber-500" />}
                                      {resolvedPName}
                                      {p.score && <span className="ml-2 pl-2 border-l border-slate-600 opacity-70">{p.score}</span>}
                                    </div>
                                  );
                                }) : (
                                  <span className="text-sm text-slate-400 italic">No players recorded</span>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Player Stats Tab Content */}
              {activeTab === 'players' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                  
                  {/* Global Wins Leaderboard Component */}
                  {topWinners.length > 0 && (
                    <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
                      <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700 flex items-center">
                        <Trophy className="h-5 w-5 text-amber-500 mr-2" />
                        <h3 className="font-bold text-slate-200">Global Wins Leaderboard</h3>
                      </div>
                      <div className="p-6">
                        <div className="space-y-4">
                          {topWinners.map((player, idx) => {
                            const maxWins = topWinners[0].wins || 1;
                            const percentage = (player.wins / maxWins) * 100;
                            const isFirst = idx === 0;
                            return (
                              <div key={player.name} className="flex items-center text-sm">
                                <div className="w-24 font-bold text-slate-300 flex items-center justify-end pr-4 truncate">
                                  {isFirst && <Award className="h-4 w-4 mr-1 text-amber-500" />}
                                  {player.name}
                                </div>
                                <div className="flex-1 bg-slate-700 rounded-r-md h-8 flex items-center relative group">
                                  <div 
                                    className={`h-full rounded-r-md transition-all duration-1000 ${isFirst ? 'bg-amber-500' : 'bg-indigo-500'}`} 
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                  <span className="absolute left-3 text-xs font-bold text-slate-100 drop-shadow-sm">
                                    {player.wins} {player.wins === 1 ? 'Win' : 'Wins'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Individual Player Breakdown */}
                  <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
                    <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex items-center">
                        <UserCircle className="h-5 w-5 text-indigo-400 mr-2" />
                        <h3 className="font-bold text-slate-200">Player Details</h3>
                      </div>
                      
                      <div className="flex items-center space-x-4 w-full sm:w-auto">
                        {/* Player Selector */}
                        {playerStatsArray.length > 0 && (
                          <div className="flex items-center space-x-2 flex-1 sm:flex-none">
                            <select
                              value={selectedPlayerName || (playerStatsArray[0]?.name || '')}
                              onChange={(e) => setSelectedPlayerName(e.target.value)}
                              className="bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none w-full sm:w-48 shadow-sm"
                            >
                              {playerStatsArray.map(p => (
                                <option key={p.name} value={p.name}>{p.name} ({p.plays} plays)</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <button 
                          onClick={() => setShowAliasModal(true)}
                          className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center shadow-sm whitespace-nowrap"
                        >
                          <Settings className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Manage Aliases</span>
                        </button>
                      </div>
                    </div>

                    {playerStatsArray.length === 0 ? (
                      <div className="p-8 text-center text-slate-400">
                        <Award className="h-12 w-12 mx-auto mb-3 text-slate-600" />
                        <p>No player data available.</p>
                        <p className="text-sm mt-1">Play history is required to generate player stats.</p>
                      </div>
                    ) : (
                      <div className="p-6">
                        {(() => {
                          const player = playerStatsArray.find(p => p.name === (selectedPlayerName || playerStatsArray[0]?.name));
                          if (!player) return null;
                          
                          const winRate = ((player.wins / player.plays) * 100).toFixed(1);
                          const maxPlacementCount = Math.max(...Object.values(player.placements));

                          return (
                            <div className="flex flex-col md:flex-row gap-8">
                              <div className="md:w-1/3 space-y-4">
                                <div className="bg-indigo-900/20 rounded-lg p-5 border border-indigo-800/50">
                                  <h4 className="text-indigo-300 font-bold text-lg mb-1">{player.name}</h4>
                                  <p className="text-indigo-400 text-sm mb-4">Overall Performance</p>
                                  
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-800 p-3 rounded shadow-sm border border-indigo-900/50">
                                      <p className="text-xs text-slate-400 uppercase font-bold">Total Plays</p>
                                      <p className="text-2xl font-black text-white">{player.plays}</p>
                                    </div>
                                    <div className="bg-slate-800 p-3 rounded shadow-sm border border-indigo-900/50">
                                      <p className="text-xs text-slate-400 uppercase font-bold">Wins (1st)</p>
                                      <p className="text-2xl font-black text-amber-500">{player.wins}</p>
                                    </div>
                                    <div className="col-span-2 bg-slate-800 p-3 rounded shadow-sm border border-indigo-900/50">
                                      <p className="text-xs text-slate-400 uppercase font-bold mb-1">Win Rate</p>
                                      <div className="w-full bg-slate-700 rounded-full h-2.5 mb-1 relative overflow-hidden">
                                        <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${winRate}%` }}></div>
                                      </div>
                                      <p className="text-sm font-bold text-slate-300">{winRate}%</p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="md:w-2/3">
                                <h4 className="text-slate-200 font-bold text-lg mb-4 flex items-center">
                                  <BarChart3 className="h-5 w-5 mr-2 text-slate-500" />
                                  Placement Distribution
                                </h4>
                                <div className="space-y-3">
                                  {Object.entries(player.placements).sort((a, b) => Number(a[0]) - Number(b[0])).map(([rank, count]) => {
                                    const percentage = (count / maxPlacementCount) * 100;
                                    const isFirst = rank === "1";
                                    return (
                                      <div key={rank} className="flex items-center text-sm">
                                        <div className="w-16 font-bold text-slate-400 flex items-center justify-end pr-3">
                                          {isFirst && <Trophy className="h-3 w-3 mr-1 text-amber-500" />}
                                          {rank}{rank === "1" ? "st" : rank === "2" ? "nd" : rank === "3" ? "rd" : "th"}
                                        </div>
                                        <div className="flex-1 bg-slate-700 rounded-r-md h-8 flex items-center relative group">
                                          <div 
                                            className={`h-full rounded-r-md transition-all duration-1000 ${isFirst ? 'bg-amber-500' : 'bg-indigo-500'}`} 
                                            style={{ width: `${percentage}%` }}
                                          ></div>
                                          <span className="absolute left-3 text-xs font-bold text-slate-200 drop-shadow-sm">
                                            {count} {count === 1 ? 'time' : 'times'}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-xs text-slate-500 mt-6 italic bg-slate-800/50 p-3 rounded border border-slate-700">
                                  * Placements are calculated per session. Missing scores use BGG win flags to determine 1st place.
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </main>
        
        {/* --- MANUAL SYNC MODAL --- */}
        {showManualSync && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-700 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center p-6 border-b border-slate-700">
                <h3 className="font-bold text-xl text-white flex items-center">
                  <UploadCloud className="h-6 w-6 mr-3 text-indigo-400" />
                  Manual BGG Data Import
                </h3>
                <button onClick={() => setShowManualSync(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-6">
                <div className="bg-indigo-900/30 border border-indigo-500/30 p-4 rounded-lg">
                  <p className="text-sm text-indigo-200 mb-2">
                    If BoardGameGeek is blocking the Auto-Sync, you can securely download your data directly from BGG and drop it here.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="border border-slate-600 bg-slate-700/30 rounded-lg p-5">
                    <div className="flex items-center mb-3">
                      <div className="bg-slate-700 text-white font-bold h-6 w-6 rounded-full flex items-center justify-center text-xs mr-3 shrink-0">1</div>
                      <h4 className="font-bold text-white">Import Collection XML</h4>
                    </div>
                    <p className="text-sm text-slate-400 mb-4 pl-9">
                      Click the link below to view your raw BGG collection data. Press <strong>Ctrl+S</strong> (or Cmd+S) to save the page as an XML file, then select it here.
                    </p>
                    <div className="pl-9 mb-4">
                      <a href={`https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&stats=1`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center underline">
                        <Download className="h-4 w-4 mr-1" /> Open Collection Data in New Tab
                      </a>
                    </div>
                    <div className="pl-9">
                      <label className="block bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md p-3 text-center cursor-pointer transition-colors shadow-sm">
                        <span className="text-sm font-medium text-slate-300">Select Collection XML File</span>
                        <input type="file" accept=".xml" onChange={handleCollectionUpload} className="hidden" />
                      </label>
                    </div>
                  </div>

                  <div className="border border-slate-600 bg-slate-700/30 rounded-lg p-5">
                    <div className="flex items-center mb-3">
                      <div className="bg-slate-700 text-white font-bold h-6 w-6 rounded-full flex items-center justify-center text-xs mr-3 shrink-0">2</div>
                      <h4 className="font-bold text-white">Import Plays XML</h4>
                    </div>
                    <p className="text-sm text-slate-400 mb-4 pl-9">
                      Click the link below, save the page as an XML file, and select it here to load your play history.
                    </p>
                    <div className="pl-9 mb-4">
                      <a href={`https://boardgamegeek.com/xmlapi2/plays?username=${encodeURIComponent(username)}`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center underline">
                        <Download className="h-4 w-4 mr-1" /> Open Plays Data in New Tab
                      </a>
                    </div>
                    <div className="pl-9">
                      <label className="block bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md p-3 text-center cursor-pointer transition-colors shadow-sm">
                        <span className="text-sm font-medium text-slate-300">Select Plays XML File</span>
                        <input type="file" accept=".xml" onChange={handlePlaysUpload} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-700 bg-slate-800/50">
                 <button onClick={() => setShowManualSync(false)} className="w-full bg-slate-700 hover:bg-slate-600 text-white p-3 rounded-lg font-bold transition-colors shadow-sm">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Alias Management Modal */}
        {showAliasModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-700 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center p-5 border-b border-slate-700">
                <h3 className="font-bold text-lg text-white flex items-center">
                  <Settings className="h-5 w-5 mr-2 text-indigo-500" />
                  Manage Player Aliases
                </h3>
                <button onClick={() => setShowAliasModal(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="p-5 overflow-y-auto">
                <p className="text-sm text-slate-400 mb-6">
                  Link multiple names (like "Inboundbreeze" on BGG and "Richard" on custom plays) to combine their stats. 
                  {isFirebaseValid ? " These are synced securely to your cloud database." : " These are currently saved only to this browser."}
                </p>

                <form onSubmit={handleSaveAlias} className="flex gap-2 items-end mb-8 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-400 mb-1">Old Alias (e.g. Inboundbreeze)</label>
                    <input required type="text" value={aliasForm.from} onChange={e => setAliasForm({...aliasForm, from: e.target.value})} className="w-full p-2 border border-slate-600 rounded bg-slate-800 text-white focus:ring-1 focus:ring-indigo-500 outline-none text-sm" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-slate-400 mb-2.5 shrink-0"/>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-400 mb-1">Main Name (e.g. Richard)</label>
                    <input required type="text" value={aliasForm.to} onChange={e => setAliasForm({...aliasForm, to: e.target.value})} className="w-full p-2 border border-slate-600 rounded bg-slate-800 text-white focus:ring-1 focus:ring-indigo-500 outline-none text-sm" />
                  </div>
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded text-sm font-medium transition-colors h-[38px] mb-[1px]">Add</button>
                </form>

                <h4 className="font-bold text-slate-200 mb-3 text-sm uppercase tracking-wider">Active Aliases</h4>
                {Object.keys(aliases).length === 0 ? (
                  <p className="text-sm text-slate-500 italic border border-dashed border-slate-700 p-4 rounded-lg text-center">No aliases defined yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {Object.entries(aliases).map(([from, to]) => (
                      <li key={from} className="flex justify-between items-center bg-slate-800 border border-slate-700 p-3 rounded-lg shadow-sm">
                        <div className="flex items-center text-sm">
                          <span className="text-slate-400 line-through decoration-slate-300 mr-2">{from}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400 mr-2" />
                          <span className="font-bold text-indigo-400">{to}</span>
                        </div>
                        <button onClick={() => handleRemoveAlias(from)} className="text-slate-400 hover:text-red-500 transition-colors p-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
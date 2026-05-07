import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Loader2, Star, Play, Library, AlertCircle, TrendingUp, Filter, Database, LayoutDashboard, Grid, BarChart3, Trophy, History, Calendar, Users, Award, UserCircle, Moon, Sun, Plus, X, Trash2, Settings, ArrowRight, Edit2, FileUp, RefreshCw } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection as firestoreCollection, onSnapshot, addDoc, doc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

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

// Attempt to inject Canvas environment keys if they exist
if (firebaseConfigStr) {
  try {
    firebaseConfig = JSON.parse(firebaseConfigStr);
  } catch (e) {
    console.warn("Could not parse injected firebase config");
  }
}

// Only initialize Firebase if a real API key is present. This prevents app crashes!
const isFirebaseValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.apiKey !== "";
const app = isFirebaseValid ? initializeApp(firebaseConfig) : null;
const auth = isFirebaseValid ? getAuth(app) : null;
const db = isFirebaseValid ? getFirestore(app) : null;

const appId = typeof __app_id !== 'undefined' ? __app_id : "boardgame-tracker-live";

export default function App() {
  const [username, setUsername] = useState('Inboundbreeze');
  const [collection, setCollection] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [filterPlayers, setFilterPlayers] = useState('any'); 
  const [filterMinRating, setFilterMinRating] = useState('0'); 
  const [filterRatingType, setFilterRatingType] = useState('avgRating'); 
  const [activeTab, setActiveTab] = useState('collection'); 
  const [playsData, setPlaysData] = useState([]); 
  const [selectedPlayerName, setSelectedPlayerName] = useState(''); 
  const [darkMode, setDarkMode] = useState(true); 
  const [user, setUser] = useState(null); 
  const [customPlays, setCustomPlays] = useState([]); 
  const [showAddPlay, setShowAddPlay] = useState(false); 
  const [editingPlayId, setEditingPlayId] = useState(null);
  const fileInputRef = useRef(null);
  
  // Set to false for Live BGG Data
  const [useMockData, setUseMockData] = useState(false);

  // Player Aliases State
  const [aliases, setAliases] = useState({}); 
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [aliasForm, setAliasForm] = useState({ from: '', to: '' });
  
  const resolveName = (name) => {
    if (!name) return "Unknown";
    const lowerName = name.trim().toLowerCase();
    return aliases[lowerName] || name.trim();
  };

  const initialPlayForm = { 
    gameId: '', 
    gameName: '', 
    date: new Date().toISOString().split('T')[0], 
    players: [{ name: resolveName('Inboundbreeze'), score: '', win: false }] 
  };

  const [newPlayForm, setNewPlayForm] = useState(initialPlayForm); 

  const mockData = [
    { id: "1", name: "Terraforming Mars", year: "2016", plays: 12, myRating: 9.0, avgRating: 8.4, minPlayers: 1, maxPlayers: 5, image: "https://cf.geekdo-images.com/wg9oOLcsKvDesSUdZQ4rxw__itemrep/img/r2B9e3vI-k7F9B18R7YdG5p5J-g=/fit-in/246x300/filters:strip_icc()/pic3536616.jpg" },
    { id: "2", name: "Scythe", year: "2016", plays: 5, myRating: 8.5, avgRating: 8.2, minPlayers: 1, maxPlayers: 5, image: "https://cf.geekdo-images.com/7k_nGLr-fc4pE-aGjTqEzw__itemrep/img/rM6Nq-8EsqG_5gQ5tD8XvW5I-vY=/fit-in/246x300/filters:strip_icc()/pic3163924.jpg" },
    { id: "3", name: "Wingspan", year: "2019", plays: 24, myRating: 8.0, avgRating: 8.1, minPlayers: 1, maxPlayers: 5, image: "https://cf.geekdo-images.com/yLZJCVLlIxCGa7x12vQvNQ__itemrep/img/sH7hFq-fO6Aqz_18R8hH_N1R4A4=/fit-in/246x300/filters:strip_icc()/pic4458123.jpg" },
    { id: "4", name: "Gloomhaven", year: "2017", plays: 45, myRating: 10.0, avgRating: 8.7, minPlayers: 1, maxPlayers: 4, image: "https://cf.geekdo-images.com/sZYp_3BTDGjh2unaZfZmuA__itemrep/img/D8_yB1E4d5xM-9gD1yqU4k_E0U=/fit-in/246x300/filters:strip_icc()/pic2437871.jpg" }
  ];

  const mockPlays = [
    { id: "101", date: "2023-10-24", game: "Terraforming Mars", image: "https://cf.geekdo-images.com/wg9oOLcsKvDesSUdZQ4rxw__itemrep/img/r2B9e3vI-k7F9B18R7YdG5p5J-g=/fit-in/246x300/filters:strip_icc()/pic3536616.jpg", players: [{ name: "Inboundbreeze", score: "88", win: true }, { name: "Alex", score: "75", win: false }] },
    { id: "102", date: "2023-10-20", game: "Ark Nova", image: "https://cf.geekdo-images.com/BsqHbpWrd5FjiU2B2gUq6A__itemrep/img/F-4L1U-uQ-mH_5B_rA-XF1O9Bw=/fit-in/246x300/filters:strip_icc()/pic6223450.jpg", players: [{ name: "Inboundbreeze", score: "24", win: false }, { name: "Sarah", score: "35", win: true }] }
  ];

  const fetchCollection = async (e) => {
    if (e) e.preventDefault();
    
    if (useMockData) {
      setLoading(false);
      setError(null);
      setCollection(mockData);
      setPlaysData(mockPlays);
      return;
    }

    if (!username.trim()) return;

    setLoading(true);
    setError(null);

    // Smart fetcher: Tries Vercel Serverless Function first, falls back to proxies for Canvas Preview
    const fetchBGG = async (targetUrl, apiType) => {
      try {
        const apiRes = await fetch(`/api/bgg?user=${encodeURIComponent(username)}&type=${apiType}`);
        const text = await apiRes.text();
        // Check if Vite intercepted this locally and returned HTML instead of XML
        if (apiRes.ok && !text.trim().toLowerCase().startsWith("<!doctype html>") && !text.trim().toLowerCase().startsWith("<html")) {
          return { text: text, status: apiRes.status };
        }
      } catch (e) {
        // Ignore errors from missing /api/bgg endpoint when running locally or in Canvas
      }

      let responseText = null;
      let statusCode = null;
      let fetchError = null;

      const strategies = [
        async () => { const res = await fetch(targetUrl); return { text: await res.text(), status: res.status }; },
        async () => { const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`); const data = await res.json(); if (data.contents) return { text: data.contents, status: data.status?.http_code || 200 }; throw new Error("Invalid AllOrigins response"); },
        async () => { const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`); return { text: await res.text(), status: res.status }; },
        async () => { const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`); return { text: await res.text(), status: res.status }; }
      ];

      for (const strategy of strategies) {
        try {
          const result = await strategy();
          if (result.text && (result.status === 200 || result.status === 202)) {
            responseText = result.text;
            statusCode = result.status;
            break;
          }
        } catch (err) { fetchError = err; }
      }

      if (!responseText) throw new Error(`BGG Sync failed. Details: ${fetchError?.message}`);
      
      const lowerText = responseText.trim().toLowerCase();
      if (lowerText.startsWith("<!doctype html>") || lowerText.startsWith("<html")) {
        throw new Error(`Received HTML instead of XML. Proxy likely rate-limited.`);
      }
      
      return { text: responseText, status: statusCode };
    };

    try {
      const collectionRes = await fetchBGG(`https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&stats=1`, 'collection');
      
      if (collectionRes.status === 202) {
        setError("BGG is preparing your data. This can take a few moments. Please click Sync again in 30 seconds.");
        setLoading(false);
        return;
      }

      const parser = new DOMParser();
      const collXml = parser.parseFromString(collectionRes.text, "text/xml");
      const errorNode = collXml.querySelector("error message") || collXml.querySelector("message");
      if (errorNode) throw new Error(`BGG API Message: ${errorNode.textContent}`);

      const items = collXml.querySelectorAll("item");
      if (items.length === 0) throw new Error(`No games found for ${username}.`);

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

      // Fetch plays history
      try {
        const playsRes = await fetchBGG(`https://boardgamegeek.com/xmlapi2/plays?username=${encodeURIComponent(username)}`, 'plays');
        const playsXml = parser.parseFromString(playsRes.text, "text/xml");
        
        const playNodes = playsXml.querySelectorAll("play");
        const parsedPlays = Array.from(playNodes).map(play => {
          const itemNode = play.querySelector("item");
          const gameId = itemNode?.getAttribute("objectid");
          const gameName = itemNode?.getAttribute("name") || "Unknown Game";
          const matchedGame = parsedGames.find(g => g.id === gameId);
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
      } catch (playErr) {
        console.warn("Failed to fetch plays, continuing with collection...", playErr);
        setPlaysData([]); 
      }

    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // AUGMENT COLLECTION: Add Custom Cloud Plays to BGG Play Counts
  const augmentedCollection = useMemo(() => {
    return collection.map(game => {
      const extraPlays = customPlays.filter(p => p.gameId === game.id || p.game === game.name).length;
      return {
        ...game,
        plays: game.plays + extraPlays
      };
    });
  }, [collection, customPlays]);

  const sortedCollection = useMemo(() => {
    let filtered = [...augmentedCollection]; 

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
  }, [augmentedCollection, sortBy, filterPlayers, filterMinRating, filterRatingType]);

  const stats = useMemo(() => {
    if (!augmentedCollection.length) return null;

    const totalGames = augmentedCollection.length;
    const totalPlays = augmentedCollection.reduce((sum, game) => sum + game.plays, 0);
    const ratedGames = augmentedCollection.filter(g => g.myRating !== null);
    const avgRating = ratedGames.length ? (ratedGames.reduce((sum, g) => sum + g.myRating, 0) / ratedGames.length).toFixed(1) : 'N/A';

    const playCounts = augmentedCollection.map(g => g.plays).sort((a, b) => b - a);
    let hIndex = 0;
    while (hIndex < playCounts.length && playCounts[hIndex] > hIndex) hIndex++;

    const topPlayed = [...augmentedCollection].sort((a, b) => b.plays - a.plays).slice(0, 5);
    const topRated = [...augmentedCollection].filter(g => g.myRating).sort((a, b) => b.myRating - a.myRating).slice(0, 5);

    return { totalGames, totalPlays, avgRating, hIndex, topPlayed, topRated };
  }, [augmentedCollection]);

  const combinedPlays = useMemo(() => {
    return [...customPlays, ...playsData].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [playsData, customPlays]);

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

  const playerSuggestions = useMemo(() => {
    return playerStatsArray.map(p => p.name).sort((a, b) => a.localeCompare(b));
  }, [playerStatsArray]);

  // Firebase Auth Effect (Only runs if Firebase keys were valid)
  useEffect(() => {
    if (!auth) return; 
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Firebase Data Effect
  useEffect(() => {
    if (!user || !db) return;
    
    const playsRef = firestoreCollection(db, 'artifacts', appId, 'users', user.uid, 'plays');
    const unsubscribePlays = onSnapshot(playsRef, (snapshot) => {
      const plays = snapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
      setCustomPlays(plays);
    });

    const aliasRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'aliases');
    const unsubscribeAliases = onSnapshot(aliasRef, (docSnap) => {
      if (docSnap.exists()) {
        setAliases(docSnap.data());
      } else if (!useMockData) {
        setAliases({}); 
      }
    });

    return () => {
      unsubscribePlays();
      unsubscribeAliases();
    };
  }, [user, useMockData]);

  // Handle Adding Custom Play
  const handleAddPlayer = () => {
    setNewPlayForm(prev => ({ ...prev, players: [...prev.players, { name: '', score: '', win: false }] }));
  };

  const handlePlayerChange = (index, field, value) => {
    const updatedPlayers = [...newPlayForm.players];
    updatedPlayers[index][field] = value;
    setNewPlayForm(prev => ({ ...prev, players: updatedPlayers }));
  };

  const handleRemovePlayer = (index) => {
    const updatedPlayers = newPlayForm.players.filter((_, i) => i !== index);
    setNewPlayForm(prev => ({ ...prev, players: updatedPlayers }));
  };

  const handleEditPlay = (play) => {
    setEditingPlayId(play.firebaseId);
    setNewPlayForm({
      gameId: play.gameId || '',
      gameName: play.game || '',
      date: play.date,
      players: play.players.map(p => ({ ...p }))
    });
    setShowAddPlay(true);
  };

  const handleDeletePlay = async (firebaseId) => {
    if (!user || !db) return;
    try {
      const playDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'plays', firebaseId);
      await deleteDoc(playDoc);
    } catch (error) {
      console.error("Error deleting play:", error);
    }
  };

  const handleAddCustomPlay = async (e) => {
    e.preventDefault();
    if (!user || !db) {
      alert("Database connection is not active. Check your Firebase Keys.");
      return;
    }
    
    let gameId = newPlayForm.gameId;
    let gameName = newPlayForm.gameName;
    let image = null;

    if (gameId) {
      const gameObj = collection.find(g => g.id === gameId);
      gameName = gameObj?.name || gameName;
      image = gameObj?.image || null;
    }

    if (!gameName) {
      alert("Please select or enter a game.");
      return;
    }

    let playersToSave = [...newPlayForm.players];
    const manuallySelectedWinner = playersToSave.some(p => p.win);
    
    if (!manuallySelectedWinner) {
      const numericScores = playersToSave.map(p => parseFloat(p.score) || 0);
      const maxScore = Math.max(...numericScores);
      if (maxScore > 0) {
        playersToSave = playersToSave.map(p => ({
          ...p,
          win: (parseFloat(p.score) || 0) === maxScore
        }));
      }
    }
    
    try {
      const playsColl = firestoreCollection(db, 'artifacts', appId, 'users', user.uid, 'plays');
      const payload = {
        id: editingPlayId ? editingPlayId : 'custom-' + Date.now(),
        date: newPlayForm.date,
        gameId: gameId,
        game: gameName,
        image: image, 
        players: playersToSave.filter(p => p.name.trim() !== '') 
      };

      if (editingPlayId) {
        const playDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'plays', editingPlayId);
        await updateDoc(playDoc, payload);
      } else {
        await addDoc(playsColl, payload);
      }
      
      setShowAddPlay(false);
      setEditingPlayId(null);
      setNewPlayForm(initialPlayForm);
    } catch (error) {
      console.error("Error saving play:", error);
    }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file || !user || !db) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length <= 1) return; 

      const playsToImport = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim());
        const [date, gameName, ...playerParts] = parts;

        if (!date || !gameName) continue;

        const players = [];
        for (let j = 0; j < playerParts.length; j += 2) {
          if (playerParts[j]) {
            players.push({
              name: playerParts[j],
              score: playerParts[j+1] || '',
              win: false 
            });
          }
        }

        const scores = players.map(p => parseFloat(p.score) || 0);
        const maxScore = Math.max(...scores);
        const finalPlayers = players.map(p => ({
          ...p,
          win: maxScore > 0 ? (parseFloat(p.score) || 0) === maxScore : false
        }));

        const matchedGame = collection.find(g => g.name.toLowerCase() === gameName.toLowerCase());

        playsToImport.push({
          id: 'imported-' + Date.now() + '-' + i,
          date,
          game: gameName,
          gameId: matchedGame?.id || null,
          image: matchedGame?.image || null,
          players: finalPlayers
        });
      }

      try {
        const batch = writeBatch(db);
        const playsColl = firestoreCollection(db, 'artifacts', appId, 'users', user.uid, 'plays');
        
        playsToImport.forEach(play => {
          const newDocRef = doc(playsColl);
          batch.set(newDocRef, play);
        });
        
        await batch.commit();
        alert(`Successfully imported ${playsToImport.length} plays!`);
      } catch (error) {
        console.error("Batch import error:", error);
        alert("Failed to import CSV. Check console for details.");
      }
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

  const handleSaveAlias = async (e) => {
    e.preventDefault();
    if (!user || !db || !aliasForm.from.trim() || !aliasForm.to.trim()) return;
    
    const newAliases = { 
      ...aliases, 
      [aliasForm.from.trim().toLowerCase()]: aliasForm.to.trim() 
    };
    
    try {
      const aliasRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'aliases');
      await setDoc(aliasRef, newAliases);
      setAliasForm({ from: '', to: '' });
      if (useMockData) setAliases(newAliases);
    } catch (error) {
      console.error("Error saving alias:", error);
    }
  };

  const handleRemoveAlias = async (keyToRemove) => {
    if (!user || !db) return;
    const newAliases = { ...aliases };
    delete newAliases[keyToRemove];
    
    try {
      const aliasRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'aliases');
      await setDoc(aliasRef, newAliases);
      if (useMockData) setAliases(newAliases);
    } catch (error) {
      console.error("Error removing alias:", error);
    }
  };

  // Load collection automatically on mount
  useEffect(() => {
    fetchCollection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200 pb-12">
        <header className="bg-indigo-600 dark:bg-slate-800 text-white shadow-md transition-colors duration-200">
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <Library className="h-8 w-8" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Boardgame Tracker</h1>
                <p className="text-indigo-200 dark:text-slate-400 text-sm">Dashboard for {resolveName(username)}</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              
              {/* Dark Mode Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-md bg-indigo-500 hover:bg-indigo-400 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors text-white flex items-center justify-center"
                title="Toggle Dark Mode"
              >
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              <button
                onClick={() => {
                  setUseMockData(!useMockData);
                  if (!useMockData) {
                    setTimeout(() => fetchCollection(), 0);
                  }
                }}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${useMockData ? 'bg-amber-500 text-amber-950 hover:bg-amber-400' : 'bg-indigo-800 dark:bg-indigo-600 text-indigo-200 dark:text-white hover:bg-indigo-700 dark:hover:bg-indigo-500'}`}
              >
                <Database className="h-4 w-4 mr-2" />
                {useMockData ? 'Using Mock Data' : 'Live Data Mode'}
              </button>

              <div className="relative flex items-center w-full sm:w-auto">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="BGG Username..."
                    disabled={useMockData}
                    className="w-full sm:w-48 pl-4 pr-4 py-2 rounded-l-md border-0 text-slate-900 dark:text-white dark:bg-slate-700 shadow-inner focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-500 outline-none disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500"
                  />
                  <button
                    onClick={fetchCollection}
                    disabled={loading || useMockData}
                    className="bg-indigo-800 dark:bg-slate-600 hover:bg-indigo-900 dark:hover:bg-slate-500 text-white p-2 rounded-r-md transition-colors flex items-center justify-center h-full px-4 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
                  </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          
          {/* Missing API Key Warning for Production */}
          {!isFirebaseValid && !useMockData && (
             <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-lg mb-6 flex items-center shadow-sm">
               <AlertCircle className="h-5 w-5 mr-3 text-amber-600 dark:text-amber-400 shrink-0" />
               <p className="text-sm"><strong>Database Not Connected:</strong> You have not entered your Firebase Keys in App.jsx yet. You can still view your BGG data, but Custom Plays and Aliases cannot be saved.</p>
            </div>
          )}

          {useMockData && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-lg mb-6 flex items-center shadow-sm">
               <AlertCircle className="h-5 w-5 mr-3 text-amber-600 dark:text-amber-400" />
               <p className="text-sm">You are currently viewing <strong>Mock Data</strong> to preview the layout. BGG network fetching is bypassed.</p>
            </div>
          )}

          {error && !useMockData && (
            <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-4 mb-8 rounded-r-md shadow-sm flex items-start">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-red-800 dark:text-red-300 font-medium">Error loading collection</h3>
                <p className="text-red-700 dark:text-red-400 text-sm mt-1 font-mono break-words">{error}</p>
              </div>
            </div>
          )}

          {!loading && collection.length === 0 && !error && !useMockData && (
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <Library className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200">No Collection Loaded</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
                No games were found in this collection. Try searching a different username.
              </p>
            </div>
          )}

          {collection.length > 0 && (
            <div className="space-y-6">
              
              {/* Tab Navigation */}
              <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="-mb-px flex space-x-8 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab('collection')}
                    className={`${
                      activeTab === 'collection'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}
                  >
                    <Grid className="h-4 w-4 mr-2" />
                    Collection View
                  </button>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`${
                      activeTab === 'dashboard'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}
                  >
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Stats Dashboard
                  </button>
                  <button
                    onClick={() => setActiveTab('plays')}
                    className={`${
                      activeTab === 'plays'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}
                  >
                    <History className="h-4 w-4 mr-2" />
                    Recent Plays
                  </button>
                  <button
                    onClick={() => setActiveTab('players')}
                    className={`${
                      activeTab === 'players'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
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
                  <div className="flex flex-col bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 gap-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">
                        Showing <span className="text-indigo-600 dark:text-indigo-400">{sortedCollection.length}</span> of {augmentedCollection.length} games
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-900 rounded-md border border-slate-300 dark:border-slate-600 p-1 flex-1 md:flex-none">
                          <Users className="h-4 w-4 text-slate-400 ml-2" />
                          <select
                            value={filterPlayers}
                            onChange={(e) => setFilterPlayers(e.target.value)}
                            className="bg-transparent text-slate-700 dark:text-slate-200 text-sm focus:ring-0 border-0 p-1 outline-none cursor-pointer w-full"
                          >
                            <option value="any">Any Players</option>
                            <option value="1">1 Player</option>
                            <option value="2">2 Players</option>
                            <option value="3">3 Players</option>
                            <option value="4">4 Players</option>
                            <option value="5">5+ Players</option>
                          </select>
                        </div>

                        <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-900 rounded-md border border-slate-300 dark:border-slate-600 p-1 flex-1 md:flex-none">
                          <Star className="h-4 w-4 text-slate-400 ml-2" />
                          <select
                            value={filterRatingType}
                            onChange={(e) => setFilterRatingType(e.target.value)}
                            className="bg-transparent text-slate-700 dark:text-slate-200 text-sm focus:ring-0 border-0 p-1 pr-0 outline-none cursor-pointer font-medium"
                          >
                            <option value="avgRating">BGG Avg</option>
                            <option value="myRating">My Rating</option>
                          </select>
                          <span className="text-slate-300 dark:text-slate-600">|</span>
                          <select
                            value={filterMinRating}
                            onChange={(e) => setFilterMinRating(e.target.value)}
                            className="bg-transparent text-slate-700 dark:text-slate-200 text-sm focus:ring-0 border-0 p-1 outline-none cursor-pointer"
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
                            className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none w-full sm:w-auto"
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
                      <div key={game.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow group flex flex-col">
                        
                        <div className="h-48 bg-slate-100 dark:bg-slate-700/50 relative flex items-center justify-center p-4 overflow-hidden">
                          {game.image ? (
                            <img 
                              src={game.image} 
                              alt={game.name} 
                              className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">No Image</span>
                          )}
                          {game.plays > 0 && (
                             <div className="absolute top-3 right-3 bg-indigo-600 dark:bg-indigo-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center shadow-sm">
                               <Play className="h-3 w-3 mr-1 fill-current" /> {game.plays}
                             </div>
                          )}
                        </div>

                        <div className="p-4 flex-grow flex flex-col">
                          <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1" title={game.name}>
                            {game.name}
                          </h3>
                          
                          <div className="flex items-center justify-between mt-1 mb-4">
                            <p className="text-sm text-slate-500 dark:text-slate-400">{game.year}</p>
                            {(game.minPlayers > 0) && (
                              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center bg-slate-50 dark:bg-slate-700/50 px-2 py-1 rounded border border-slate-100 dark:border-slate-700">
                                <Users className="h-3 w-3 mr-1" />
                                {game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}-${game.maxPlayers}`} Players
                              </p>
                            )}
                          </div>
                          
                          <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold tracking-wider mb-1">My Rating</span>
                              <div className="flex items-center text-amber-500 font-bold">
                                <Star className="h-4 w-4 mr-1 fill-current" />
                                {game.myRating ? game.myRating.toFixed(1) : <span className="text-slate-400 dark:text-slate-500 font-normal italic text-sm">N/A</span>}
                              </div>
                            </div>

                            <div className="flex flex-col items-end">
                              <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold tracking-wider mb-1 flex items-center">
                                <TrendingUp className="h-3 w-3 mr-1" /> BGG Avg
                              </span>
                              <div className="flex items-center text-slate-700 dark:text-slate-300 font-medium">
                                <Star className="h-4 w-4 mr-1 text-slate-300 dark:text-slate-600" />
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
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center space-x-4">
                      <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-lg text-indigo-600 dark:text-indigo-400"><Library className="h-6 w-6" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Games</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalGames}</p>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center space-x-4">
                      <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg text-green-600 dark:text-green-400"><Play className="h-6 w-6 fill-current" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Plays</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalPlays}</p>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center space-x-4">
                      <div className="bg-amber-100 dark:bg-amber-900/30 p-3 rounded-lg text-amber-600 dark:text-amber-500"><Star className="h-6 w-6 fill-current" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Avg Personal Rating</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.avgRating}</p>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center space-x-4">
                      <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg text-purple-600 dark:text-purple-400"><BarChart3 className="h-6 w-6" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">H-Index</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.hIndex}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center">
                        <Trophy className="h-5 w-5 text-indigo-500 dark:text-indigo-400 mr-2" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-200">Most Played Games</h3>
                      </div>
                      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                        {stats.topPlayed.map((game, idx) => (
                          <li key={`played-${game.id}`} className="px-6 py-4 flex items-center hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <span className="text-slate-400 dark:text-slate-500 font-bold w-6">{idx + 1}.</span>
                            <div className="h-10 w-10 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden flex-shrink-0 mr-4 border border-slate-200 dark:border-slate-600">
                              {game.image ? <img src={game.image} alt={game.name} className="h-full w-full object-cover" /> : null}
                            </div>
                            <span className="font-medium text-slate-900 dark:text-white flex-1 truncate">{game.name}</span>
                            <div className="flex items-center text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full">
                              <Play className="h-3 w-3 mr-1.5 fill-slate-400 dark:fill-slate-500 text-slate-400 dark:text-slate-500" /> {game.plays} plays
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center">
                        <Star className="h-5 w-5 text-amber-500 mr-2 fill-current" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-200">Highest Rated by You</h3>
                      </div>
                      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                        {stats.topRated.map((game, idx) => (
                          <li key={`rated-${game.id}`} className="px-6 py-4 flex items-center hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <span className="text-slate-400 dark:text-slate-500 font-bold w-6">{idx + 1}.</span>
                            <div className="h-10 w-10 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden flex-shrink-0 mr-4 border border-slate-200 dark:border-slate-600">
                              {game.image ? <img src={game.image} alt={game.name} className="h-full w-full object-cover" /> : null}
                            </div>
                            <span className="font-medium text-slate-900 dark:text-white flex-1 truncate">{game.name}</span>
                            <div className="flex items-center text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-full">
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
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex items-center">
                        <History className="h-5 w-5 text-indigo-500 dark:text-indigo-400 mr-2" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-200">Play History</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                        <span className="text-sm text-slate-500 dark:text-slate-400 font-medium hidden md:inline mr-2">Showing latest {combinedPlays.length} sessions</span>
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          accept=".csv" 
                          onChange={handleCSVImport}
                        />
                        <button 
                          onClick={() => fileInputRef.current.click()}
                          className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center shadow-sm"
                        >
                          <FileUp className="h-4 w-4 mr-1" /> Import CSV
                        </button>
                        <button 
                          onClick={() => {
                            setEditingPlayId(null);
                            setNewPlayForm(initialPlayForm);
                            setShowAddPlay(true);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center shadow-sm"
                        >
                          <Plus className="h-4 w-4 mr-1" /> Log Play
                        </button>
                      </div>
                    </div>
                    
                    {combinedPlays.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                        <Calendar className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <p>No recent plays found.</p>
                        <p className="text-sm mt-1 mb-4">Log some plays on BoardGameGeek to see them appear here, or add your own!</p>
                        <button 
                          onClick={() => setShowAddPlay(true)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center shadow-sm"
                        >
                          <Plus className="h-4 w-4 mr-2" /> Log Your First Play
                        </button>
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                        {combinedPlays.map((play) => (
                          <li key={play.firebaseId || play.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex flex-col sm:flex-row gap-6 items-start sm:items-center relative group">
                            <div className="flex items-center gap-4 w-full sm:w-1/3">
                              <div className="h-16 w-16 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-600 flex items-center justify-center">
                                {play.image ? (
                                  <img src={play.image} alt={play.game} className="h-full w-full object-cover" />
                                ) : (
                                  <Grid className="h-6 w-6 text-slate-300 dark:text-slate-500" />
                                )}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900 dark:text-white leading-tight">{play.game}</h4>
                                <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center mt-1">
                                  <Calendar className="h-3 w-3 mr-1" /> {play.date}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex-1 w-full bg-slate-50 dark:bg-slate-700/30 sm:bg-transparent rounded-lg p-3 sm:p-0">
                              <div className="flex items-center text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                                <Users className="h-3 w-3 mr-1" /> Players
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {play.players.length > 0 ? play.players.map((p, idx) => {
                                  const resolvedPName = resolveName(p.name);
                                  return (
                                    <div 
                                      key={idx} 
                                      className={`flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${p.win ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/50 text-amber-800 dark:text-amber-200 shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300'}`}
                                    >
                                      {p.win && <Trophy className="h-3 w-3 mr-1.5 text-amber-500" />}
                                      {resolvedPName}
                                      {p.score && <span className="ml-2 pl-2 border-l border-slate-300 dark:border-slate-600 opacity-70">{p.score}</span>}
                                    </div>
                                  );
                                }) : (
                                  <span className="text-sm text-slate-500 dark:text-slate-400 italic">No players recorded</span>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons for custom plays */}
                            {play.firebaseId && (
                              <div className="absolute right-4 top-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => handleEditPlay(play)}
                                  className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-sm"
                                  title="Edit Play"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeletePlay(play.firebaseId)}
                                  className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-500 hover:text-red-500 transition-colors shadow-sm"
                                  title="Delete Play"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
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
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center">
                        <Trophy className="h-5 w-5 text-amber-500 mr-2" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-200">Global Wins Leaderboard</h3>
                      </div>
                      <div className="p-6">
                        <div className="space-y-4">
                          {topWinners.map((player, idx) => {
                            const maxWins = topWinners[0].wins || 1;
                            const percentage = (player.wins / maxWins) * 100;
                            const isFirst = idx === 0;
                            return (
                              <div key={player.name} className="flex items-center text-sm">
                                <div className="w-24 font-bold text-slate-700 dark:text-slate-300 flex items-center justify-end pr-4 truncate">
                                  {isFirst && <Award className="h-4 w-4 mr-1 text-amber-500" />}
                                  {player.name}
                                </div>
                                <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-r-md h-8 flex items-center relative group">
                                  <div 
                                    className={`h-full rounded-r-md transition-all duration-1000 ${isFirst ? 'bg-amber-400 dark:bg-amber-500' : 'bg-indigo-400 dark:bg-indigo-500'}`} 
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                  <span className="absolute left-3 text-xs font-bold text-slate-800 dark:text-slate-100 drop-shadow-sm">
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
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex items-center">
                        <UserCircle className="h-5 w-5 text-indigo-500 dark:text-indigo-400 mr-2" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-200">Player Details</h3>
                      </div>
                      
                      <div className="flex items-center space-x-4 w-full sm:w-auto">
                        {/* Player Selector */}
                        {playerStatsArray.length > 0 && (
                          <div className="flex items-center space-x-2 flex-1 sm:flex-none">
                            <select
                              value={selectedPlayerName || (playerStatsArray[0]?.name || '')}
                              onChange={(e) => setSelectedPlayerName(e.target.value)}
                              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none w-full sm:w-48 shadow-sm"
                            >
                              {playerStatsArray.map(p => (
                                <option key={p.name} value={p.name}>{p.name} ({p.plays} plays)</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <button 
                          onClick={() => setShowAliasModal(true)}
                          className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center shadow-sm whitespace-nowrap"
                        >
                          <Settings className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Manage Aliases</span>
                        </button>
                      </div>
                    </div>

                    {playerStatsArray.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                        <Award className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
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
                                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-5 border border-indigo-100 dark:border-indigo-800/50">
                                  <h4 className="text-indigo-900 dark:text-indigo-300 font-bold text-lg mb-1">{player.name}</h4>
                                  <p className="text-indigo-700 dark:text-indigo-400 text-sm mb-4">Overall Performance</p>
                                  
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white dark:bg-slate-800 p-3 rounded shadow-sm border border-indigo-50 dark:border-indigo-900/50">
                                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Total Plays</p>
                                      <p className="text-2xl font-black text-slate-800 dark:text-white">{player.plays}</p>
                                    </div>
                                    <div className="bg-white dark:bg-slate-800 p-3 rounded shadow-sm border border-indigo-50 dark:border-indigo-900/50">
                                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Wins (1st)</p>
                                      <p className="text-2xl font-black text-amber-500">{player.wins}</p>
                                    </div>
                                    <div className="col-span-2 bg-white dark:bg-slate-800 p-3 rounded shadow-sm border border-indigo-50 dark:border-indigo-900/50">
                                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">Win Rate</p>
                                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 mb-1 relative overflow-hidden">
                                        <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${winRate}%` }}></div>
                                      </div>
                                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{winRate}%</p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="md:w-2/3">
                                <h4 className="text-slate-800 dark:text-slate-200 font-bold text-lg mb-4 flex items-center">
                                  <BarChart3 className="h-5 w-5 mr-2 text-slate-400 dark:text-slate-500" />
                                  Placement Distribution
                                </h4>
                                <div className="space-y-3">
                                  {Object.entries(player.placements).sort((a, b) => Number(a[0]) - Number(b[0])).map(([rank, count]) => {
                                    const percentage = (count / maxPlacementCount) * 100;
                                    const isFirst = rank === "1";
                                    return (
                                      <div key={rank} className="flex items-center text-sm">
                                        <div className="w-16 font-bold text-slate-600 dark:text-slate-400 flex items-center justify-end pr-3">
                                          {isFirst && <Trophy className="h-3 w-3 mr-1 text-amber-500" />}
                                          {rank}{rank === "1" ? "st" : rank === "2" ? "nd" : rank === "3" ? "rd" : "th"}
                                        </div>
                                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-r-md h-8 flex items-center relative group">
                                          <div 
                                            className={`h-full rounded-r-md transition-all duration-1000 ${isFirst ? 'bg-amber-400 dark:bg-amber-500' : 'bg-indigo-300 dark:bg-indigo-500'}`} 
                                            style={{ width: `${percentage}%` }}
                                          ></div>
                                          <span className="absolute left-3 text-xs font-bold text-slate-800 dark:text-slate-200 drop-shadow-sm">
                                            {count} {count === 1 ? 'time' : 'times'}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-6 italic bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-100 dark:border-slate-700">
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
        
        {/* Add/Edit Custom Play Modal */}
        {showAddPlay && (
          <div className="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg my-8 overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-slate-700 shrink-0">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center">
                  <Database className="h-5 w-5 mr-2 text-indigo-500" />
                  {editingPlayId ? 'Edit Custom Play' : 'Log Custom Play'}
                </h3>
                <button onClick={() => { setShowAddPlay(false); setEditingPlayId(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="p-5 overflow-y-auto flex-1">
                <form id="add-play-form" onSubmit={handleSavePlay} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Game <span className="text-red-500">*</span></label>
                      <select 
                        required 
                        value={newPlayForm.gameId} 
                        onChange={(e) => {
                          const gId = e.target.value;
                          const gName = collection.find(g => g.id === gId)?.name || '';
                          setNewPlayForm({...newPlayForm, gameId: gId, gameName: gName})
                        }}
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">Select a game from collection...</option>
                        {collection.sort((a,b)=>a.name.localeCompare(b.name)).map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date Played</label>
                      <input 
                        type="date" 
                        required 
                        value={newPlayForm.date} 
                        onChange={e => setNewPlayForm({...newPlayForm, date: e.target.value})} 
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-3">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Players</label>
                      <button 
                        type="button" 
                        onClick={handleAddPlayer} 
                        className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded font-medium flex items-center hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Player
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      {newPlayForm.players.map((p, idx) => (
                        <div key={idx} className="flex gap-2 items-center bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                          <input 
                            required
                            type="text" 
                            list="player-suggestions"
                            placeholder="Name" 
                            value={p.name} 
                            onChange={(e) => handlePlayerChange(idx, 'name', e.target.value)} 
                            className="flex-1 min-w-0 p-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none text-sm" 
                          />
                          <input 
                            type="number" 
                            placeholder="Score" 
                            value={p.score} 
                            onChange={(e) => handlePlayerChange(idx, 'score', e.target.value)} 
                            className="w-16 sm:w-20 p-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none text-sm" 
                          />
                          <label className="flex items-center justify-center cursor-pointer p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Winner">
                            <input 
                              type="checkbox" 
                              checked={p.win} 
                              onChange={(e) => handlePlayerChange(idx, 'win', e.target.checked)} 
                              className="sr-only" 
                            />
                            <Trophy className={`h-4 w-4 ${p.win ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`} />
                          </label>
                          {newPlayForm.players.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => handleRemovePlayer(idx)}
                              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                              title="Remove Player"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Suggestions Datalist */}
                  <datalist id="player-suggestions">
                    {playerSuggestions.map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </form>
              </div>
              
              <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0">
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowAddPlay(false); setEditingPlayId(null); }} className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 p-2.5 rounded-lg font-medium transition-colors">Cancel</button>
                  <button type="submit" form="add-play-form" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 rounded-lg font-medium transition-colors shadow-sm">
                    {editingPlayId ? 'Update Play' : 'Save Play'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alias Management Modal */}
        {showAliasModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center">
                  <Settings className="h-5 w-5 mr-2 text-indigo-500" />
                  Manage Player Aliases
                </h3>
                <button onClick={() => setShowAliasModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="p-5 overflow-y-auto">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                  Link multiple names (like "Inboundbreeze" on BGG and "Richard" on custom plays) to combine their stats.
                </p>

                <form onSubmit={handleSaveAlias} className="flex gap-2 items-end mb-8 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Old Alias (e.g. Inboundbreeze)</label>
                    <input required type="text" value={aliasForm.from} onChange={e => setAliasForm({...aliasForm, from: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none text-sm" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-slate-400 mb-2.5 shrink-0"/>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Main Name (e.g. Richard)</label>
                    <input required type="text" value={aliasForm.to} onChange={e => setAliasForm({...aliasForm, to: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none text-sm" />
                  </div>
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded text-sm font-medium transition-colors h-[38px] mb-[1px]">Add</button>
                </form>

                <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-3 text-sm uppercase tracking-wider">Active Aliases</h4>
                {Object.keys(aliases).length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-500 italic border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded-lg text-center">No aliases defined yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {Object.entries(aliases).map(([from, to]) => (
                      <li key={from} className="flex justify-between items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-lg shadow-sm">
                        <div className="flex items-center text-sm">
                          <span className="text-slate-500 dark:text-slate-400 line-through decoration-slate-300 mr-2">{from}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400 mr-2" />
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">{to}</span>
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
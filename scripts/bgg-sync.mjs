import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, collection, writeBatch } from 'firebase/firestore';
import { DOMParser } from 'xmldom'; // Requires: npm install xmldom

// 1. Grab the secret
let configStr = process.env.FIREBASE_CONFIG;

if (!configStr) {
  console.error("FATAL ERROR: FIREBASE_CONFIG secret is missing or empty.");
  process.exit(1);
}

// 2. Bulletproof Parsing: Extract the object even if they pasted the whole 'const' block
configStr = configStr.trim();
const match = configStr.match(/\{[\s\S]*\}/);
if (match) {
    configStr = match[0];
}

let firebaseConfig;
try {
  // Try strict JSON first
  firebaseConfig = JSON.parse(configStr);
} catch (e) {
  // Fallback: Relaxed parser that handles missing quotes around keys (standard JS object)
  try {
    firebaseConfig = new Function("return " + configStr)();
  } catch (err) {
    console.error("FATAL ERROR: Could not parse FIREBASE_CONFIG. Please ensure it is a valid object.");
    process.exit(1);
  }
}

const username = process.env.BGG_USERNAME || 'Inboundbreeze';
const appId = 'boardgame-tracker-live'; // Must match your web app exactly

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const fetchBGG = async (url) => {
  // Add a delay to respect BGG rate limits
  await new Promise(r => setTimeout(r, 2000));
  const res = await fetch(url);
  if (res.status === 202) throw new Error("202 Accepted: BGG is still building the data. Try again later.");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
};

const runSync = async () => {
  try {
    console.log("Authenticating with Firebase...");
    await signInAnonymously(auth);

    console.log(`Fetching BGG Collection for ${username}...`);
    const collXmlStr = await fetchBGG(`https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&stats=1`);
    const parser = new DOMParser();
    const collXml = parser.parseFromString(collXmlStr, "text/xml");
    
    const items = collXml.getElementsByTagName("item");
    if (!items || items.length === 0) throw new Error("No games found or XML invalid.");

    const parsedGames = Array.from(items).map(item => {
      const statsNode = item.getElementsByTagName("stats")[0];
      const ratingNode = statsNode?.getElementsByTagName("rating")[0];
      const avgNode = ratingNode?.getElementsByTagName("average")[0];
      
      const getTag = (parent, tag) => parent.getElementsByTagName(tag)[0]?.textContent || null;
      
      return {
        id: item.getAttribute("objectid"),
        name: getTag(item, "name") || "Unknown Game",
        thumbnail: getTag(item, "thumbnail"),
        image: getTag(item, "image"),
        year: getTag(item, "yearpublished") || "-",
        plays: parseInt(getTag(item, "numplays") || "0", 10),
        myRating: ratingNode?.getAttribute("value") !== "N/A" ? parseFloat(ratingNode?.getAttribute("value")) : null,
        avgRating: avgNode?.getAttribute("value") ? parseFloat(avgNode?.getAttribute("value")) : null,
        minPlayers: parseInt(statsNode?.getAttribute("minplayers") || "0", 10),
        maxPlayers: parseInt(statsNode?.getAttribute("maxplayers") || "0", 10),
      };
    });

    console.log(`Uploading ${parsedGames.length} games to Firebase...`);
    const gamesRef = collection(db, 'artifacts', appId, 'public', 'data', 'bgg_games');
    let batch = writeBatch(db);
    let count = 0;
    for (const game of parsedGames) {
      batch.set(doc(gamesRef, game.id), game);
      count++;
      if (count === 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
    }
    if (count > 0) await batch.commit();

    console.log("Fetching BGG Plays...");
    const playsXmlStr = await fetchBGG(`https://boardgamegeek.com/xmlapi2/plays?username=${encodeURIComponent(username)}`);
    const playsXml = parser.parseFromString(playsXmlStr, "text/xml");
    const playNodes = playsXml.getElementsByTagName("play");
    
    const parsedPlays = Array.from(playNodes).map(play => {
      const itemNode = play.getElementsByTagName("item")[0];
      const gameId = itemNode?.getAttribute("objectid");
      const matchedGame = parsedGames.find(g => g.id === gameId);
      const playerNodes = play.getElementsByTagName("player");
      
      const players = Array.from(playerNodes).map(p => ({
        name: p.getAttribute("name") || p.getAttribute("username") || "Anonymous",
        score: p.getAttribute("score"),
        win: p.getAttribute("win") === "1"
      }));

      return {
        id: play.getAttribute("id"),
        date: play.getAttribute("date"),
        game: itemNode?.getAttribute("name") || "Unknown Game",
        image: matchedGame?.image || null,
        players: players
      };
    });

    console.log(`Uploading ${parsedPlays.length} plays to Firebase...`);
    const playsRef = collection(db, 'artifacts', appId, 'public', 'data', 'bgg_plays');
    batch = writeBatch(db);
    count = 0;
    for (const play of parsedPlays) {
      batch.set(doc(playsRef, play.id), play);
      count++;
      if (count === 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
    }
    if (count > 0) await batch.commit();

    console.log("Sync Complete!");
    process.exit(0);
  } catch (err) {
    console.error("FATAL ERROR:", err);
    process.exit(1);
  }
};

runSync();
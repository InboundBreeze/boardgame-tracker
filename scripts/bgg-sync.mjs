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

// 2. Ultra-Robust Parsing
configStr = configStr.trim();

// Strip out variable declarations if "const firebaseConfig =" was accidentally copied
configStr = configStr.replace(/^(const|let|var)\s+\w+\s*=\s*/, '');
// Strip trailing semicolons
configStr = configStr.replace(/;$/, '');

// If the inner contents were copied without the curly braces, wrap it for them
if (!configStr.startsWith('{')) {
    configStr = '{ \n' + configStr + '\n }';
}

const match = configStr.match(/\{[\s\S]*\}/);
if (match) {
    configStr = match[0];
}

let firebaseConfig;
try {
  // Try strict JSON first
  firebaseConfig = JSON.parse(configStr);
} catch (e) {
  // Fallback: Relaxed parser (handles missing quotes, single quotes, missing braces)
  try {
    // The parentheses force JS to properly evaluate the string as an object
    firebaseConfig = new Function("return (" + configStr + ");")();
  } catch (err) {
    console.error("FATAL ERROR: Could not parse FIREBASE_CONFIG.");
    console.error("Parser Error:", err.message);
    // Print a safe snippet of the string so you can see what went wrong without leaking the whole key
    console.error("Snippet of what the script received:", configStr.substring(0, 45) + "...");
    process.exit(1);
  }
}

// Final safety check
if (!firebaseConfig || typeof firebaseConfig !== 'object' || !firebaseConfig.apiKey) {
    console.error("FATAL ERROR: Config parsed, but 'apiKey' is missing. Please verify your secret.");
    process.exit(1);
}

const username = process.env.BGG_USERNAME || 'Inboundbreeze';
const appId = 'boardgame-tracker-live'; // Must match your web app exactly

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Smart fetcher that mimics a browser and uses fallbacks if GitHub's IPs are blocked
const fetchBGG = async (targetUrl, retries = 2) => {
  // Add a delay to respect BGG rate limits
  await new Promise(r => setTimeout(r, 2000));
  
  // BGG's backend domain often has lower Cloudflare security than the main domain
  const geekdoUrl = targetUrl.replace('boardgamegeek.com', 'api.geekdo.com');

  const endpoints = [
    { name: "Direct (Geekdo API)", url: geekdoUrl, isJson: false },
    { name: "Direct (BGG)", url: targetUrl, isJson: false },
    { name: "AllOrigins-JSON", url: `https://api.allorigins.win/get?url=${encodeURIComponent(geekdoUrl)}`, isJson: true },
    { name: "CodeTabs", url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(geekdoUrl)}`, isJson: false }
  ];

  const debugLogs = [];
  let finalResponse = null;

  for (const endpoint of endpoints) {
    console.log(`  -> Attempting via ${endpoint.name}...`);
    try {
      const res = await fetch(endpoint.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': endpoint.isJson ? 'application/json' : 'application/xml, text/xml, */*'
        }
      });

      if (res.status === 202) {
         console.log("  -> 202 Accepted. BGG is building the data. Waiting 10 seconds before retry...");
         await new Promise(r => setTimeout(r, 10000));
         if (retries > 0) return fetchBGG(targetUrl, retries - 1);
         throw new Error("202 Accepted: BGG is still preparing the data. Please re-run the GitHub Action later.");
      }

      if (res.status === 429) {
         debugLogs.push(`${endpoint.name} (429 Rate Limit)`);
         continue;
      }

      const rawText = await res.text();
      let text = "";

      if (endpoint.isJson) {
         try {
             // Try to parse the JSON wrapper. If CF blocked it and returned HTML, this will fail safely.
             const data = JSON.parse(rawText);
             text = data.contents || "";
         } catch(e) {
             debugLogs.push(`${endpoint.name} (Invalid JSON received - Likely Cloudflare HTML)`);
             continue; // Move safely to the next proxy
         }
      } else {
         text = rawText;
      }

      // Ensure we actually got XML back and not a Cloudflare "Verify you are human" HTML page
      if ((res.ok || (endpoint.isJson && text)) && text && text.trim().length > 20 && !text.trim().toLowerCase().startsWith("<!doctype") && !text.trim().toLowerCase().startsWith("<html")) {
        console.log(`  -> Success via ${endpoint.name}!`);
        finalResponse = text;
        break;
      } else {
         debugLogs.push(`${endpoint.name} (Blocked/HTML/Empty)`);
      }
    } catch (err) {
      if (err.message.includes("202 Accepted")) throw err; // Bubble this specific error up to exit early
      debugLogs.push(`${endpoint.name} (${err.message})`);
    }
  }

  if (!finalResponse) {
    throw new Error(`All fetching endpoints failed. Cloudflare is aggressively blocking. Logs: ${debugLogs.join(" | ")}`);
  }

  return finalResponse;
};

const runSync = async () => {
  try {
    console.log("Authenticating with Firebase...");
    try {
      await signInAnonymously(auth);
      console.log("Authentication successful.");
    } catch (authErr) {
      console.warn(`\n--- FIREBASE AUTH WARNING ---`);
      console.warn(`Error: ${authErr.code}`);
      console.warn(`It looks like 'Anonymous' sign-in is not enabled in your Firebase console.`);
      console.warn(`Because your database might be in 'Test Mode', the script will try to continue anyway!`);
      console.warn(`To fix this properly: Go to Firebase Console -> Authentication -> Sign-in method -> Enable 'Anonymous'.\n`);
    }

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
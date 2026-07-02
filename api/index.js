import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || "PODSYPRO_SUPER_SECRET_KEY_CHANGE_ME";
const ETSY_API_KEY = "34axrr0o1tzjvfcdn2mexpp4";
const ETSY_SHARED_SECRET = "f5njekm23y";

const REDIRECT_URI = process.env.REDIRECT_URI || "https://podsy.pro/etsy/callback";
const BASE_URL = "https://openapi.etsy.com/v3/application";
const mysqlDate = (d = new Date()) => d.toISOString().slice(0, 19).replace("T", " ");


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const db = {
  execute: async (sql, params = []) => {
    let paramIndex = 1;
    let pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const res = await pool.query(pgSql, params);
    return [res.rows, res];
  },
  query: async (sql, params = []) => {
    let paramIndex = 1;
    let pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const res = await pool.query(pgSql, params);
    return [res.rows, res];
  }
};



// --- MIDDLEWARE ---
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ detail: "Could not validate credentials" });

  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.iss) {
      // Fallback to custom JWT if it's not a Supabase token
      jwt.verify(token, SECRET_KEY, async (err, dec) => {
        if (err) return res.status(401).json({ detail: "Invalid token" });
        const searchCol = dec.id ? "id" : "username";
        const searchVal = dec.id ? dec.id : dec.sub;
        const [users] = await db.execute(`SELECT id, username, role, daily_limit, daily_usage, subscription_end_date FROM users WHERE ${searchCol} = ?`, [searchVal]);
        if (users.length === 0) return res.status(401).json({ detail: "User not found" });
        req.user = users[0];
        next();
      });
      return;
    }

    const supabaseUrl = decoded.iss.replace('/auth/v1', '');
    const supabaseRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!supabaseRes.ok) return res.status(401).json({ detail: "Invalid Supabase token" });
    const payload = await supabaseRes.json();
    const email = payload.email;

    const [users] = await db.execute('SELECT id, username, role, daily_limit, daily_usage, subscription_end_date FROM users WHERE email = ? OR google_id = ?', [email, payload.id]);
    if (users.length === 0) {
      // Create user if not exists
      const username = payload.user_metadata?.full_name || email.split('@')[0];
      const avatarUrl = payload.user_metadata?.avatar_url || '';
      await db.execute('INSERT INTO users (username, email, google_id, role, avatar_url, auth_provider) VALUES (?, ?, ?, ?, ?, ?)', [username, email, payload.id, 'user', avatarUrl, 'google']);
      const [newUsers] = await db.execute('SELECT id, username, role, daily_limit, daily_usage, subscription_end_date FROM users WHERE email = ?', [email]);
      req.user = newUsers[0];
    } else {
      req.user = users[0];
    }
    next();
  } catch (err) {
    console.error('Auth Error:', err);
    res.status(401).json({ detail: "Token error" });
  }
};

const checkAnalysisLimit = async (req, res, next) => {
  return next(); // Deneme aşamasında limitsiz
  
  const user = req.user;
  if (user.subscription_end_date) {
    const endDate = new Date(user.subscription_end_date.split('.')[0] + 'Z');
    if (new Date() > endDate) {
      return res.status(403).json({ detail: "Your subscription has expired." });
    }
  }
  
  const today = mysqlDate().split(' ')[0];
  let usage = user.daily_usage || 0;
  const limits = { 'Free': 5, 'Pro': 500, 'Ultra': 999999, 'SaaS Pro Tier': 999999 };
  const limit = limits[user.plan] || user.daily_limit || 50;
  
  if (user.last_reset_date !== today) {
    usage = 0;
    await db.execute("UPDATE users SET daily_usage = 0, last_reset_date = ? WHERE id = ?", [today, user.id]);
  }
  
  if (usage >= limit) {
    return res.status(403).json({ detail: "You have reached your daily analysis limit." });
  }
  
  await db.execute("UPDATE users SET daily_usage = daily_usage + 1 WHERE id = ?", [user.id]);
  next();
};

const injectTrackingStatusToListings = async (listings, userId) => {
  if (!listings || listings.length === 0) return listings;
  if (!userId) {
    listings.forEach(l => l.is_tracked = 0);
    return listings;
  }
  const listingIds = listings.map(l => String(l.listing_id)).filter(id => id);
  if (listingIds.length === 0) return listings;
  
  const placeholders = listingIds.map(() => '?').join(',');
  const [tracked] = await db.query(`SELECT listing_id FROM user_tracked_listings WHERE user_id = ? AND listing_id IN (${placeholders})`, [userId, ...listingIds]);
  const trackedSet = new Set(tracked.map(r => String(r.listing_id)));
  
  listings.forEach(l => {
    l.is_tracked = trackedSet.has(String(l.listing_id)) ? 1 : 0;
  });
  return listings;
};

// --- AUTH ENDPOINTS ---

app.post("/api/auth/google", async (req, res) => {
  try {
    const { token, apikey } = req.body;
    
    // Decode the Supabase token to get the issuer (Supabase URL)
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.iss) return res.status(400).json({ error: "Invalid Supabase Token" });
    
    // Get the base Supabase URL (e.g. https://<project>.supabase.co)
    const supabaseUrl = decoded.iss.replace('/auth/v1', '');
    
    // Verify token by calling Supabase's /auth/v1/user endpoint
    const supabaseRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'apikey': apikey || ''
      }
    });
    
    if (!supabaseRes.ok) {
      return res.status(400).json({ error: "Supabase Authentication Failed" });
    }
    
    const payload = await supabaseRes.json();
    
    if (!payload || !payload.email) {
      return res.status(400).json({ error: "Invalid Supabase User Payload" });
    }

    const email = payload.email;
    const googleId = payload.id; // Supabase user ID
    const avatarUrl = payload.user_metadata?.avatar_url || payload.user_metadata?.picture || '';
    const username = payload.user_metadata?.full_name || payload.user_metadata?.name || email.split('@')[0];

    // Check if user exists by email
    let [existing] = await db.execute("SELECT id, role FROM users WHERE email = ? OR google_id = ?", [email, googleId]);
    let userId;
    let role = 'user';

    if (existing.length === 0) {
      const [result] = await db.execute("INSERT INTO users (username, email, google_id, avatar_url, role) VALUES (?, ?, ?, ?, 'user')", [username, email, googleId, avatarUrl]);
      userId = result.insertId;
    } else {
      userId = existing[0].id;
      role = existing[0].role;
      await db.execute("UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?", [googleId, avatarUrl, userId]);
    }

    const jwtToken = jwt.sign({ id: userId, username, email, role }, SECRET_KEY, { expiresIn: '7d' });
    res.json({ token: jwtToken });
  } catch (e) {
    console.error("Google auth error:", e);
    res.status(500).json({ error: "Google authentication failed" });
  }
});
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const [existing] = await db.execute("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length > 0) return res.status(400).json({ detail: "Username already registered" });
    
    const hashedPw = await bcrypt.hash(password, 10);
    await db.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, hashedPw]);
    res.json({ msg: "User created successfully" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const username = req.body.username;
    const password = req.body.password;
    
    const [users] = await db.execute("SELECT id, password_hash FROM users WHERE username = ?", [username]);
    if (users.length === 0 || !(await bcrypt.compare(password, users[0].password_hash))) {
      return res.status(400).json({ detail: "Incorrect username or password" });
    }
    
    const token = jwt.sign({ sub: username }, SECRET_KEY, { expiresIn: '7d' });
    res.json({ access_token: token, token_type: "bearer" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const [users] = await db.execute("SELECT id, username, email, avatar_url, role FROM users WHERE id = ?", [req.user.id]);
    if (users.length === 0) return res.status(404).json({ error: "User not found" });
    const user = users[0];
    
    const [shops] = await db.execute(`
      SELECT ec.id, ec.etsy_shop_id, ec.shop_name, ec.expires_at, s.icon_url 
      FROM etsy_connections ec
      LEFT JOIN shops s ON ec.etsy_shop_id = s.shop_id
      WHERE ec.user_id = ?
    `, [req.user.id]);
    
    res.json({ ...user, shops });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/me/username", authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || username.trim().length < 3) return res.status(400).json({ error: "Invalid username" });
    await db.execute("UPDATE users SET username = ? WHERE id = ?", [username.trim(), req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- ETSY OAUTH ENDPOINTS ---
const generatePkceChallenge = () => {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
};


app.get("/etsy/connect", async (req, res) => {
  try {
    const { codeVerifier, codeChallenge } = generatePkceChallenge();
    const state = crypto.randomBytes(16).toString('base64url');
    
    await db.execute("INSERT INTO oauth_states (state, code_verifier, created_at) VALUES (?, ?, ?)", [state, codeVerifier, mysqlDate()]);
    
    const scopes = "listings_w listings_r listings_d shops_r shops_w transactions_r transactions_w profile_r email_r";
    const encodedScopes = encodeURIComponent(scopes);
    const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodedScopes}&client_id=${ETSY_API_KEY}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    
    res.json({ auth_url: authUrl });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/etsy/callback", async (req, res) => {
  try {
    const { code, state } = req.body;
    const [states] = await db.execute("SELECT code_verifier FROM oauth_states WHERE state = ?", [state]);
    
    if (states.length === 0) return res.status(400).json({ detail: "Invalid state or session expired" });
    
    const codeVerifier = states[0].code_verifier;
    await db.execute("DELETE FROM oauth_states WHERE state = ?", [state]);
    
    const tokenResponse = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: ETSY_API_KEY,
        redirect_uri: REDIRECT_URI,
        code,
        code_verifier: codeVerifier
      })
    });
    
    if (!tokenResponse.ok) return res.status(400).json({ detail: `Failed to get token: ${await tokenResponse.text()}` });
    
    const tokenData = await tokenResponse.json();
    const expiresAt = mysqlDate(new Date(Date.now() + tokenData.expires_in * 1000));
    
    let shopName = null;
    let etsyShopId = null;
    let userId = null;
    
    // Extract etsy_user_id directly from the access token, exactly like python does
    const etsy_user_id = tokenData.access_token.includes('.') ? tokenData.access_token.split('.')[0] : null;
    let etsyUsername = `etsy_${etsy_user_id}`;
    
    const authString = `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`;
    
    const meResponse = await fetch(`https://api.etsy.com/v3/application/users/${etsy_user_id}`, {
      headers: { "x-api-key": authString, "Authorization": `Bearer ${tokenData.access_token}` }
    });
    
    if (meResponse.ok) {
      const meData = await meResponse.json();
      
      const [users] = await db.execute("SELECT id FROM users WHERE username = ?", [etsyUsername]);
      if (users.length === 0) {
        const [result] = await db.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", [etsyUsername, '']);
        userId = result.insertId;
      } else {
        userId = users[0].id;
      }
      const shopResponse = await fetch(`https://api.etsy.com/v3/application/users/${etsy_user_id}/shops`, {
        headers: { "x-api-key": authString, "Authorization": `Bearer ${tokenData.access_token}` }
      });
      
      if (shopResponse.ok) {
        const shopData = await shopResponse.json();
        shopName = shopData.shop_name;
        etsyShopId = shopData.shop_id;
        
        await db.execute(`
          INSERT INTO etsy_connections (user_id, etsy_shop_id, shop_name, access_token, refresh_token, expires_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, etsyShopId, shopName, tokenData.access_token, tokenData.refresh_token, expiresAt]);
      } else {
        await db.execute(`
          INSERT INTO etsy_connections (user_id, access_token, refresh_token, expires_at)
          VALUES (?, ?, ?, ?)
        `, [userId, tokenData.access_token, tokenData.refresh_token, expiresAt]);
      }
      
      const token = jwt.sign({ sub: etsyUsername }, SECRET_KEY, { expiresIn: '7d' });
      return res.json({ access_token: token, token_type: "bearer", msg: "Connected successfully", shop_name: shopName });
    }
    
    return res.status(400).json({ detail: "Failed to fetch Etsy user profile: " + (await meResponse.text()) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/me/shops", authenticateToken, async (req, res) => {
  try {
    const [shops] = await db.execute("SELECT id, etsy_shop_id, shop_name, expires_at FROM etsy_connections WHERE user_id = ?", [req.user.id]);
    res.json(shops);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- MAIN ENDPOINTS ---
app.get("/search/:keyword", authenticateToken, checkAnalysisLimit, async (req, res) => {
  try {
    const keyword = req.params.keyword.trim();
    const offset = parseInt(req.query.offset) || 0;
    const forceRefresh = req.query.force_refresh === 'true';
    const cacheKey = `${keyword}_offset_${offset}`;
    
    const [cached] = await db.execute("SELECT data FROM full_json_cache WHERE target_id = ? AND target_type = 'keyword'", [cacheKey]);
    
    if (cached.length > 0 && !forceRefresh) {
      let cachedRes = JSON.parse(cached[0].data);
      cachedRes.listings = await injectTrackingStatusToListings(cachedRes.listings, req.user.id);
      const [kRow] = await db.execute("SELECT keyword FROM user_tracked_keywords WHERE user_id = ? AND keyword = ?", [req.user.id, keyword]);
      cachedRes.is_tracked = kRow.length > 0 ? 1 : 0;
      await db.execute("INSERT INTO user_history_keywords (user_id, keyword, last_viewed) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (user_id, keyword) DO UPDATE SET last_viewed = CURRENT_TIMESTAMP", [req.user.id, keyword]);
      return res.json(cachedRes);
    }
    
    const authString = `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`;
    
    const etsyRes = await fetch(`${BASE_URL}/listings/active?keywords=${encodeURIComponent(keyword)}&limit=100&offset=${offset}&includes=Images,Shop&sort_on=score&sort_order=desc`, {
      headers: { "x-api-key": authString }
    });
    
    if (!etsyRes.ok) return res.json({ http_error: etsyRes.status, msg: await etsyRes.text() });
    
    const data = await etsyRes.json();
    const count = data.count || 0;
    const results = data.results || [];
    
    if (offset === 0) {
      await db.execute("INSERT INTO keywords (keyword, total_results, last_scanned, is_tracked) VALUES (?, ?, ?, 0) ON CONFLICT DO NOTHING", [keyword, count, mysqlDate()]);
      await db.execute("UPDATE keywords SET total_results = ?, last_scanned = ? WHERE keyword = ?", [count, mysqlDate(), keyword]);
    }
    
    const parsedResults = [];
    for (const item of results) {
      const l_id = String(item.listing_id);
      let img_url = "";
      const img_data = item.images || item.Images || [];
      if (img_data.length > 0) img_url = img_data[0].url_570xN || img_data[0].url_fullxfull || "";
      
      if (!img_url) {
        const [dbImg] = await db.execute("SELECT image_url FROM listings WHERE listing_id = ?", [l_id]);
        if (dbImg.length > 0 && dbImg[0].image_url) img_url = dbImg[0].image_url;
      }
      
      const shop_data = item.shop || item.Shop || {};
      const s_id = String(shop_data.shop_id || "");
      const shop_name = shop_data.shop_name || "";
      const icon_url = shop_data.icon_url_fullxfull || "";
      
      const p_data = item.price || {};
      const price_val = p_data ? (parseFloat(p_data.amount || 0) / parseFloat(p_data.divisor || 1)) : 0.0;
      
      await db.execute("INSERT INTO shops (shop_id, shop_name, icon_url) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", [s_id, shop_name, icon_url]);
      await db.execute("UPDATE shops SET shop_name = ?, icon_url = ? WHERE shop_id = ?", [shop_name, icon_url, s_id]);
      
      const now = mysqlDate();
      const [trackRows] = await db.execute("SELECT is_tracked FROM listings WHERE listing_id = ?", [l_id]);
      const current_is_tracked = trackRows.length > 0 ? trackRows[0].is_tracked : 0;
      
      await db.execute(`
        INSERT INTO listings 
        (listing_id, shop_id, title, url, price, currency_code, views, num_favorers, quantity, tags, materials, image_url, last_scan, is_tracked) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (listing_id) DO UPDATE SET shop_id=EXCLUDED.shop_id, title=EXCLUDED.title, url=EXCLUDED.url, price=EXCLUDED.price, currency_code=EXCLUDED.currency_code, views=EXCLUDED.views, num_favorers=EXCLUDED.num_favorers, quantity=EXCLUDED.quantity, tags=EXCLUDED.tags, materials=EXCLUDED.materials, image_url=EXCLUDED.image_url, last_scan=EXCLUDED.last_scan, is_tracked=EXCLUDED.is_tracked
      `, [
        l_id, s_id, item.title, item.url, price_val, p_data.currency_code, 
        item.views, item.num_favorers, item.quantity, 
        JSON.stringify(item.tags || []), JSON.stringify(item.materials || []), img_url, 
        now, current_is_tracked
      ]);
      
      await db.execute("INSERT INTO snapshots (target_id, target_type, views, favorites, quantity, price, capture_time) VALUES (?, 'listing', ?, ?, ?, ?, ?)", [
        l_id, item.views, item.num_favorers, item.quantity, price_val, now
      ]);
      
      parsedResults.push({
        listing_id: l_id, title: item.title, shop_name: shop_name, price: price_val,
        currency: p_data.currency_code, views: item.views, favorites: item.num_favorers,
        img_url: img_url, image: img_url, image_url: img_url, is_tracked: 0
      });
    }
    
    const finalResponse = { keyword, total_count: count, offset, listings: parsedResults };
    await db.execute("INSERT INTO full_json_cache (target_id, target_type, data, last_updated) VALUES (?, 'keyword', ?, ?) ON CONFLICT (target_id) DO UPDATE SET target_type = EXCLUDED.target_type, data = EXCLUDED.data, last_updated = EXCLUDED.last_updated", [
      cacheKey, JSON.stringify(finalResponse), mysqlDate()
    ]);
    
    finalResponse.listings = await injectTrackingStatusToListings(finalResponse.listings, req.user.id);
    const [kRow2] = await db.execute("SELECT keyword FROM user_tracked_keywords WHERE user_id = ? AND keyword = ?", [req.user.id, keyword]);
    finalResponse.is_tracked = kRow2.length > 0 ? 1 : 0;
    await db.execute("INSERT INTO user_history_keywords (user_id, keyword, last_viewed) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (user_id, keyword) DO UPDATE SET last_viewed = CURRENT_TIMESTAMP", [req.user.id, keyword]);
    
    res.json(finalResponse);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/shop/:shop_id", authenticateToken, checkAnalysisLimit, async (req, res) => {
  try {
    const shopId = req.params.shop_id;
    const forceRefresh = req.query.force_refresh === 'true';
    const [cached] = await db.execute("SELECT data FROM full_json_cache WHERE target_id = ? AND target_type = 'shop'", [shopId]);
    
    if (cached.length > 0 && !forceRefresh) {
      let cachedRes = JSON.parse(cached[0].data);
      const [history] = await db.execute("SELECT capture_time, transaction_sold_count FROM snapshots WHERE target_id = ? AND target_type = 'shop' ORDER BY capture_time DESC", [shopId]);
      cachedRes.history = history;
      cachedRes.listings = await injectTrackingStatusToListings(cachedRes.listings || [], req.user.id);
      const [sRow] = await db.execute("SELECT shop_id FROM user_tracked_shops WHERE user_id = ? AND shop_id = ?", [req.user.id, shopId]);
      if(cachedRes.shop) cachedRes.shop.is_tracked = sRow.length > 0 ? 1 : 0;
      await db.execute("INSERT INTO user_history_shops (user_id, shop_id, last_viewed) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (user_id, shop_id) DO UPDATE SET last_viewed = CURRENT_TIMESTAMP", [req.user.id, shopId]);
      return res.json(cachedRes);
    }
    
    const authString = `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`;
    const shopRes = await fetch(`${BASE_URL}/shops/${shopId}`, { headers: { "x-api-key": authString } });
    if (!shopRes.ok) return res.json({ ERROR: { http_error: shopRes.status, msg: await shopRes.text() } });
    
    const shopCore = await shopRes.json();
    const iconUrl = shopCore.icon_url_fullxfull || "";
    
    await db.execute("INSERT INTO shops (shop_id, shop_name, icon_url, is_tracked) VALUES (?, ?, ?, 0) ON CONFLICT DO NOTHING", [shopId, shopCore.shop_name, iconUrl]);
    await db.execute("UPDATE shops SET shop_name = ?, icon_url = ? WHERE shop_id = ?", [shopCore.shop_name, iconUrl, shopId]);
    
    const listingsRes = await fetch(`${BASE_URL}/shops/${shopId}/listings/active?limit=50&includes=Images`, { headers: { "x-api-key": authString } });
    const rawListings = listingsRes.ok ? (await listingsRes.json()).results || [] : [];
    
    const parsedShopListings = [];
    
    for (const item of rawListings) {
      const l_id = String(item.listing_id);
      let img_url = "";
      const img_data = item.images || item.Images || [];
      if (img_data.length > 0) img_url = img_data[0].url_570xN || img_data[0].url_fullxfull || "";
      
      const p_data = item.price || {};
      const price_val = p_data ? (parseFloat(p_data.amount || 0) / parseFloat(p_data.divisor || 1)) : 0.0;
      
      await db.execute(`
        INSERT INTO listings (listing_id, shop_id, title, price, currency_code, views, num_favorers, quantity, image_url, is_tracked) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT DO NOTHING
      `, [l_id, shopId, item.title, price_val, p_data.currency_code, item.views, item.num_favorers, item.quantity, img_url]);
      
      parsedShopListings.push({
        listing_id: l_id, title: item.title, views: item.views, num_favorers: item.num_favorers, quantity: item.quantity,
        price: price_val, currency_code: p_data.currency_code || "USD", img_url, image: img_url, image_url: img_url, is_tracked: 0
      });
    }
    
    await db.execute("INSERT INTO snapshots (target_id, target_type, transaction_sold_count, capture_time) VALUES (?, 'shop', ?, ?)", [
      shopId, shopCore.transaction_sold_count || 0, mysqlDate()
    ]);
    
    const [history] = await db.execute("SELECT capture_time, transaction_sold_count FROM snapshots WHERE target_id = ? AND target_type = 'shop' ORDER BY capture_time DESC", [shopId]);
    const finalResponse = { shop: shopCore, listings: parsedShopListings, history };
    
    await db.execute("INSERT INTO full_json_cache (target_id, target_type, data, last_updated) VALUES (?, 'shop', ?, ?) ON CONFLICT (target_id) DO UPDATE SET target_type = EXCLUDED.target_type, data = EXCLUDED.data, last_updated = EXCLUDED.last_updated", [
      shopId, JSON.stringify(finalResponse), mysqlDate()
    ]);
    
    finalResponse.listings = await injectTrackingStatusToListings(finalResponse.listings, req.user.id);
    const [sRow2] = await db.execute("SELECT shop_id FROM user_tracked_shops WHERE user_id = ? AND shop_id = ?", [req.user.id, shopId]);
    finalResponse.shop.is_tracked = sRow2.length > 0 ? 1 : 0;
    await db.execute("INSERT INTO user_history_shops (user_id, shop_id, last_viewed) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (user_id, shop_id) DO UPDATE SET last_viewed = CURRENT_TIMESTAMP", [req.user.id, shopId]);
    
    res.json(finalResponse);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/listing/:listing_id", authenticateToken, checkAnalysisLimit, async (req, res) => {
  try {
    const listingId = req.params.listing_id;
    const forceRefresh = req.query.force_refresh === 'true';
    const [cached] = await db.execute("SELECT data FROM full_json_cache WHERE target_id = ? AND target_type = 'listing'", [listingId]);
    
    if (cached.length > 0 && !forceRefresh) {
      let cachedRes = JSON.parse(cached[0].data);
      const [history] = await db.execute("SELECT capture_time, views, favorites, quantity, price, last_modified_timestamp FROM snapshots WHERE target_id = ? AND target_type = 'listing' ORDER BY capture_time DESC", [listingId]);
      cachedRes.history = history;
      const [lRow] = await db.execute("SELECT is_tracked FROM listings WHERE listing_id = ?", [listingId]);
      if (cachedRes.listing) cachedRes.listing.is_tracked = lRow.length > 0 ? lRow[0].is_tracked : 0;
      return res.json(cachedRes);
    }
    
    const authString = `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`;
    const coreRes = await fetch(`${BASE_URL}/listings/${listingId}?includes=Images,Shop,Videos,Inventory`, { headers: { "x-api-key": authString } });
    if (!coreRes.ok) return res.json({ ERROR: { http_error: coreRes.status, msg: await coreRes.text() } });
    const core = await coreRes.json();
    
    const reviewsRes = await fetch(`${BASE_URL}/listings/${listingId}/reviews`, { headers: { "x-api-key": authString } });
    const reviews = reviewsRes.ok ? await reviewsRes.json() : {};
    
    const p_data = core.price || {};
    const price_val = p_data ? (parseFloat(p_data.amount || 0) / parseFloat(p_data.divisor || 1)) : 0.0;
    const original_price_val = p_data.on_sale ? (parseFloat(p_data.original_amount || 0) / parseFloat(p_data.divisor || 1)) : null;
    const badges_json = JSON.stringify(core.badges || []);
    const now = mysqlDate();
    
    const [snapResult] = await db.execute(`
      INSERT INTO snapshots (target_id, target_type, views, favorites, quantity, price, original_price, badges_json, last_modified_timestamp, capture_time) 
      VALUES (?, 'listing', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [listingId, core.views, core.num_favorers, core.quantity, price_val, original_price_val, badges_json, core.last_modified_timestamp, now]);
    
    const snapshotId = snapResult.insertId;
    
    const inventory = core.inventory || {};
    if (inventory.products) {
      for (const product of inventory.products) {
        const offering = product.offerings ? product.offerings[0] : {};
        const var_price_data = offering.price || {};
        const var_price = var_price_data ? (parseFloat(var_price_data.amount || 0) / parseFloat(var_price_data.divisor || 1)) : 0.0;
        await db.execute("INSERT INTO variation_snapshots (snapshot_id, sku, property_values_json, price, quantity) VALUES (?, ?, ?, ?, ?)", [
          snapshotId, product.sku, JSON.stringify(product.property_values || []), var_price, offering.quantity
        ]);
      }
    }
    
    const [history] = await db.execute("SELECT capture_time, views, favorites, quantity, price, last_modified_timestamp FROM snapshots WHERE target_id = ? AND target_type = 'listing' ORDER BY capture_time DESC", [listingId]);
    
    const finalResponse = {
      listing: core,
      reviews: reviews.results || [],
      history,
      price: price_val
    };
    
    await db.execute("INSERT INTO full_json_cache (target_id, target_type, data, last_updated) VALUES (?, 'listing', ?, ?) ON CONFLICT (target_id) DO UPDATE SET target_type = EXCLUDED.target_type, data = EXCLUDED.data, last_updated = EXCLUDED.last_updated", [
      listingId, JSON.stringify(finalResponse), now
    ]);
    
    const [lRow2] = await db.execute("SELECT listing_id FROM user_tracked_listings WHERE user_id = ? AND listing_id = ?", [req.user.id, listingId]);
    finalResponse.listing.is_tracked = lRow2.length > 0 ? 1 : 0;
    await db.execute("INSERT INTO user_history_listings (user_id, listing_id, last_viewed) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (user_id, listing_id) DO UPDATE SET last_viewed = CURRENT_TIMESTAMP", [req.user.id, listingId]);
    
    res.json(finalResponse);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/toggle-follow/:target_type/:target_id", authenticateToken, async (req, res) => {
  try {
    const { target_type, target_id } = req.params;
    let table = "", id_col = "";
    if (target_type === "listing") { table = "user_tracked_listings"; id_col = "listing_id"; }
    else if (target_type === "shop") { table = "user_tracked_shops"; id_col = "shop_id"; }
    else if (target_type === "keyword") { table = "user_tracked_keywords"; id_col = "keyword"; }
    else return res.json({ status: "error", message: "Invalid target type" });

    const [row] = await db.execute(`SELECT * FROM ${table} WHERE user_id = ? AND ${id_col} = ?`, [req.user.id, target_id]);
    
    if (row.length === 0) {
      await db.execute(`INSERT INTO ${table} (user_id, ${id_col}) VALUES (?, ?)`, [req.user.id, target_id]);
      if (target_type === "shop") {
        const authString = `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`;
        const resApi = await fetch(`${BASE_URL}/shops/${target_id}`, { headers: { "x-api-key": authString } });
        if (resApi.ok) {
          const data = await resApi.json();
          await db.execute("INSERT INTO shops (shop_id, shop_name, icon_url) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", [target_id, data.shop_name || "", data.icon_url_fullxfull || ""]);
        }
      } else if (target_type === "keyword") {
        await db.execute("INSERT INTO keywords (keyword) VALUES (?) ON CONFLICT DO NOTHING", [target_id]);
      } else if (target_type === "listing") {
        const authString = `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`;
        const resApi = await fetch(`${BASE_URL}/listings/${target_id}?includes=Images`, { headers: { "x-api-key": authString } });
        if (resApi.ok) {
          const data = await resApi.json();
          const img = (data.images && data.images[0]) ? (data.images[0].url_570xN || data.images[0].url_fullxfull || "") : "";
          await db.execute("INSERT INTO listings (listing_id, image_url) VALUES (?, ?) ON CONFLICT DO NOTHING", [target_id, img]);
        }
      }
    } else {
      await db.execute(`DELETE FROM ${table} WHERE user_id = ? AND ${id_col} = ?`, [req.user.id, target_id]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.get("/favorites/:target_type", authenticateToken, async (req, res) => {
  try {
    const { target_type } = req.params;
    let results = [];
    if (target_type === "listings") {
      const [rows] = await db.execute(`
        SELECT l.listing_id, l.title, l.price, l.currency_code, l.image_url as image, s.shop_name 
        FROM user_tracked_listings utl 
        JOIN listings l ON utl.listing_id = l.listing_id 
        LEFT JOIN shops s ON l.shop_id = s.shop_id 
        WHERE utl.user_id = ?
      `, [req.user.id]);
      results = rows;
    } else if (target_type === "shops") {
      const [rows] = await db.execute(`
        SELECT s.shop_id, s.shop_name, s.icon_url, s.transaction_sold_count, s.listing_active_count 
        FROM user_tracked_shops uts 
        JOIN shops s ON uts.shop_id = s.shop_id 
        WHERE uts.user_id = ?
      `, [req.user.id]);
      results = rows;
    } else if (target_type === "keywords") {
      const [rows] = await db.execute(`
        SELECT k.keyword, k.total_results, k.last_scanned 
        FROM user_tracked_keywords utk 
        JOIN keywords k ON utk.keyword = k.keyword 
        WHERE utk.user_id = ?
      `, [req.user.id]);
      results = rows;
    }
    res.json(results);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/history/:target_type", authenticateToken, async (req, res) => {
  try {
    const { target_type } = req.params;
    let results = [];
    if (target_type === "listings") {
      const [rows] = await db.execute(`
        SELECT l.listing_id, l.title, l.price, l.currency_code, l.image_url as image, s.shop_name, 
        CASE WHEN utl.listing_id IS NOT NULL THEN 1 ELSE 0 END as is_tracked
        FROM user_history_listings uhl
        JOIN listings l ON uhl.listing_id = l.listing_id
        LEFT JOIN shops s ON l.shop_id = s.shop_id 
        LEFT JOIN user_tracked_listings utl ON utl.listing_id = l.listing_id AND utl.user_id = ?
        WHERE uhl.user_id = ?
        ORDER BY uhl.last_viewed DESC LIMIT 500
      `, [req.user.id, req.user.id]);
      results = rows.map(r => ({ ...r, is_tracked: !!r.is_tracked }));
    } else if (target_type === "shops") {
      const [rows] = await db.execute(`
        SELECT s.shop_id, s.shop_name, s.icon_url, s.transaction_sold_count, 
        CASE WHEN uts.shop_id IS NOT NULL THEN 1 ELSE 0 END as is_tracked
        FROM user_history_shops uhs
        JOIN shops s ON uhs.shop_id = s.shop_id
        LEFT JOIN user_tracked_shops uts ON uts.shop_id = s.shop_id AND uts.user_id = ?
        WHERE uhs.user_id = ?
        ORDER BY uhs.last_viewed DESC LIMIT 500
      `, [req.user.id, req.user.id]);
      results = rows.map(r => ({ ...r, is_tracked: !!r.is_tracked }));
    } else if (target_type === "keywords") {
      const [rows] = await db.execute(`
        SELECT k.keyword, k.total_results, k.last_scanned, 
        CASE WHEN utk.keyword IS NOT NULL THEN 1 ELSE 0 END as is_tracked
        FROM user_history_keywords uhk
        JOIN keywords k ON uhk.keyword = k.keyword
        LEFT JOIN user_tracked_keywords utk ON utk.keyword = k.keyword AND utk.user_id = ?
        WHERE uhk.user_id = ?
        ORDER BY uhk.last_viewed DESC LIMIT 500
      `, [req.user.id, req.user.id]);
      results = rows.map(r => ({ ...r, is_tracked: !!r.is_tracked }));
    }
    res.json(results);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/me/shops/:connection_id", authenticateToken, async (req, res) => {
  try {
    const [result] = await db.execute("DELETE FROM etsy_connections WHERE id = ? AND user_id = ?", [req.params.connection_id, req.user.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Not found or not authorized" });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



export default app;

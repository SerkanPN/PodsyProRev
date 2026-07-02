import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'trend_savvy'
  });

  try {
    await db.execute("ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE");
    console.log("Added email");
  } catch (e) { console.log(e.message); }

  try {
    await db.execute("ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE");
    console.log("Added google_id");
  } catch (e) { console.log(e.message); }

  try {
    await db.execute("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)");
    console.log("Added avatar_url");
  } catch (e) { console.log(e.message); }

  await db.end();
}

migrate();

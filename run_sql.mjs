import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://postgres:K.Srikar%4010@db.wrsbebgcsllwhvlvrftn.supabase.co:5432/postgres",
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to database!");

    const sqlFiles = [
      "c:\\Users\\Admin\\OneDrive\\Desktop\\corhaus2\\supabase\\migrations\\005_approved_members.sql",
      "c:\\Users\\Admin\\OneDrive\\Desktop\\corhaus2\\supabase\\migrations\\007_forgot_password.sql"
    ];

    for (const file of sqlFiles) {
      if (fs.existsSync(file)) {
        console.log(`Running ${file}...`);
        const sql = fs.readFileSync(file, 'utf8');
        await client.query(sql);
        console.log(`Successfully executed ${file}`);
      }
    }
    
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("Schema reloaded!");
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

run();

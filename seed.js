const fs = require('fs');
const path = require('path');
const { initDB } = require('./database');


async function seed() {
    const { v7: uuidv7 } = await import('uuid');
    const db = await initDB();
    const dataPath = path.join(__dirname, 'seed_profiles.json');
    if (!fs.existsSync(dataPath)) {
        console.error('Seed file not found.');
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const profiles = data.profiles;
    
    let count = 0;
    for (const p of profiles) {
        const id = uuidv7();
        const created_at = new Date().toISOString();
        try {
            await db.run(
                `INSERT INTO profiles 
                 (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(name) DO UPDATE SET
                    gender=excluded.gender,
                    gender_probability=excluded.gender_probability,
                    age=excluded.age,
                    age_group=excluded.age_group,
                    country_id=excluded.country_id,
                    country_name=excluded.country_name,
                    country_probability=excluded.country_probability`,
                [id, p.name, p.gender, p.gender_probability, p.age, p.age_group, p.country_id, p.country_name, p.country_probability, created_at]
            );
            count++;
        } catch (e) {
            console.error("Error inserting profile:", p.name, e);
        }
    }
    console.log(`Seeded ${count} profiles.`);
}

seed().catch(console.error);

const express = require('express');
const path = require('path');
const cors = require('cors');
const nunjucks = require('nunjucks');
const sqlite3 = require('sqlite3').verbose();

const app = express();

let db;
try {
    db = new sqlite3.Database('availability.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
            console.error('❌ Failed to connect to SQLite database:', err.message);
            process.exit(1);
        }
        console.log('✅ Connected to SQLite database.');
    });
} catch (error) {
    console.error('❌ Critical database error:', error);
    process.exit(1);
}

async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            try {
                // Create tables if they don’t exist
                db.run(`CREATE TABLE IF NOT EXISTS availability (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL,
                    date TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    locations TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    matched INTEGER DEFAULT 0,
                    matching_preference TEXT DEFAULT 'all',
                    opt_out_1to1 INTEGER DEFAULT 0,
                    opt_out_repeat INTEGER DEFAULT 0,
                    opt_out_same_school INTEGER DEFAULT 0,
                    only_match_same_school INTEGER DEFAULT 0,
                    experiences TEXT,
                    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) console.error('❌ Error creating availability table:', err);
                });

                db.run(`CREATE TABLE IF NOT EXISTS matches (
                    group_id TEXT NOT NULL,
                    email TEXT NOT NULL,
                    date TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    locations TEXT NOT NULL
                )`, (err) => {
                    if (err) console.error('❌ Error creating matches table:', err);
                });

                db.run(`CREATE TABLE IF NOT EXISTS incomplete_users (
                    email TEXT PRIMARY KEY,
                    last_input DATETIME DEFAULT CURRENT_TIMESTAMP,
                    unsubscribed INTEGER DEFAULT 0
                )`, (err) => {
                    if (err) console.error('❌ Error creating incomplete_users table:', err);
                });

                // Check if last_activity exists, add it if not
                db.all(`PRAGMA table_info(availability)`, (err, columns) => {
                    if (err) {
                        console.error('❌ Error checking table schema:', err);
                        reject(err);
                        return;
                    }
                    const hasLastActivity = columns.some(col => col.name === 'last_activity');
                    if (!hasLastActivity) {
                        db.run(`ALTER TABLE availability ADD COLUMN last_activity DATETIME DEFAULT CURRENT_TIMESTAMP`, (alterErr) => {
                            if (alterErr) {
                                console.error('❌ Failed to add last_activity column:', alterErr);
                                reject(alterErr);
                            } else {
                                console.log('✅ Added last_activity column to availability table.');
                                resolve();
                            }
                        });
                    } else {
                        console.log('✅ last_activity column already exists.');
                        resolve();
                    }
                });
            } catch (error) {
                console.error('❌ Database initialization error:', error);
                reject(error);
            }
        });
    });
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

nunjucks.configure('templates', {
    autoescape: true,
    express: app
});
app.set('view engine', 'html');

app.use((req, res, next) => {
    console.log(`🔎 ${req.method} request to ${req.url}`);
    next();
});

app.get('/', (req, res) => res.render('index.html'));

app.get('/admin', async (req, res) => {
    try {
        db.all("SELECT * FROM availability ORDER BY created_at DESC", [], (err, rows) => {
            if (err) {
                console.error("❌ Database error fetching submissions:", err);
                return res.status(500).send("Database error occurred");
            }
            res.render('admin.html', { submissions: rows });
        });
    } catch (error) {
        console.error("❌ Admin route error:", error);
        res.status(500).send("Internal server error");
    }
});

app.post('/api/store-email', async (req, res) => {
    const { email } = req.body;
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.edu$/)) {
        return res.status(400).json({ success: false, message: 'Invalid .edu email' });
    }

    try {
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO incomplete_users (email, last_input, unsubscribed) 
                 VALUES (?, datetime('now'), (SELECT unsubscribed FROM incomplete_users WHERE email = ?))`,
                [email, email],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error storing email:', error);
        res.status(500).json({ success: false, message: 'Failed to store email' });
    }
});

app.post('/api/submit-availability', async (req, res) => {
    const { 
        email, 
        slots, 
        optOut1to1 = false, 
        optOutRepeat = false, 
        optOutSameSchool = false, 
        onlyMatchSameSchool = false, 
        experiences = [], 
        matchingPreference = 'all' 
    } = req.body;

    if (!email || !slots || !Array.isArray(slots) || slots.length === 0) {
        console.error("❌ Invalid submission data:", req.body);
        return res.status(400).json({ success: false, message: 'Invalid submission data' });
    }

    try {
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION', (err) => {
                    if (err) reject(err);
                });

                for (const slot of slots) {
                    const { date, startTime, endTime, locations } = slot;
                    const today = new Date().toISOString().split('T')[0];
                    if (date < today) {
                        console.error(`❌ Invalid date: ${date}`);
                        reject(new Error("Cannot submit availability for past dates."));
                        return;
                    }

                    const locationsString = Array.isArray(locations) ? locations.join(', ') : locations;
                    const experiencesString = Array.isArray(experiences) ? experiences.join(', ') : '';

                    db.run(`
                        INSERT INTO availability (
                            email, date, start_time, end_time, locations, 
                            matching_preference, opt_out_1to1, opt_out_repeat, 
                            opt_out_same_school, only_match_same_school, experiences,
                            last_activity
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    `, [
                        email, date, startTime, endTime, locationsString,
                        matchingPreference,
                        optOut1to1 ? 1 : 0,
                        optOutRepeat ? 1 : 0,
                        optOutSameSchool ? 1 : 0,
                        onlyMatchSameSchool ? 1 : 0,
                        experiencesString
                    ], (err) => {
                        if (err) reject(err);
                    });
                }

                db.run(`DELETE FROM incomplete_users WHERE email = ?`, [email], (err) => {
                    if (err) reject(err);
                });

                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });

        res.json({ success: true, message: "Availability submitted successfully!" });
    } catch (error) {
        console.error("❌ Database error:", error);
        db.run('ROLLBACK', (err) => {
            if (err) console.error('❌ Rollback failed:', err);
        });
        res.status(500).json({ success: false, message: error.message || 'Database error occurred' });
    }
});

app.get('/api/default-availability', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const rows = await new Promise((resolve, reject) => {
            db.all(`
                SELECT date, start_time, end_time, COUNT(*) as frequency 
                FROM availability 
                WHERE matched = 0 AND date > ? 
                GROUP BY date, start_time, end_time 
                ORDER BY frequency DESC, date ASC, start_time ASC 
                LIMIT 1
            `, [today], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (rows.length > 0) {
            const { date, start_time, end_time } = rows[0];
            res.json({ date, startTime: start_time, endTime: end_time });
        } else {
            const nextDay = new Date();
            nextDay.setDate(nextDay.getDate() + 1);
            const defaultDate = nextDay.toISOString().split('T')[0];
            res.json({ date: defaultDate, startTime: '12:00', endTime: '15:00' });
        }
    } catch (error) {
        console.error('❌ Error fetching default availability:', error);
        res.status(500).json({ error: 'Failed to fetch default availability' });
    }
});

app.get('/api/slot-stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const rows = await new Promise((resolve, reject) => {
            db.all(`
                SELECT date, start_time, end_time, COUNT(*) as user_count,
                       GROUP_CONCAT(DISTINCT SUBSTR(email, INSTR(email, '@') + 1, LENGTH(email))) as domains
                FROM availability 
                WHERE matched = 0 AND date >= ?
                GROUP BY date, start_time, end_time
            `, [today], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(rows);
    } catch (error) {
        console.error('❌ Error fetching slot stats:', error);
        res.status(500).json({ error: 'Failed to fetch slot stats' });
    }
});

app.get('/unsubscribe', async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).send('Email is required');
    }

    try {
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE incomplete_users SET unsubscribed = 1 WHERE email = ?`,
                [email],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        res.send('You have been unsubscribed from Crimson Meet reminders.');
    } catch (error) {
        console.error('❌ Error unsubscribing:', error);
        res.status(500).send('Failed to unsubscribe');
    }
});

async function startServer() {
    try {
        await initializeDatabase();
        const PORT = 5500;
        app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
}

startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('Closing database connection...');
    db.close(() => {
        console.log('Database connection closed.');
        process.exit(0);
    });
});
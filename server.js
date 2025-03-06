const express = require('express');
const path = require('path');
const cors = require('cors');
const nunjucks = require('nunjucks');
const sqlite3 = require('sqlite3').verbose();

const app = express();

// Wrap database connection in try-catch
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

// Database initialization function
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            try {
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
                    experiences TEXT
                )`);

                db.run(`CREATE TABLE IF NOT EXISTS matches (
                    group_id TEXT NOT NULL,
                    email TEXT NOT NULL,
                    date TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    locations TEXT NOT NULL
                )`);

                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
}

// Express middleware setup
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Nunjucks setup
nunjucks.configure('templates', {
    autoescape: true,
    express: app
});
app.set('view engine', 'html');

// Debug middleware
app.use((req, res, next) => {
    console.log(`🔎 ${req.method} request to ${req.url}`);
    next();
});

// Routes
app.get('/', (req, res) => res.render('index.html'));

// Admin Dashboard Route
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

// Submit availability route
app.post('/api/submit-availability', async (req, res) => {
    console.log("📥 Received data:", req.body);

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
                db.run('BEGIN TRANSACTION');

                for (const slot of slots) {
                    const { date, startTime, endTime, locations } = slot;
                    
                    // ✅ Prevent past dates in JavaScript
                    const today = new Date().toISOString().split('T')[0];
                    if (date < today) {
                        console.error(`❌ Invalid date: ${date} (Cannot be in the past)`);
                        reject(new Error("Cannot submit availability for past dates."));
                        return;
                    }

                    const locationsString = Array.isArray(locations) ? locations.join(', ') : locations;
                    const experiencesString = Array.isArray(experiences) ? experiences.join(', ') : '';

                    db.run(`
                        INSERT INTO availability (
                            email, date, start_time, end_time, locations, 
                            matching_preference, opt_out_1to1, opt_out_repeat, 
                            opt_out_same_school, only_match_same_school, experiences
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });

        res.json({ success: true, message: "Availability submitted successfully!" });
    } catch (error) {
        console.error("❌ Database error:", error);
        db.run('ROLLBACK');
        res.status(500).json({ success: false, message: error.message || 'Database error occurred' });
    }
});

// New endpoint to get default availability
app.get('/api/default-availability', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Query unmatched future entries, ordered by date and frequency
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
            // If no unmatched entries, set default to next day at 12:00–15:00
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

// Initialize database and start server
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

// Start the server
startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Closing database connection...');
    db.close(() => {
        console.log('Database connection closed.');
        process.exit(0);
    });
});
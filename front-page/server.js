const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database(':memory:');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // Serve static files from the current directory

// Set up database
db.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    availability TEXT NOT NULL
)`);

// Route to serve the front-page.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'front-page.html'));
});

// Route to handle form submission
app.post('/submit', (req, res) => {
    const email = req.body.email;
    const availability = JSON.stringify(req.body.availability);

    try {
        const stmt = db.prepare(`INSERT INTO users (email, availability) VALUES (?, ?)`);
        stmt.run(email, availability);
        console.log(`Inserted: ${email}, ${availability}`); // Log inserted data
        res.send('Availability submitted successfully!');
    } catch (err) {
        console.error(err);
        res.status(400).send('Error: User already exists or invalid input.');
    }
});

// Route to fetch all submitted user data and display in HTML
app.get('/users', (req, res) => {
    try {
        const rows = db.prepare(`SELECT * FROM users`).all();
        console.log(`Retrieved: ${JSON.stringify(rows)}`); // Log retrieved data
        let html = '<h1>Submitted Users</h1><table border="1"><tr><th>Email</th><th>Availability</th></tr>';
        rows.forEach(row => {
            html += `<tr><td>${row.email}</td><td>${row.availability}</td></tr>`;
        });
        html += '</table>';
        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching users.');
    }
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
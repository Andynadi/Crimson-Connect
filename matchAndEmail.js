require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const db = new sqlite3.Database('availability.db');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

function hasExperienceOverlap(exp1, exp2) {
    return exp1.split(',').some(experience => exp2.split(',').includes(experience));
}

async function sendEmail(emails, date, time, locations) {
    const validEmails = emails.filter(email => email.includes('@'));
    if (validEmails.length === 0) {
        console.error('❌ No valid recipients found. Skipping email.');
        return;
    }

    console.log(`📨 Preparing email for: ${validEmails.join(', ')}`);
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: validEmails.join(', '),
        subject: "We've found you new potential friends to meet!",
        html: `
            <h2 style="color: #c41e3a;">🎉 We’ve found you new potential friends to meet!</h2>
            <p>Exciting news! Based on your availability and location preferences, we've matched you with a small group of fellow students for a meetup.</p>
            <h3 style="color: #333;">📅 Meetup Details:</h3>
            <ul>
                <li><strong>Date:</strong> ${date}</li>
                <li><strong>Time:</strong> ${time}</li>
                <li><strong>Location:</strong> ${locations}</li>
            </ul>
            <p>Please connect with each other via email to agree on the meetup venue. Here are few ideas to consider:</p>
            <ul>
                <li>Harvard Smith Center at 1350 Massachusetts Ave, Cambridge, MA 02138</li>
                <li>100 Main Marketplace at Sloan School of Management (E62) 100 Main Street Cambridge, MA 02139</li>
                <li>Harvard Museum of Natural History, at 26 Oxford St Cambridge, MA 02138</li>
                <li>Harvard Art Museums, at 32 Quincy Street Cambridge, MA 02138</li>
                <li>Cafeterias or student lounges of your school</li>
            </ul>
            <p>Please look up opening hours, ID requirements and fee/price related information before deciding on the meetup venue</p>
            <h3 style="color: #333;">💡 Conversation Starters:</h3>
            <p>To make your meetup more engaging, here are some icebreakers to kick things off:</p>
            <ul>
                <li>🔹 Which school/program are you in, and what drew you to it?</li>
                <li>🔹 Where are you from, and what’s something unique about your hometown?</li>
                <li>🔹 What’s a passion project you’ve been working on lately?</li>
                <li>🔹 What are some hobbies or activities that you really enjoy?</li>
                <li>🔹 If you could live anywhere for a year, where would it be and why?</li>
            </ul>
            <p>These are just suggestions—feel free to make the conversation your own!</p>
            <p style="font-weight: bold;">Feel free to email us at hello@crimsonmeet.com and let us know how we can improve the platform to serve you better.</p>
            <p>Best regards,<br><strong>The CrimsonMeet Team</strong></p>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully:', info.response);
    } catch (err) {
        console.error('❌ Error sending email:', err);
    }
}

async function sendReminderEmail(email, type) {
    const subject = type === 'incomplete' 
        ? 'Finish Signing Up for Crimson Meet!' 
        : 'Come Back to Crimson Meet!';
    const message = type === 'incomplete' 
        ? `
            <h2 style="color: #c41e3a;">Hey there!</h2>
            <p>We noticed you started signing up for Crimson Meet but didn’t finish. We’d love to help you connect with fellow students for coffee chats and more!</p>
            <p><a href="http://localhost:5500/" style="color: #c41e3a; font-weight: bold;">Click here to complete your sign-up</a> and start meeting new people.</p>
        `
        : `
            <h2 style="color: #c41e3a;">Hey, we miss you!</h2>
            <p>It’s been a while since you last used Crimson Meet. Why not schedule another meetup and connect with more students?</p>
            <p><a href="http://localhost:5500/" style="color: #c41e3a; font-weight: bold;">Click here to add your availability</a> and get matched again!</p>
        `;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject,
        html: `
            ${message}
            <p style="font-size: 0.9em; color: #666;">Don’t want these reminders? 
            <a href="http://localhost:5500/unsubscribe?email=${encodeURIComponent(email)}" style="color: #c41e3a;">Unsubscribe here</a>.</p>
            <p>Best,<br><strong>The CrimsonMeet Team</strong></p>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Reminder sent to ${email}:`, info.response);
    } catch (err) {
        console.error(`❌ Error sending reminder to ${email}:`, err);
    }
}

function calculateOverlap(start1, end1, start2, end2) {
    try {
        const overlapStart = Math.max(
            new Date(`1970-01-01T${start1}:00.000Z`).getTime(), 
            new Date(`1970-01-01T${start2}:00.000Z`).getTime()
        );
        const overlapEnd = Math.min(
            new Date(`1970-01-01T${end1}:00.000Z`).getTime(), 
            new Date(`1970-01-01T${end2}:00.000Z`).getTime()
        );
        return Math.max(0, (overlapEnd - overlapStart) / (1000 * 60 * 60));
    } catch (error) {
        console.error(`❌ Error in calculateOverlap(): Invalid time values.`, start1, end1, start2, end2);
        return 0;
    }
}

function areLocationsCompatible(loc1, loc2) {
    const locArray1 = loc1.split(',').map(l => l.trim().toLowerCase());
    const locArray2 = loc2.split(',').map(l => l.trim().toLowerCase());
    return locArray1.some(location => locArray2.includes(location));
}

async function hasMatchedBefore(email1, email2) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) AS count FROM matches WHERE email = ? AND group_id IN 
             (SELECT group_id FROM matches WHERE email = ?)`,
            [email1, email2],
            (err, row) => {
                if (err) reject(err);
                else resolve(row.count > 0);
            }
        );
    });
}

function getEmailDomain(email) {
    return email.split('@')[1];
}

async function matchUsers() {
    console.log('🚀 Starting matching process:', new Date().toISOString());
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM availability 
                WHERE matched = 0 AND date >= date('now') 
                ORDER BY date, start_time, opt_out_1to1 DESC, opt_out_repeat DESC, opt_out_same_school DESC, only_match_same_school DESC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log(`🔎 Found ${rows.length} unmatched availability slots`);
        if (!rows.length) {
            console.log('ℹ️ No unmatched availability found.');
            return;
        }

        const groupedMatches = [];
        const usedEmails = new Set();

        for (const groupSize of [4, 3, 2]) {
            const availableUsers = rows.filter(user => !usedEmails.has(user.email));
            for (const anchor of availableUsers) {
                if (usedEmails.has(anchor.email)) continue;

                const potentialMatches = availableUsers.filter(other =>
                    !usedEmails.has(other.email) &&
                    other.email !== anchor.email &&
                    other.date === anchor.date &&
                    calculateOverlap(anchor.start_time, anchor.end_time, other.start_time, other.end_time) >= 0.50 &&
                    areLocationsCompatible(anchor.locations, other.locations) &&
                    (groupSize > 2 || (anchor.opt_out_1to1 === 0 && other.opt_out_1to1 === 0)) &&
                    (!anchor.opt_out_repeat || !hasMatchedBefore(anchor.email, other.email)) &&
                    (!anchor.opt_out_same_school || getEmailDomain(anchor.email) !== getEmailDomain(other.email)) &&
                    (!anchor.only_match_same_school || getEmailDomain(anchor.email) === getEmailDomain(other.email)) &&
                    hasExperienceOverlap(anchor.experiences, other.experiences)
                );

                if (potentialMatches.length >= groupSize - 1) {
                    const selectedMembers = potentialMatches.slice(0, groupSize - 1).concat(anchor);
                    const groupId = Date.now();
                    groupedMatches.push({ groupId, group: selectedMembers });
                    selectedMembers.forEach(member => usedEmails.add(member.email));
                    console.log(`✅ Group ${groupId} matched: ${selectedMembers.map(g => g.email).join(', ')}`);
                }
            }
        }

        if (!groupedMatches.length) {
            console.log('❌ No viable matches found.');
            return;
        }

        for (const { groupId, group } of groupedMatches) {
            const emails = group.map(g => g.email);
            await sendEmail(emails, group[0].date, `${group[0].start_time} - ${group[0].end_time}`, group[0].locations);
        }
    } catch (error) {
        console.error('❌ Error in matching process:', error);
    }
}

async function sendReminders() {
    console.log('📩 Starting reminder process:', new Date().toISOString());

    // Incomplete users (2 weeks)
    const incompleteUsers = await new Promise((resolve, reject) => {
        db.all(`
            SELECT email, last_input 
            FROM incomplete_users 
            WHERE unsubscribed = 0 AND 
                  last_input <= datetime('now', '-14 days')
        `, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    for (const user of incompleteUsers) {
        await sendReminderEmail(user.email, 'incomplete');
        db.run(`UPDATE incomplete_users SET last_input = datetime('now') WHERE email = ?`, [user.email]);
    }
    console.log(`📬 Sent reminders to ${incompleteUsers.length} incomplete users`);

    // Inactive submitted users (4 weeks)
    const inactiveUsers = await new Promise((resolve, reject) => {
        db.all(`
            SELECT DISTINCT email, last_activity 
            FROM availability 
            WHERE last_activity <= datetime('now', '-28 days')
        `, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    for (const user of inactiveUsers) {
        await sendReminderEmail(user.email, 'inactive');
        db.run(`UPDATE availability SET last_activity = datetime('now') WHERE email = ?`, [user.email]);
    }
    console.log(`📬 Sent reminders to ${inactiveUsers.length} inactive users`);
}

// Run matching and reminders every hour (adjust as needed)
setInterval(async () => {
    await matchUsers();
    await sendReminders();
}, 60 * 60 * 1000); // 1 hour

// Run once immediately
matchUsers().then(sendReminders);
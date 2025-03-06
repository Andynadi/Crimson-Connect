const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'mail.privateemail.com', // Namecheap's SMTP server
    port: 587, // Use port 587 for STARTTLS
    secure: false, // Use STARTTLS, not SSL
    auth: {
        user: 'hello@crimsonmeet.com', // Your Namecheap email
        pass: 'botn-eprr-vogz-csrk'    // Your app password
    }
});

// Verify the SMTP connection
transporter.verify((error, success) => {
    if (error) {
        console.error('SMTP Connection Error:', error);
    } else {
        console.log('SMTP Connection Successful!');
    }
});

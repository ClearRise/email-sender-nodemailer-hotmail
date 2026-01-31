#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

/**
 * Email sender using Hotmail/Outlook SMTP with OAuth2.
 * Setup: Run get-token.js, add OAUTH_REFRESH_TOKEN and OAuth credentials to .env
 * Usage: node email-sender.js
 */

const fs = require('fs');
const nodemailer = require('nodemailer');

const SCRIPT_DIR = __dirname;
const MESSAGE_FILE = path.join(SCRIPT_DIR, 'bid_text.txt');

function loadEmails() {
  const receiversDir = path.join(SCRIPT_DIR, 'receivers');
  const emailFile = path.join(receiversDir, 'email.txt');

  if (!fs.existsSync(emailFile)) {
    return [];
  }

  const content = fs.readFileSync(emailFile, 'utf-8');
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return [...new Set(lines)];
}

async function main() {
  const email = process.env.HOTMAIL_EMAIL || process.env.OUTLOOK_EMAIL;
  const refreshToken = process.env.OAUTH_REFRESH_TOKEN;
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const tenantId = process.env.OAUTH_TENANT_ID;

  if (!email) {
    console.error('Error: Set HOTMAIL_EMAIL in .env');
    process.exit(1);
  }

  if (!refreshToken || !clientId || !clientSecret || !tenantId) {
    console.error('Error: Set OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_TENANT_ID, OAUTH_REFRESH_TOKEN in .env');
    process.exit(1);
  }

  if (!fs.existsSync(MESSAGE_FILE)) {
    console.error(`Message file not found: ${MESSAGE_FILE}`);
    process.exit(1);
  }

  const content = fs.readFileSync(MESSAGE_FILE, 'utf-8');
  const lines = content.split(/\r?\n/);
  const subject = lines[0].trim();
  const body = lines.slice(1).join('\n').trim();

  const recipients = loadEmails();
  if (recipients.length === 0) {
    console.error('No emails found in receivers/email.txt');
    process.exit(1);
  }

  console.log(`Recipients: ${recipients.length}`);
  console.log(`Subject: ${subject}`);
  const transporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: {
      type: 'OAuth2',
      user: email,
      clientId,
      clientSecret,
      refreshToken,
      accessUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      customParams: { scope: 'offline_access https://outlook.office.com/SMTP.Send' },
    },
  });

  // Verify connection
  try {
    await transporter.verify();
    console.log('Connected to Outlook SMTP.');
  } catch (err) {
    console.error('SMTP connection failed:', err.message);
    console.error('Refresh token may be expired. Run get-token.js again.');
    process.exit(1);
  }

  let sent = 0;
  let failed = 0;

  for (const to of recipients) {
    try {
      await transporter.sendMail({
        from: `"${email.split('@')[0]}" <${email}>`,
        to,
        subject,
        text: body,
      });
      sent++;
      process.stdout.write(`\rSent: ${sent}/${recipients.length}`);
    } catch (err) {
      failed++;
      console.error(`\nFailed to send to ${to}:`, err.message);
    }
  }

  console.log(`\n\nDone. Sent: ${sent}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

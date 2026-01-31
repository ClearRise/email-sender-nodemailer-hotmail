#!/usr/bin/env node
const path = require('path');
const qs = require('querystring');
require('dotenv').config({ path: path.join(__dirname, '.env') });

/**
 * Email sender using Microsoft Graph API (bypasses SMTP - works when SMTP AUTH is disabled).
 * SMTP is disabled for many Outlook/Hotmail mailboxes; Graph sendMail does not use SMTP.
 * Setup: Add Mail.Send (Microsoft Graph, delegated) in Azure. Run get-token.js, add OAUTH_REFRESH_TOKEN to .env
 * Usage: node email-sender.js
 */

const fs = require('fs');
const axios = require('axios');

const SCRIPT_DIR = __dirname;
const MESSAGE_FILE = path.join(SCRIPT_DIR, 'bid_text.txt');

const GRAPH_SCOPE = 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read';

function getUserIdFromToken(accessToken) {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'));
    return payload.oid || payload.sub;
  } catch {
    return null;
  }
}

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

async function getAccessToken() {
  const refreshToken = process.env.OAUTH_REFRESH_TOKEN;
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const tenantId = process.env.OAUTH_TENANT_ID;

  const res = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    qs.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: GRAPH_SCOPE,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data.access_token;
}

async function sendViaGraph(accessToken, userId, to, subject, body) {
  const url = userId
    ? `https://graph.microsoft.com/v1.0/users/${userId}/sendMail`
    : 'https://graph.microsoft.com/v1.0/me/sendMail';

  await axios.post(
    url,
    {
      message: {
        subject,
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
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

  let accessToken;
  try {
    accessToken = await getAccessToken();
    console.log('Got access token. Sending via Graph API…');
  } catch (err) {
    console.error('Token refresh failed:', err.response?.data?.error_description || err.message);
    console.error('Run get-token.js again. Ensure Mail.Send (Microsoft Graph, delegated) is in Azure API permissions.');
    process.exit(1);
  }

  const userId = getUserIdFromToken(accessToken);

  let sent = 0;
  let failed = 0;

  for (const to of recipients) {
    try {
      await sendViaGraph(accessToken, userId, to, subject, body);
      sent++;
      process.stdout.write(`\rSent: ${sent}/${recipients.length}`);
    } catch (err) {
      failed++;
      const detail = err.response?.data?.error;
      const msg = detail?.message || detail?.code || err.message;
      console.error(`\nFailed to send to ${to}:`, msg);
      if (err.response?.status === 401 && err.response?.data) {
        console.error('  Graph 401 detail:', JSON.stringify(err.response.data, null, 2));
      }
    }
  }

  console.log(`\n\nDone. Sent: ${sent}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

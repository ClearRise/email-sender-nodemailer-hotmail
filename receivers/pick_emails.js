#!/usr/bin/env node
/**
 * Extract and separate emails from emails.txt into work emails and Gmail addresses.
 * Removes duplicates and saves to separate files.
 */

const fs = require('fs');
const path = require('path');

const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

function extractEmails(filepath) {
  const emails = new Set();
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    // Skip truncated emails (they contain "...")
    if (line.includes('...')) continue;

    const matches = line.matchAll(EMAIL_PATTERN);
    for (const match of matches) {
      emails.add(match[0].toLowerCase());
    }
  }

  return emails;
}

function main() {
  const scriptDir = __dirname;
  const inputFile = path.join(scriptDir, 'emails.txt');

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: ${inputFile} not found!`);
    process.exit(1);
  }

  console.log('Extracting emails...');
  const allEmails = extractEmails(inputFile);

  const gmails = [...allEmails]
    .filter((e) => e.endsWith('@gmail.com'))
    .sort();
  const workEmails = [...allEmails]
    .filter((e) => !e.endsWith('@gmail.com'))
    .sort();

  // Save Gmail addresses
  const gmailFile = path.join(scriptDir, 'gmail_emails.txt');
  fs.writeFileSync(gmailFile, gmails.join('\n'));
  console.log(`Saved ${gmails.length} unique Gmail addresses to gmail_emails.txt`);

  // Save work emails (non-Gmail)
  const workFile = path.join(scriptDir, 'work_emails.txt');
  fs.writeFileSync(workFile, workEmails.join('\n'));
  console.log(`Saved ${workEmails.length} unique work emails to work_emails.txt`);

  console.log(`\nTotal unique emails: ${allEmails.size}`);
  console.log(`  - Gmail: ${gmails.length}`);
  console.log(`  - Work (other domains): ${workEmails.length}`);
}

main();

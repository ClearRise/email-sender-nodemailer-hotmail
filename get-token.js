const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const open = require("open").default;
const http = require("http");
const axios = require("axios");
const qs = require("querystring");

const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const TENANT_ID = process.env.OAUTH_TENANT_ID;
// Use port 3000 by default (no admin needed). Add http://localhost:3000 as SPA redirect URI in Azure.
const PORT = parseInt(process.env.OAUTH_PORT || "3000", 10);
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || `http://localhost:${PORT}`;

if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID) {
  console.error("Error: Set OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_TENANT_ID in .env");
  process.exit(1);
}

function base64UrlEncode(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let codeVerifier;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  if (error) {
    console.error("Auth error:", error, errorDesc || "");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<p>Auth failed: ${error}. ${decodeURIComponent(errorDesc || "")}</p>`);
    return;
  }

  if (!code) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<p>Waiting for sign-in... Complete auth in the other browser tab.</p>");
    return;
  }

  try {
    const tokenRes = await axios.post(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      qs.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { refresh_token } = tokenRes.data;
    console.log("\n--- Add to .env ---\nOAUTH_REFRESH_TOKEN=" + refresh_token + "\n-------------------\n");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<p>Authorization successful. You can close this tab.</p>");
  } catch (err) {
    console.error("Token error:", err.response?.data || err.message);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end("<p>Error getting token. Check console.</p>");
  }
  process.exit();
});

server.listen(PORT, () => {
  codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(crypto.createHash("sha256").update(codeVerifier).digest());

  const authUrl =
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
    qs.stringify({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      response_mode: "query",
      scope: "offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read",
      prompt: "consent",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

  console.log(`Listening on ${REDIRECT_URI} - complete sign-in in browser`);
  open(REDIRECT_URI);
  open(authUrl);
});

const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const open = require("open").default;
const http = require("http");
const axios = require("axios");
const qs = require("querystring");

// PKCE: required for Single-page application (SPA) redirect in Azure
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { codeVerifier: verifier, codeChallenge: challenge };
}

const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const TENANT_ID = process.env.OAUTH_TENANT_ID;
// Use port 3000 + "Single-page application" in Azure (localhost:3000 allowed). For port 80 use "http://localhost" in Azure Web platform.
const PORT = parseInt(process.env.OAUTH_PORT || "3000", 10);
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || (PORT === 80 ? "http://localhost" : `http://localhost:${PORT}`);

if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID) {
  console.error("Error: Set OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_TENANT_ID in .env");
  process.exit(1);
}

let codeVerifier; // stored for token exchange (PKCE)

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

    console.log("TOKENS:", tokenRes.data);
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
  const { codeVerifier: verifier, codeChallenge } = generatePKCE();
  codeVerifier = verifier;

  const authUrl =
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
    qs.stringify({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      response_mode: "query",
      scope: "offline_access https://outlook.office.com/SMTP.Send",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

  console.log(`Listening on ${REDIRECT_URI} - complete sign-in in browser`);
  open(REDIRECT_URI);
  open(authUrl);
});

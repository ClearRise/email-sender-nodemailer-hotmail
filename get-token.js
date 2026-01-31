const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const open = require("open").default;
const http = require("http");
const axios = require("axios");
const qs = require("querystring");

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

const authUrl =
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
  qs.stringify({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: "offline_access https://outlook.office.com/SMTP.Send",
  });

const server = http.createServer(async (req, res) => {
  try {
    const tokenRes = await axios.post(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      qs.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
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
  console.log(`Listening on ${REDIRECT_URI} - complete sign-in in browser`);
  open(authUrl); 
});

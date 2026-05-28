import { google } from "googleapis";

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

export async function GET(request) {
  try {
    if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.OAUTH_REDIRECT_URI) {
      return new Response("Missing OAuth env vars", { status: 500 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (!tokens.refresh_token) {
      return new Response(
        "No refresh token issued. Revoke app access and try again.",
        { status: 200 }
      );
    }

    const safeRefreshToken = escapeHtml(tokens.refresh_token);
    const html = `
      <h1>Authentication Successful</h1>
      <p>Copy your refresh token and set it as REFRESH_TOKEN.</p>
      <textarea readonly style="width: 100%; height: 140px;">${safeRefreshToken}</textarea>
    `;

    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  } catch (error) {
    console.error("OAuth callback error", error);
    return new Response("OAuth callback error", { status: 500 });
  }
}

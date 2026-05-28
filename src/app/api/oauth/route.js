import { google } from "googleapis";

export async function GET() {
  try {
    if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.OAUTH_REDIRECT_URI) {
      return Response.json({ error: "Missing OAuth env vars" }, { status: 500 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive",
      ],
    });

    return Response.redirect(url);
  } catch (error) {
    console.error("OAuth URL error", error);
    return Response.json({ error: "Failed to generate OAuth URL" }, { status: 500 });
  }
}

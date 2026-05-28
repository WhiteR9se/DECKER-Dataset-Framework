export async function POST() {
  try {
    if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.REFRESH_TOKEN) {
      return Response.json({ error: "Missing OAuth env vars" }, { status: 500 });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        refresh_token: process.env.REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new Error("Failed to get access token");
    }

    return Response.json({
      access_token: tokenData.access_token,
      rootFolderId: process.env.DRIVE_FOLDER_ID,
    });
  } catch (error) {
    console.error("Token error", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

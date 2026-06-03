import { google } from "googleapis";
import fs from "fs";
import { Readable } from "stream";

export function getDriveClient() {
  if (
    !process.env.CLIENT_ID ||
    !process.env.CLIENT_SECRET ||
    !process.env.OAUTH_REDIRECT_URI ||
    !process.env.REFRESH_TOKEN
  ) {
    throw new Error(
      "Missing OAuth env vars: CLIENT_ID, CLIENT_SECRET, OAUTH_REDIRECT_URI, REFRESH_TOKEN"
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN,
  });

  return google.drive({ version: "v3", auth: oauth2Client });
}

export async function ensureFolder(drive, parentId, folderName) {
  const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id, name",
  });

  return folder.data.id;
}

export async function uploadFileFromPath(drive, folderId, filePath, fileName, mimeType) {
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: folderId ? [folderId] : undefined,
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath),
    },
    fields: "id, name",
  });

  return res.data.id;
}

export async function findFileId(drive, parentId, fileName) {
  const query = `name='${fileName}' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  return null;
}

export async function downloadFileText(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(res.data).toString("utf8");
}

export async function upsertTextFile(drive, parentId, fileName, content) {
  const fileId = await findFileId(drive, parentId, fileName);
  const media = {
    mimeType: "text/csv",
    body: Readable.from([content]),
  };

  if (fileId) {
    const res = await drive.files.update({
      fileId,
      media,
      fields: "id, name",
    });
    return res.data.id;
  }

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: parentId ? [parentId] : undefined,
    },
    media,
    fields: "id, name",
  });

  return res.data.id;
}

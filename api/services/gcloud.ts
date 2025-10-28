import { Storage } from '@google-cloud/storage';

const BUCKET = process.env.GCS_BUCKET_NAME || process.env.GCS_BUCKET || '';
if (!BUCKET) console.warn('GCS Bucket Name not found');

const storage = new Storage();

export async function uploadJson(path: string, payload: unknown) {
  const bucket = storage.bucket(BUCKET);
  const file = bucket.file(path);
  await file.save(JSON.stringify(payload, null, 2), { contentType: 'application/json' });
  return `gs://${BUCKET}/${path}`;
}

export async function getJson(path: string) {
  const bucket = storage.bucket(BUCKET);
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [contents] = await file.download();
  return JSON.parse(contents.toString('utf-8'));
}

export default { uploadJson, getJson };

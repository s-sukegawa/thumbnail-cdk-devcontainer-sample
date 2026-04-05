import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { generateThumbnailBuffer, normalizeContentType } from './thumbnail.js';

const s3 = new S3Client({});
const bucketName = process.env.BUCKET_NAME;
const uploadPrefix = process.env.UPLOAD_PREFIX ?? 'uploads/';
const thumbPrefix = process.env.THUMB_PREFIX ?? 'thumb/';
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? '*';

if (!bucketName) {
  throw new Error('BUCKET_NAME environment variable is required');
}

type PresignRequest = { fileName?: string; contentType?: string };
type ThumbnailRequest = { key?: string };

const jsonHeaders = {
  'content-type': 'application/json',
  'access-control-allow-origin': allowedOrigin,
  'access-control-allow-methods': 'OPTIONS,GET,POST',
  'access-control-allow-headers': 'content-type'
};

function response(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: jsonHeaders, body: JSON.stringify(body) };
}

function buildUploadKey(fileName?: string): string {
  const sanitized = (fileName ?? 'upload.png').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${uploadPrefix}${randomUUID()}-${sanitized}`;
}

async function handlePresign(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const payload = (event.body ? JSON.parse(event.body) : {}) as PresignRequest;
  const contentType = normalizeContentType(payload.contentType);
  if (contentType !== 'image/png') {
    return response(400, { message: 'Only image/png is supported' });
  }

  const key = buildUploadKey(payload.fileName);
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  return response(200, { uploadUrl, key, expiresInSeconds: 300 });
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function handleThumbnail(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const payload = (event.body ? JSON.parse(event.body) : {}) as ThumbnailRequest;
  const key = payload.key;
  if (!key || !key.startsWith(uploadPrefix)) {
    return response(400, { message: `key must start with ${uploadPrefix}` });
  }

  const object = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
  if (!object.Body) {
    return response(404, { message: 'Source image not found' });
  }

  const sourceBuffer = await streamToBuffer(object.Body as NodeJS.ReadableStream);
  const thumbBuffer = await generateThumbnailBuffer(sourceBuffer);
  const thumbKey = `${thumbPrefix}${key.split('/').at(-1)}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: thumbKey,
      Body: thumbBuffer,
      ContentType: 'image/png'
    })
  );

  return response(200, { thumbKey, message: 'Thumbnail generated' });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: jsonHeaders };
  }

  try {
    if (event.rawPath.endsWith('/presign') && event.requestContext.http.method === 'POST') {
      return await handlePresign(event);
    }

    if (event.rawPath.endsWith('/thumbnail') && event.requestContext.http.method === 'POST') {
      return await handleThumbnail(event);
    }

    return response(404, { message: 'Not found' });
  } catch (error) {
    console.error(error);
    return response(500, { message: 'Internal Server Error' });
  }
}

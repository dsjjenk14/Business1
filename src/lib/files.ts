/**
 * Bytes of a picked or captured file: a file/blob URI, or a data URI (e.g. a
 * filtered photo). Used for uploads to Storage.
 */
export async function readBytes(uri: string, fallbackType = 'image/jpeg'): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(uri);
  if (m) {
    const bin = atob(m[2]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes: bytes.buffer, contentType: m[1]! };
  }
  const response = await fetch(uri);
  return { bytes: await response.arrayBuffer(), contentType: response.headers.get('content-type') || fallbackType };
}

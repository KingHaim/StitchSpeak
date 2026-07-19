import { apiUrl } from './apiBase';

export async function downloadAccountExport(idToken: string): Promise<void> {
  const response = await fetch(apiUrl('/account/export'), {
    credentials: 'include',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'Could not export your account data.');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'stitchspeak-data.zip';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function deleteAccount(idToken: string, confirmation: string): Promise<void> {
  const response = await fetch(apiUrl('/account'), {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ confirmation }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'Could not delete your account.');
  }
}

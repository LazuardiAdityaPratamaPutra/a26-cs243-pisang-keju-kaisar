const API = import.meta.env.VITE_API_URL || '';

export const rupiah = (n) => 'Rp' + Number(n).toLocaleString('id-ID');

export async function panggil(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      'Server tidak dapat dihubungi. Periksa koneksi lalu coba lagi.',
    );
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    // respons bukan JSON
  }

  if (!res.ok) {
    if (!json?.error && res.status >= 500) {
      throw new Error(
        'Server tidak dapat dihubungi. Periksa koneksi lalu coba lagi.',
      );
    }
    throw new Error(json?.error?.pesan || 'Terjadi kesalahan. Coba lagi.');
  }
  return json;
}

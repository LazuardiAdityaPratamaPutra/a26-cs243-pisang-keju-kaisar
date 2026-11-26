import { useCallback, useEffect, useState } from 'react';
import { panggil, rupiah } from '../api';

const warnaStatus = {
  loading: 'bg-blue-50 text-blue-800',
  sukses: 'bg-green-50 text-green-800',
  gagal: 'bg-red-50 text-red-800',
};

const tombolKecil = 'rounded-lg border px-3 py-1 text-sm disabled:opacity-50';

export default function Catat() {
  const [menu, setMenu] = useState([]);
  const [topping, setTopping] = useState([]);
  const [menuId, setMenuId] = useState('');
  const [toppingId, setToppingId] = useState('');
  const [jumlah, setJumlah] = useState(1);
  const [status, setStatus] = useState({ tipe: 'idle', pesan: '' });
  const [riwayat, setRiwayat] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState('');
  const [editId, setEditId] = useState(null);
  const [editJumlah, setEditJumlah] = useState('');

  const sibuk = status.tipe === 'loading';

  const muatRiwayat = useCallback(async () => {
    setRiwayat(await panggil('/api/sales'));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await panggil('/api/menu');
        setMenu(data.menu);
        setTopping(data.topping);
        await muatRiwayat();
      } catch (err) {
        setGalatMuat(err.message);
      } finally {
        setMemuat(false);
      }
    })();
  }, [muatRiwayat]);

  const m = menu.find((x) => x.id === Number(menuId));
  const t = topping.find((x) => x.id === Number(toppingId));
  const total = m ? jumlah * (m.harga + (t ? t.harga : 0)) : 0;

  // Pembungkus: tampilkan "proses", jalankan aksi, lalu "berhasil" atau "gagal"
  async function jalankan(pesanProses, aksi) {
    setStatus({ tipe: 'loading', pesan: pesanProses });
    try {
      const hasil = await aksi();
      await muatRiwayat();
      setStatus({ tipe: 'sukses', pesan: hasil.pesan });
    } catch (err) {
      setStatus({ tipe: 'gagal', pesan: err.message });
    }
  }

  function simpan(e) {
    e.preventDefault();
    if (!menuId) {
      return setStatus({ tipe: 'gagal', pesan: 'Pilih menu terlebih dahulu.' });
    }
    if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > 99) {
      return setStatus({
        tipe: 'gagal',
        pesan: 'Jumlah harus angka bulat antara 1 dan 99.',
      });
    }
    jalankan('Menyimpan...', async () => {
      const hasil = await panggil('/api/sales', {
        method: 'POST',
        body: {
          menu_id: Number(menuId),
          topping_id: toppingId ? Number(toppingId) : null,
          jumlah,
        },
      });
      setMenuId('');
      setToppingId('');
      setJumlah(1);
      return { pesan: `Tersimpan: ${rupiah(hasil.data.total)}` };
    });
  }

  function simpanEdit(id) {
    const qty = Number(editJumlah);
    if (editJumlah === '' || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return setStatus({
        tipe: 'gagal',
        pesan: 'Jumlah harus angka bulat antara 1 dan 99.',
      });
    }
    jalankan('Menyimpan perubahan...', async () => {
      const hasil = await panggil(`/api/sales/${id}`, {
        method: 'PUT',
        body: { jumlah: qty },
      });
      setEditId(null);
      return hasil;
    });
  }

  function batalkan(id) {
    if (
      !window.confirm(
        'Batalkan catatan ini? Catatan tetap tampil, tapi tidak dihitung di total.',
      )
    )
      return;
    jalankan('Membatalkan...', () =>
      panggil(`/api/sales/${id}/cancel`, { method: 'POST' }),
    );
  }

  function hapus(id) {
    if (!window.confirm('Hapus catatan ini? Tidak bisa dikembalikan.')) return;
    jalankan('Menghapus...', () =>
      panggil(`/api/sales/${id}`, { method: 'DELETE' }),
    );
  }

  if (memuat) {
    return (
      <p className="p-6 text-center text-gray-600">
        Memuat... (jika lama, server sedang bangun, tunggu sebentar)
      </p>
    );
  }
  if (galatMuat) {
    return <p className="p-6 text-center text-red-700">{galatMuat}</p>;
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={simpan}
        className="space-y-4 rounded-xl border bg-white p-4 shadow-sm"
      >
        <label className="block">
          <span className="text-sm font-medium">Menu</span>
          <select
            value={menuId}
            onChange={(e) => setMenuId(e.target.value)}
            className="mt-1 w-full rounded-lg border p-3"
          >
            <option value="">-- Pilih menu --</option>
            {menu.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nama} ({rupiah(x.harga)})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Topping (boleh kosong)</span>
          <select
            value={toppingId}
            onChange={(e) => setToppingId(e.target.value)}
            className="mt-1 w-full rounded-lg border p-3"
          >
            <option value="">Tanpa topping</option>
            {topping.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nama} (+{rupiah(x.harga)})
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-sm font-medium">Jumlah</span>
          <div className="mt-1 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setJumlah((j) => Math.max(1, j - 1))}
              className="h-12 w-12 rounded-lg border text-2xl"
            >
              −
            </button>
            <span className="w-10 text-center text-xl font-semibold">
              {jumlah}
            </span>
            <button
              type="button"
              onClick={() => setJumlah((j) => Math.min(99, j + 1))}
              className="h-12 w-12 rounded-lg border text-2xl"
            >
              +
            </button>
          </div>
        </div>

        <p className="text-lg font-semibold">Total: {rupiah(total)}</p>

        <button
          type="submit"
          disabled={sibuk}
          className="w-full rounded-lg bg-amber-500 p-3 font-semibold text-white disabled:opacity-60"
        >
          {sibuk ? 'Memproses...' : 'Simpan Penjualan'}
        </button>
      </form>

      {status.tipe !== 'idle' && (
        <p
          role="status"
          className={`rounded-lg p-3 text-sm ${warnaStatus[status.tipe]}`}
        >
          {status.pesan}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Riwayat Hari Ini ({riwayat?.tanggal})</h2>
        <p className="text-sm text-gray-600">
          {riwayat?.jumlah_transaksi} transaksi · Total{' '}
          {rupiah(riwayat?.total_hari ?? 0)}
        </p>
        {riwayat?.data.length === 0 && (
          <p className="text-sm text-gray-500">Belum ada penjualan hari ini.</p>
        )}
        <ul className="space-y-2">
          {riwayat?.data.map((r) => (
            <li
              key={r.id_transaksi}
              className="rounded-lg border bg-white p-3 text-sm"
            >
              <div className="flex justify-between">
                <span className="font-medium">
                  {r.menu}
                  {r.topping ? ` + ${r.topping}` : ''}
                </span>
                <span
                  className={
                    r.status === 'batal' ? 'text-gray-400 line-through' : ''
                  }
                >
                  {rupiah(r.total)}
                </span>
              </div>
              <div className="text-gray-500">
                {r.jam ?? '--:--'} · {r.jumlah} porsi
                {r.status === 'batal' ? ' · BATAL' : ''}
              </div>

              {editId === r.id_transaksi ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={editJumlah}
                    onChange={(e) =>
                      setEditJumlah(
                        e.target.value.replace(/\D/g, '').replace(/^0+/, ''),
                      )
                    }
                    className="w-20 rounded-lg border p-2"
                  />
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() => simpanEdit(r.id_transaksi)}
                    className={`${tombolKecil} bg-amber-500 text-white`}
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditId(null)}
                    className={tombolKecil}
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  {r.status === 'selesai' && (
                    <>
                      <button
                        type="button"
                        disabled={sibuk}
                        onClick={() => {
                          setEditId(r.id_transaksi);
                          setEditJumlah(String(r.jumlah));
                        }}
                        className={tombolKecil}
                      >
                        Ubah
                      </button>
                      <button
                        type="button"
                        disabled={sibuk}
                        onClick={() => batalkan(r.id_transaksi)}
                        className={tombolKecil}
                      >
                        Batalkan
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() => hapus(r.id_transaksi)}
                    className={`${tombolKecil} text-red-700`}
                  >
                    Hapus
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

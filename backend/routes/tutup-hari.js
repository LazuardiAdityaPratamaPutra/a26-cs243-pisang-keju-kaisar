import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const galat = (res, status, kode, pesan) =>
  res.status(status).json({ error: { kode, pesan } });

// Sebelum tanggal ini  = data contoh Data Science, tidak boleh ditimpa
const TANGGAL_MULAI = '2026-11-01';
const UANG_MAKSIMAL = 100_000_000; // 100 juta
const hariIniWIB = async () => {
  const r = await pool.query(
    `SELECT to_char((now() AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS t`,
  );
  return r.rows[0].t;
};

// Format untuk YYYY-MM-DD benar-benar ada
const tanggalValid = (t) => {
  if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
};

const PESAN_TANGGAL =
  'Tanggal tidak valid. Gunakan format TTTT-BB-HH, contoh 2026-11-22.';

// 1. Lihat total sebelum menutup (harus di atas /closing/:tanggal)
router.get('/closing/preview', async (req, res) => {
  try {
    const tanggal = req.query.tanggal || (await hariIniWIB());
    if (!tanggalValid(tanggal)) {
      return galat(res, 400, 'TANGGAL_TIDAK_VALID', PESAN_TANGGAL);
    }

    const total = await pool.query(
      `SELECT COALESCE(SUM(total), 0):: int AS total_sistem,
          COUNT(*):: int AS jumlah_transaksi
          FROM transaksi
          WHERE tanggal = $1 AND status = 'selesai'`,
      [tanggal],
    );

    const rincian = await pool.query(
      `SELECT m.nama AS menu,
              SUM(t.jumlah)::int AS porsi,
              SUM(t.total)::int AS omzet
      FROM transaksi t 
      JOIN menu m ON m.id = t.menu_id
      WHERE t.tanggal = $1 AND t.status = 'selesai'
      GROUP BY m.nama
      ORDER BY omzet DESC`,
      [tanggal],
    );

    const rekap = await pool.query(
      `SELECT 1 FROM rekap_harian
      WHERE tanggal = $1 AND status_tutup IS NOT NULL`,
      [tanggal],
    );

    res.json({
      data: {
        tanggal,
        total_sistem: total.rows[0].total_sistem,
        jumlah_transaksi: total.rows[0].jumlah_transaksi,
        rincian: rincian.rows,
        sudah_ditutup: rekap.rowCount > 0,
      },
    });
  } catch (err) {
    console.error(err);
    galat(res, 500, 'SERVER_ERROR', 'Gagal memuat total hari ini. Coba lagi.');
  }
});

// 2. Simpan rekap harian
router.post('/closing', async (req, res) => {
  try {
    const { tanggal, uang_hitungan, hari_hujan } = req.body || {};

    if (!tanggalValid(tanggal)) {
      return galat(res, 400, 'TANGGAL_TIDAK_VALID', PESAN_TANGGAL);
    }
    const hariIni = await hariIniWIB();
    if (tanggal < TANGGAL_MULAI || tanggal > hariIni) {
      return galat(
        res,
        400,
        'TANGGAL_DI_LUAR_RENTANG',
        `Tanggal hanya boleh dari ${TANGGAL_MULAI} sampai hari ini.`,
      );
    }

    let uang = uang_hitungan;
    if (typeof uang === 'string' && uang.trim() !== '') uang = Number(uang);
    if (typeof uang !== 'number' || !Number.isInteger(uang) || uang < 0) {
      return galat(
        res,
        400,
        'INPUT_TIDAK_VALID',
        'Isi uang hasil hitungan dengan angka.',
      );
    }
    if (uang > UANG_MAKSIMAL) {
      return galat(
        res,
        400,
        'INPUT_TIDAK_VALID',
        'Uang hasil hitungan terlalu besar. Maksimal Rp100.000.000.',
      );
    }

    if (hari_hujan !== undefined && typeof hari_hujan !== 'boolean') {
      return galat(
        res,
        400,
        'INPUT_TIDAK_VALID',
        'Penanda hari hujan harus true atau false.',
      );
    }

    const hujan = hari_hujan === true; // default FALSE

    // Total dihitung di backend, bukan dari frontend
    const t = await pool.query(
      `SELECT COALESCE(SUM(total), 0)::int AS total_sistem
       FROM transaksi
       WHERE tanggal = $1 AND status = 'selesai'`,
      [tanggal],
    );
    const totalSistem = t.rows[0].total_sistem;
    const selisih = uang - totalSistem;
    const statusTutup = selisih === 0 ? 'Sesuai' : 'Selisih';

    const hasil = await pool.query(
      `INSERT INTO rekap_harian
         (tanggal, total_sistem, uang_hitungan, selisih, status_tutup, hari_hujan)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tanggal) DO UPDATE SET
         total_sistem = EXCLUDED.total_sistem,
         uang_hitungan = EXCLUDED.uang_hitungan,
         selisih = EXCLUDED.selisih,
         status_tutup = EXCLUDED.status_tutup,
         hari_hujan = EXCLUDED.hari_hujan
       RETURNING to_char(tanggal, 'YYYY-MM-DD') AS tanggal, total_sistem,
                 uang_hitungan, selisih, status_tutup, hari_hujan`,
      [tanggal, totalSistem, uang, selisih, statusTutup, hujan],
    );

    res.json({ pesan: 'Rekap tersimpan.', data: hasil.rows[0] });
  } catch (err) {
    console.error(err);
    galat(res, 500, 'SERVER_ERROR', 'Gagal menyimpan rekap. Coba lagi.');
  }
});

// 3. Buka rekap yang tersimpan
router.get('/closing/:tanggal', async (req, res) => {
  try {
    const { tanggal } = req.params;
    if (!tanggalValid(tanggal)) {
      return galat(res, 400, 'TANGGAL_TIDAK_VALID', PESAN_TANGGAL);
    }

    const r = await pool.query(
      `SELECT to_char(tanggal, 'YYYY-MM-DD') AS tanggal, total_sistem,
      uang_hitungan, selisih, status_tutup, hari_hujan
       FROM rekap_harian
       WHERE tanggal = $1`,
      [tanggal],
    );
    if (r.rowCount === 0) {
      return galat(
        res,
        404,
        'TIDAK_DITEMUKAN',
        'Rekap untuk tanggal ini belum tersimpan.',
      );
    }

    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error(err);
    galat(res, 500, 'SERVER_ERROR', 'Gagal memuat rekap. Coba lagi.');
  }
});

export default router;

import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

const galat = (res, status, kode, pesan) =>
  res.status(status).json({ error: { kode, pesan } });

router.get("/menu", async (req, res) => {
  try {
    const menu = await pool.query(
      "SELECT id, nama, harga FROM menu ORDER BY id",
    );
    const topping = await pool.query(
      "SELECT id, nama, harga FROM topping ORDER BY id",
    );
    res.json({ menu: menu.rows, topping: topping.rows });
  } catch (err) {
    console.error(err);
    galat(res, 500, "SERVER_ERROR", "Gagal memuat menu. Coba lagi.");
  }
});

router.post("/sales", async (req, res) => {
  try {
    const { menu_id, topping_id, jumlah } = req.body;

    const menuId = Number(menu_id);
    if (!Number.isInteger(menuId) || menuId <= 0) {
      return galat(
        res,
        400,
        "INPUT_TIDAK_VALID",
        "Pilih menu terlebih dahulu.",
      );
    }

    const qty = Number(jumlah);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      return galat(
        res,
        400,
        "INPUT_TIDAK_VALID",
        "Jumlah harus angka bulat antara 1 dan 99.",
      );
    }

    let toppingId = null;
    if (topping_id !== undefined && topping_id !== null && topping_id !== "") {
      toppingId = Number(topping_id);
      if (!Number.isInteger(toppingId) || toppingId <= 0) {
        return galat(res, 400, "INPUT_TIDAK_VALID", "Topping tidak valid.");
      }
    }

    const menu = await pool.query("SELECT harga FROM menu WHERE id = $1", [
      menuId,
    ]);
    if (menu.rowCount === 0) {
      return galat(res, 400, "INPUT_TIDAK_VALID", "Menu tidak ditemukan.");
    }
    const hargaSatuan = menu.rows[0].harga;

    let hargaTopping = 0;
    if (toppingId !== null) {
      const tp = await pool.query("SELECT harga FROM topping WHERE id = $1", [
        toppingId,
      ]);
      if (tp.rowCount === 0) {
        return galat(res, 400, "INPUT_TIDAK_VALID", "Topping tidak ditemukan.");
      }
      hargaTopping = tp.rows[0].harga;
    }

    const total = qty * (hargaSatuan + hargaTopping);

    // Tanggal dan jam dihitung di database dengan zona waktu WIB
    const hasil = await pool.query(
      `INSERT INTO transaksi
         (id_transaksi, tanggal, jam, menu_id, topping_id, jumlah,
          harga_satuan, harga_topping, total, status, sumber)
       VALUES
         ('TRX-' || lpad(nextval('seq_transaksi')::text, 6, '0'),
          (now() AT TIME ZONE 'Asia/Jakarta')::date,
          (now() AT TIME ZONE 'Asia/Jakarta')::time(0),
          $1, $2, $3, $4, $5, $6, 'selesai', 'aplikasi')
       RETURNING id_transaksi, to_char(tanggal, 'YYYY-MM-DD') AS tanggal,
                 to_char(jam, 'HH24:MI') AS jam, menu_id, topping_id,
                 jumlah, harga_satuan, harga_topping, total, status`,
      [menuId, toppingId, qty, hargaSatuan, hargaTopping, total],
    );

    res
      .status(201)
      .json({ pesan: "Penjualan tersimpan.", data: hasil.rows[0] });
  } catch (err) {
    console.error(err);
    galat(res, 500, "SERVER_ERROR", "Gagal menyimpan penjualan. Coba lagi.");
  }
});

router.get("/sales", async (req, res) => {
  try {
    let tanggal = req.query.tanggal;
    if (tanggal !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return galat(
        res,
        400,
        "PARAMETER_TIDAK_VALID",
        "Format tanggal harus YYYY-MM-DD.",
      );
    }
    if (tanggal === undefined) {
      const hari = await pool.query(
        `SELECT to_char((now() AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS hari`,
      );
      tanggal = hari.rows[0].hari;
    }

    const hasil = await pool.query(
      `SELECT t.id_transaksi, to_char(t.jam, 'HH24:MI') AS jam, m.nama AS menu,
              tp.nama AS topping, t.jumlah, t.total, t.status
       FROM transaksi t
       JOIN menu m ON m.id = t.menu_id
       LEFT JOIN topping tp ON tp.id = t.topping_id
       WHERE t.tanggal = $1::date
       ORDER BY t.jam DESC NULLS LAST, t.id_transaksi DESC`,
      [tanggal],
    );

    const selesai = hasil.rows.filter((r) => r.status === "selesai");
    const totalHari = selesai.reduce((jml, r) => jml + r.total, 0);

    res.json({
      tanggal,
      total_hari: totalHari,
      jumlah_transaksi: selesai.length,
      data: hasil.rows,
    });
  } catch (err) {
    if (err.code && err.code.startsWith("22")) {
      return galat(res, 400, "PARAMETER_TIDAK_VALID", "Tanggal tidak valid.");
    }
    console.error(err);
    galat(res, 500, "SERVER_ERROR", "Gagal memuat riwayat. Coba lagi.");
  }
});

export default router;

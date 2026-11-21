import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import penjualan from './routes/penjualan.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', penjualan);

app.get("/api/health", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS transaksi FROM transaksi",
  );
  res.json(rows[0]);
});

app.listen(process.env.PORT, () =>
  console.log("Server jalan di port", process.env.PORT),
);

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";

interface Order {
  id: string;
  fromLocation: string;
  toLocation: string;
  fromCoords?: [number, number]; // [lat, lng]
  toCoords?: [number, number];   // [lat, lng]
  price: number;
  status: "active" | "accepted";
  passengerPhone: string;
  acceptedBy?: string; // Driver ID
  acceptedAt?: number; // Timestamp
}

interface Driver {
  id: string;
  name: string;
  totalRides: number;
  rating: number;
}

// Initialize SQLite Database
const db = new Database(path.join(process.cwd(), "taxi_auction.db"));

// Enable WAL mode for better concurrency & performance
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    totalRides INTEGER NOT NULL,
    rating REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    fromLocation TEXT NOT NULL,
    toLocation TEXT NOT NULL,
    fromLat REAL,
    fromLng REAL,
    toLat REAL,
    toLng REAL,
    price REAL NOT NULL,
    status TEXT NOT NULL,
    passengerPhone TEXT NOT NULL,
    acceptedBy TEXT,
    acceptedAt INTEGER,
    FOREIGN KEY (acceptedBy) REFERENCES drivers(id)
  );
`);

// Seed initial data if tables are empty
const driverCount = db.prepare("SELECT COUNT(*) as count FROM drivers").get() as { count: number };
if (driverCount.count === 0) {
  const insertDriver = db.prepare("INSERT INTO drivers (id, name, totalRides, rating) VALUES (?, ?, ?, ?)");
  insertDriver.run("driver_1", "Аман (Aman)", 12, 5.0);
  insertDriver.run("driver_2", "Ресул (Resul)", 8, 4.9);
}

const orderCount = db.prepare("SELECT COUNT(*) as count FROM orders").get() as { count: number };
if (orderCount.count === 0) {
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, fromLocation, toLocation, fromLat, fromLng, toLat, toLng, price, status, passengerPhone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertOrder.run(
    "order_1",
    "Ашхабад, Международный аэропорт",
    "Ашхабад, ТЦ Беркарар",
    37.9893, 58.3614,
    37.9250, 58.3833,
    30.0,
    "active",
    "+993 65 12-34-56"
  );
  insertOrder.run(
    "order_2",
    "Марыйский велаят, город Мары (Центр)",
    "Марыйский велаят, Древний Мерв",
    37.5955, 61.8306,
    37.6881, 62.1883,
    80.0,
    "active",
    "+993 61 98-76-54"
  );
}

// Helper to map DB row to Order interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToOrder(row: any): Order {
  const order: Order = {
    id: row.id,
    fromLocation: row.fromLocation,
    toLocation: row.toLocation,
    price: row.price,
    status: row.status,
    passengerPhone: row.passengerPhone,
  };

  if (row.fromLat !== null && row.fromLng !== null) {
    order.fromCoords = [row.fromLat, row.fromLng];
  }
  if (row.toLat !== null && row.toLng !== null) {
    order.toCoords = [row.toLat, row.toLng];
  }
  if (row.acceptedBy) {
    order.acceptedBy = row.acceptedBy;
  }
  if (row.acceptedAt) {
    order.acceptedAt = row.acceptedAt;
  }
  return order;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Endpoints
  
  // GET /api/orders - Get all active/accepted orders
  app.get("/api/orders", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM orders ORDER BY rowid DESC").all();
      const orders = rows.map(rowToOrder);
      res.json(orders);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      res.status(500).json({ error: "Ошибка при получении заказов" });
    }
  });

  // GET /api/drivers - Get drivers list
  app.get("/api/drivers", (req, res) => {
    try {
      const drivers = db.prepare("SELECT * FROM drivers").all();
      res.json(drivers);
    } catch (err) {
      console.error("Failed to fetch drivers:", err);
      res.status(500).json({ error: "Ошибка при получении водителей" });
    }
  });

  // POST /api/orders/create - Create an order with optional coordinates
  app.post("/api/orders/create", (req, res) => {
    const { fromLocation, toLocation, fromCoords, toCoords, price, passengerPhone } = req.body;
    
    if (!fromLocation || !toLocation || !price || !passengerPhone) {
      return res.status(400).json({ error: "Все обязательные поля (Откуда, Куда, Цена, Телефон) должны быть заполнены" });
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({ error: "Укажите корректную стоимость поездки в манатах" });
    }

    try {
      // Generate unique order ID based on timestamp / counter
      const countResult = db.prepare("SELECT COUNT(*) as cnt FROM orders").get() as { cnt: number };
      const newId = `order_${Date.now()}_${countResult.cnt + 1}`;

      const fromLat = fromCoords ? fromCoords[0] : null;
      const fromLng = fromCoords ? fromCoords[1] : null;
      const toLat = toCoords ? toCoords[0] : null;
      const toLng = toCoords ? toCoords[1] : null;

      const insertStmt = db.prepare(`
        INSERT INTO orders (id, fromLocation, toLocation, fromLat, fromLng, toLat, toLng, price, status, passengerPhone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `);

      insertStmt.run(newId, fromLocation, toLocation, fromLat, fromLng, toLat, toLng, numericPrice, passengerPhone);

      const createdOrderRow = db.prepare("SELECT * FROM orders WHERE id = ?").get(newId);
      const newOrder = rowToOrder(createdOrderRow);

      res.status(201).json(newOrder);
    } catch (err) {
      console.error("Failed to create order:", err);
      res.status(500).json({ error: "Ошибка при создании заказа" });
    }
  });

  // POST /api/orders/:id/accept - Direct connect between driver and passenger (100% Free)
  app.post("/api/orders/:id/accept", (req, res) => {
    const { id } = req.params;
    const { driverId } = req.body;

    try {
      const driver = db.prepare("SELECT * FROM drivers WHERE id = ?").get(driverId) as Driver | undefined;
      if (!driver) {
        return res.status(404).json({ error: "Водитель не найден" });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderRow = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
      if (!orderRow) {
        return res.status(404).json({ error: "Заказ не найден" });
      }

      const order = rowToOrder(orderRow);
      if (order.status !== "active") {
        return res.status(400).json({ error: "Этот заказ уже принят другим водителем" });
      }

      const newTotalRides = driver.totalRides + 1;
      const newRating = Math.min(5.0, Number((driver.rating + 0.05).toFixed(2)));
      const now = Date.now();

      // Transaction to update driver stats and order status atomically
      const updateTransaction = db.transaction(() => {
        db.prepare("UPDATE drivers SET totalRides = ?, rating = ? WHERE id = ?").run(newTotalRides, newRating, driver.id);
        db.prepare("UPDATE orders SET status = 'accepted', acceptedBy = ?, acceptedAt = ? WHERE id = ?").run(driver.id, now, order.id);
      });

      updateTransaction();

      const updatedOrderRow = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
      const updatedOrder = rowToOrder(updatedOrderRow);

      res.json({
        success: true,
        message: `Прямая связь установлена! Водитель ${driver.name} связался с пассажиром.`,
        driverRides: newTotalRides,
        driverRating: newRating,
        passengerPhone: order.passengerPhone,
        order: updatedOrder
      });
    } catch (err) {
      console.error("Failed to accept order:", err);
      res.status(500).json({ error: "Ошибка при принятии заказа" });
    }
  });

  // POST /api/reset - Reset demo data
  app.post("/api/reset", (req, res) => {
    try {
      const resetTransaction = db.transaction(() => {
        db.prepare("DELETE FROM orders").run();
        db.prepare("DELETE FROM drivers").run();

        const insertDriver = db.prepare("INSERT INTO drivers (id, name, totalRides, rating) VALUES (?, ?, ?, ?)");
        insertDriver.run("driver_1", "Аман (Aman)", 12, 5.0);
        insertDriver.run("driver_2", "Ресул (Resul)", 8, 4.9);

        const insertOrder = db.prepare(`
          INSERT INTO orders (id, fromLocation, toLocation, fromLat, fromLng, toLat, toLng, price, status, passengerPhone)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertOrder.run(
          "order_1",
          "Ашхабад, Международный аэропорт",
          "Ашхабад, ТЦ Беркарар",
          37.9893, 58.3614,
          37.9250, 58.3833,
          30.0,
          "active",
          "+993 65 12-34-56"
        );
        insertOrder.run(
          "order_2",
          "Марыйский велаят, город Мары (Центр)",
          "Марыйский велаят, Древний Мерв",
          37.5955, 61.8306,
          37.6881, 62.1883,
          80.0,
          "active",
          "+993 61 98-76-54"
        );
      });

      resetTransaction();
      res.json({ success: true, message: "Данные успешно сброшены" });
    } catch (err) {
      console.error("Failed to reset data:", err);
      res.status(500).json({ error: "Ошибка при сбросе данных" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} with SQLite persistence`);
  });
}

startServer();

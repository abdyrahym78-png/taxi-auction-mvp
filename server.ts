import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { logger } from "./src/logger";

interface Order {
  id: string;
  fromLocation: string;
  toLocation: string;
  fromCoords?: [number, number];
  toCoords?: [number, number];
  price: number;
  status: "active" | "accepted" | "cancelled";
  passengerPhone: string;
  acceptedBy?: string;
  acceptedAt?: number;
}

interface Driver {
  id: string;
  name: string;
  totalRides: number;
  rating: number;
}

interface DbSchema {
  drivers: Driver[];
  orders: Order[];
  orderCounter: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultDbData: DbSchema = {
  drivers: [
    { id: "driver_1", name: "Аман (Aman)", totalRides: 12, rating: 5.0 },
    { id: "driver_2", name: "Ресул (Resul)", totalRides: 8, rating: 4.9 }
  ],
  orders: [
    {
      id: "order_3",
      fromLocation: "Финальный тест А",
      toLocation: "Финальный тест Б",
      price: 99,
      status: "active",
      passengerPhone: "+993****1111"
    },
    {
      id: "order_1",
      fromLocation: "Ашхабад, Международный аэропорт",
      toLocation: "Ашхабад, ТЦ Беркарар",
      fromCoords: [37.9893, 58.3614],
      toCoords: [37.9250, 58.3833],
      price: 30.0,
      status: "active",
      passengerPhone: "+993 65 12-34-56"
    },
    {
      id: "order_2",
      fromLocation: "Марыйский велаят, город Мары (Центр)",
      toLocation: "Марыйский велаят, Древний Мерв",
      fromCoords: [37.5955, 61.8306],
      toCoords: [37.6881, 62.1883],
      price: 80.0,
      status: "active",
      passengerPhone: "+993 61 98-76-54"
    }
  ],
  orderCounter: 4
};

function loadDb(): DbSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      logger.info("Database loaded successfully from data/db.json");
      return {
        drivers: parsed.drivers || defaultDbData.drivers,
        orders: parsed.orders || defaultDbData.orders,
        orderCounter: parsed.orderCounter || defaultDbData.orderCounter
      };
    }
  } catch (err) {
    logger.error("Failed to load db.json, using defaults", err);
  }
  saveDb(defaultDbData);
  return defaultDbData;
}

function saveDb(db: DbSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    logger.debug("Database saved successfully to data/db.json");
  } catch (err) {
    logger.error("Failed to save db.json", err);
  }
}

let db = loadDb();
let drivers = db.drivers;
let orders = db.orders;
let orderCounter = db.orderCounter;

function persist() {
  db.drivers = drivers;
  db.orders = orders;
  db.orderCounter = orderCounter;
  saveDb(db);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/orders", (req, res) => {
    logger.info("GET /api/orders requested");
    res.json(orders);
  });

  app.get("/api/drivers", (req, res) => {
    logger.info("GET /api/drivers requested");
    res.json(drivers);
  });

  app.post("/api/orders/create", (req, res) => {
    const { fromLocation, toLocation, fromCoords, toCoords, price, passengerPhone } = req.body;
    logger.info("POST /api/orders/create requested", { fromLocation, toLocation, price });
    
    if (!fromLocation || !toLocation || !price || !passengerPhone) {
      logger.warn("Validation failed: missing fields", { fromLocation, toLocation, price, passengerPhone });
      return res.status(400).json({ error: "Все обязательные поля должны быть заполнены" });
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      logger.warn("Validation failed: invalid price", { price });
      return res.status(400).json({ error: "Укажите корректную стоимость" });
    }

    const newOrder: Order = {
      id: `order_${orderCounter++}`,
      fromLocation,
      toLocation,
      fromCoords: fromCoords || undefined,
      toCoords: toCoords || undefined,
      price: numericPrice,
      status: "active",
      passengerPhone
    };

    orders.unshift(newOrder);
    persist();
    logger.info("Order created successfully", { id: newOrder.id });
    res.status(201).json(newOrder);
  });

  app.post("/api/orders/:id/accept", (req, res) => {
    const { id } = req.params;
    const { driverId } = req.body;
    logger.info(`POST /api/orders/${id}/accept requested`, { driverId });

    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
      logger.warn("Driver not found", { driverId });
      return res.status(404).json({ error: "Водитель не найден" });
    }

    const order = orders.find(o => o.id === id);
    if (!order) {
      logger.warn("Order not found", { id });
      return res.status(404).json({ error: "Заказ не найден" });
    }

    if (order.status !== "active") {
      logger.warn("Order already inactive", { id, status: order.status });
      return res.status(400).json({ error: "Этот заказ уже неактивен" });
    }

    driver.totalRides += 1;
    driver.rating = Math.min(5.0, Number((driver.rating + 0.05).toFixed(2)));
    order.status = "accepted";
    order.acceptedBy = driver.id;
    order.acceptedAt = Date.now();

    persist();
    logger.info("Order accepted successfully", { orderId: id, driverId: driver.id });

    res.json({
      success: true,
      message: `Прямая связь установлена! Водитель ${driver.name} связался с пассажиром.`,
      driverRides: driver.totalRides,
      driverRating: driver.rating,
      passengerPhone: order.passengerPhone,
      order: order
    });
  });

  app.post("/api/orders/:id/cancel", (req, res) => {
    const { id } = req.params;
    logger.info(`POST /api/orders/${id}/cancel requested`);
    const order = orders.find(o => o.id === id);
    if (!order) {
      logger.warn("Order not found for cancellation", { id });
      return res.status(404).json({ error: "Заказ не найден" });
    }
    if (order.status !== "active") {
      logger.warn("Cannot cancel inactive order", { id, status: order.status });
      return res.status(400).json({ error: "Отменить можно только активный заказ" });
    }
    order.status = "cancelled";
    persist();
    logger.info("Order cancelled successfully", { id });
    res.json({ success: true, message: "Заказ успешно отменен", order });
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);

  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server running at http://localhost:${PORT}`);
  });
}

startServer();

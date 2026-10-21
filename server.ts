import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

interface Order {
  id: string;
  fromLocation: string;
  toLocation: string;
  fromCoords?: [number, number];
  toCoords?: [number, number];
  price: number;
  status: "active" | "accepted";
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

// Fallback robust in-memory store simulating SQLite persistence for Termux/proot environments
let drivers: Driver[] = [
  { id: "driver_1", name: "Аман (Aman)", totalRides: 12, rating: 5.0 },
  { id: "driver_2", name: "Ресул (Resul)", totalRides: 8, rating: 4.9 }
];

let orders: Order[] = [
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
];

let orderCounter = 3;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/orders", (req, res) => {
    res.json(orders);
  });

  app.get("/api/drivers", (req, res) => {
    res.json(drivers);
  });

  app.post("/api/orders/create", (req, res) => {
    const { fromLocation, toLocation, fromCoords, toCoords, price, passengerPhone } = req.body;
    
    if (!fromLocation || !toLocation || !price || !passengerPhone) {
      return res.status(400).json({ error: "Все обязательные поля должны быть заполнены" });
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
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
    res.status(201).json(newOrder);
  });

  app.post("/api/orders/:id/accept", (req, res) => {
    const { id } = req.params;
    const { driverId } = req.body;

    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
      return res.status(404).json({ error: "Водитель не найден" });
    }

    const order = orders.find(o => o.id === id);
    if (!order) {
      return res.status(404).json({ error: "Заказ не найден" });
    }

    if (order.status !== "active") {
      return res.status(400).json({ error: "Этот заказ уже принят" });
    }

    driver.totalRides += 1;
    driver.rating = Math.min(5.0, Number((driver.rating + 0.05).toFixed(2)));
    order.status = "accepted";
    order.acceptedBy = driver.id;
    order.acceptedAt = Date.now();

    res.json({
      success: true,
      message: `Прямая связь установлена! Водитель ${driver.name} связался с пассажиром.`,
      driverRides: driver.totalRides,
      driverRating: driver.rating,
      passengerPhone: order.passengerPhone,
      order: order
    });
  });

  app.post("/api/reset", (req, res) => {
    drivers = [
      { id: "driver_1", name: "Аман (Aman)", totalRides: 12, rating: 5.0 },
      { id: "driver_2", name: "Ресул (Resul)", totalRides: 8, rating: 4.9 }
    ];
    orders = [
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
    ];
    orderCounter = 3;
    res.json({ success: true, message: "Данные успешно сброшены" });
  });

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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

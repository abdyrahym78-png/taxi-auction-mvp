import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

interface Order {
  id: string;
  fromLocation: string;
  toLocation: string;
  price: number;
  status: "active" | "accepted";
  passengerPhone: string;
  acceptedBy?: string; // Driver ID
}

interface Driver {
  id: string;
  name: string;
  balance: number;
}

// In-memory data store matching Python's dict behavior
let drivers: Driver[] = [
  { id: "driver_1", name: "Аман (Aman)", balance: 10.0 },
  { id: "driver_2", name: "Ресул (Resul)", balance: 0.5 }
];

let orders: Order[] = [
  {
    id: "order_1",
    fromLocation: "Аэропорт Ашхабада",
    toLocation: "ТЦ Беркарар",
    price: 15.0,
    status: "active",
    passengerPhone: "+993 65 12-34-56"
  },
  {
    id: "order_2",
    fromLocation: "Вокзал (Ашхабад)",
    toLocation: "Рынок Толкучка (Алтын Асыр)",
    price: 25.0,
    status: "active",
    passengerPhone: "+993 61 98-76-54"
  }
];

let orderCounter = 3;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Endpoints
  
  // GET /api/orders - Get all active/free orders
  app.get("/api/orders", (req, res) => {
    // Only return active orders or accepted ones (but hide phone for active unless accepted)
    const sanitizedOrders = orders.map(order => {
      if (order.status === "active") {
        const { passengerPhone, ...rest } = order;
        return { ...rest, passengerPhone: "Скрыт (Примите заказ за 1 TMT)" };
      }
      return order;
    });
    res.json(sanitizedOrders);
  });

  // GET /api/drivers - Helper endpoint to get driver profiles and balances
  app.get("/api/drivers", (req, res) => {
    res.json(drivers);
  });

  // POST /api/orders/create - Create an order
  app.post("/api/orders/create", (req, res) => {
    const { fromLocation, toLocation, price, passengerPhone } = req.body;
    
    if (!fromLocation || !toLocation || !price || !passengerPhone) {
      return res.status(400).json({ error: "Все поля (Откуда, Куда, Цена, Телефон) обязательны" });
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({ error: "Укажите корректную стоимость поездки в манатах" });
    }

    const newOrder: Order = {
      id: `order_${orderCounter++}`,
      fromLocation,
      toLocation,
      price: numericPrice,
      status: "active",
      passengerPhone
    };

    orders.push(newOrder);
    res.status(201).json(newOrder);
  });

  // POST /api/orders/:id/accept - Accept order by driver
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
      return res.status(400).json({ error: "Этот заказ уже принят другим водителем" });
    }

    // Fixed commission validation: 1.00 TMT
    const commission = 1.00;
    if (driver.balance < commission) {
      return res.status(400).json({ 
        error: `Недостаточно средств на балансе. Требуется минимум 1.00 TMT. Ваш баланс: ${driver.balance.toFixed(2)} TMT. Пожалуйста, пополните баланс во вкладке водителя!` 
      });
    }

    // Deduct 1 TMT from driver wallet and update order status
    driver.balance = parseFloat((driver.balance - commission).toFixed(2));
    order.status = "accepted";
    order.acceptedBy = driver.id;

    // Return successfully accepted order containing passenger's real phone number
    res.json({
      success: true,
      message: "Заказ успешно принят! Списана комиссия 1 TMT.",
      driverBalance: driver.balance,
      passengerPhone: order.passengerPhone,
      order: order
    });
  });

  // POST /api/drivers/:id/deposit - Helper to replenish a driver's balance for easy testing
  app.post("/api/drivers/:id/deposit", (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;

    const driver = drivers.find(d => d.id === id);
    if (!driver) {
      return res.status(404).json({ error: "Водитель не найден" });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Укажите корректную сумму пополнения" });
    }

    driver.balance = parseFloat((driver.balance + numericAmount).toFixed(2));
    res.json({ success: true, message: `Баланс успешно пополнен на ${numericAmount} TMT.`, balance: driver.balance });
  });

  // POST /api/reset - Reset everything back to original state
  app.post("/api/reset", (req, res) => {
    drivers = [
      { id: "driver_1", name: "Аман (Aman)", balance: 10.0 },
      { id: "driver_2", name: "Ресул (Resul)", balance: 0.5 }
    ];
    orders = [
      {
        id: "order_1",
        fromLocation: "Аэропорт Ашхабада",
        toLocation: "ТЦ Беркарар",
        price: 15.0,
        status: "active",
        passengerPhone: "+993 65 12-34-56"
      },
      {
        id: "order_2",
        fromLocation: "Вокзал (Ашхабад)",
        toLocation: "Рынок Толкучка (Алтын Асыр)",
        price: 25.0,
        status: "active",
        passengerPhone: "+993 61 98-76-54"
      }
    ];
    orderCounter = 3;
    res.json({ success: true, message: "Данные успешно сброшены" });
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import uvicorn
from fastapi import FastAPI, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import os

app = FastAPI(title="Taxi Auction MVP - Сайт X", version="1.0.0")

# Встроенный в оперативную память эмулятор базы данных
db = {
    "drivers": {
        "driver_1": {"id": "driver_1", "name": "Аман (Aman)", "balance": 10.00},
        "driver_2": {"id": "driver_2", "name": "Ресул (Resul)", "balance": 0.50},
    },
    "orders": {
        "order_1": {
            "id": "order_1",
            "from_location": "Аэропорт Ашхабада",
            "to_location": "ТЦ Беркарар",
            "price": 15.0,
            "status": "active",
            "passenger_phone": "+99365123456"
        }
    },
    "order_counter": 2
}

# Схемы валидации данных Pydantic
class OrderCreate(BaseModel):
    from_location: str = Field(..., min_length=2, description="Пункт отправления")
    to_location: str = Field(..., min_length=2, description="Пункт назначения")
    price: float = Field(..., gt=0, description="Предлагаемая цена в манатах (TMT)")
    passenger_phone: str = Field(..., min_length=5, description="Номер телефона пассажира")

class OrderResponse(BaseModel):
    id: str
    from_location: str
    to_location: str
    price: float
    status: str
    passenger_phone: str  # В реальном API скрывается для незакрытых сделок

class AcceptRequest(BaseModel):
    driver_id: str = Field(..., description="Идентификатор водителя, принимающего заказ")

class DriverResponse(BaseModel):
    id: str
    name: str
    balance: float

# Эндпоинты API

@app.get("/drivers", response_model=List[DriverResponse])
def get_drivers():
    """Получить список водителей и их балансы"""
    return list(db["drivers"].values())

@app.get("/orders")
def get_orders():
    """Получить все свободные (активные) заказы. Телефон скрыт до принятия."""
    active_orders = []
    for order_id, order in db["orders"].items():
        if order["status"] == "active":
            # Возвращаем копию со скрытым телефоном ради безопасности
            order_copy = order.copy()
            order_copy["passenger_phone"] = "Скрыт (Примите за 1 TMT)"
            active_orders.append(order_copy)
    return active_orders

@app.post("/orders/create")
def create_order(order_data: OrderCreate):
    """Создать новый заказ пассажиром"""
    new_id = f"order_{db['order_counter']}"
    db["order_counter"] += 1
    
    new_order = {
        "id": new_id,
        "from_location": order_data.from_location,
        "to_location": order_data.to_location,
        "price": order_data.price,
        "status": "active",
        "passenger_phone": order_data.passenger_phone
    }
    
    db["orders"][new_id] = new_order
    return new_order

@app.post("/orders/{order_id}/accept")
def accept_order(order_id: str, request: AcceptRequest):
    """Принятие заказа водителем со списанием комиссии 1 манат (TMT) и возвратом номера телефона"""
    driver_id = request.driver_id
    
    # 1. Проверяем существование водителя
    if driver_id not in db["drivers"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Водитель не найден в системе"
        )
    
    # 2. Проверяем существование заказа
    if order_id not in db["orders"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Заказ не существует"
        )
    
    driver = db["drivers"][driver_id]
    order = db["orders"][order_id]
    
    # 3. Проверяем статус заказа
    if order["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Этот заказ уже принят другим водителем"
        )
    
    # 4. Проверяем баланс водителя (фиксированная комиссия - 1 TMT)
    commission = 1.00
    if driver["balance"] < commission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Недостаточно средств. Ваш баланс: {driver['balance']:.2f} TMT. Требуется 1.00 TMT."
        )
    
    # 5. Проводим транзакцию: списываем 1 манат, меняем статус заказа
    driver["balance"] = round(driver["balance"] - commission, 2)
    order["status"] = "accepted"
    order["accepted_by"] = driver_id
    
    # Возвращаем успешную транзакцию со всей контактной информацией
    return {
        "success": True,
        "message": f"Вы успешно приобрели контакт! Списано: 1.00 TMT. Ваш баланс: {driver['balance']:.2f} TMT.",
        "passenger_phone": order["passenger_phone"],
        "order": order,
        "driver_balance": driver["balance"]
    }

# Дополнительный эндпоинт для пополнения счета водителю при тестах в Termux
@app.post("/drivers/{driver_id}/deposit")
def deposit_balance(driver_id: str, amount: float):
    if driver_id not in db["drivers"]:
        raise HTTPException(status_code=404, detail="Водитель не найден")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма пополнения должна быть больше нуля")
    db["drivers"][driver_id]["balance"] = round(db["drivers"][driver_id]["balance"] + amount, 2)
    return {"message": "Баланс успешно пополнен", "balance": db["drivers"][driver_id]["balance"]}

# Раздача HTML-фронтенда
@app.get("/", response_class=HTMLResponse)
def get_frontend():
    # Если файл index.html лежит рядом, читаем его
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            return f.read()
    return """
    <html>
        <body style="font-family: sans-serif; background: #121212; color: white; padding: 20px; text-align: center;">
            <h2>Фронтенд index.html еще не создан в директории main.py!</h2>
            <p>Поместите файл index.html в одну папку с main.py для корректной работы.</p>
        </body>
    </html>
    """

if __name__ == "__main__":
    uvicorn.run("main.py:app", host="0.0.0.0", port=3000, reload=True)

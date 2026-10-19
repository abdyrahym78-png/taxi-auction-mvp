import React, { useState, useEffect } from "react";
import { 
  MapPin, 
  Navigation, 
  DollarSign, 
  Phone, 
  User, 
  Wallet, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Plus, 
  Trash2, 
  Car, 
  Info 
} from "lucide-react";

interface Order {
  id: string;
  fromLocation: string;
  toLocation: string;
  price: number;
  status: "active" | "accepted";
  passengerPhone: string;
  acceptedBy?: string;
}

interface Driver {
  id: string;
  name: string;
  balance: number;
}

interface Toast {
  message: string;
  type: "success" | "error" | "info";
  id: number;
}

export default function App() {
  // State
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("driver_1");
  const [fromLocation, setFromLocation] = useState<string>("");
  const [toLocation, setToLocation] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [passengerPhone, setPassengerPhone] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Keep track of accepted orders contact phone numbers revealed during this session
  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});

  // Show Toast helper
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { message, type, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Fetch Drivers and Balance
  const fetchDrivers = async () => {
    try {
      const res = await fetch("/api/drivers");
      if (res.ok) {
        const data = await res.json();
        setDrivers(data);
      }
    } catch (err) {
      console.error("Failed to fetch drivers:", err);
    }
  };

  // Fetch Orders
  const fetchOrders = async (showNotification = false) => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
        if (showNotification) {
          showToast("Лента заказов обновлена", "info");
        }
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setRefreshing(false);
    }
  };

  // Run on mount and poll every 4 seconds
  useEffect(() => {
    fetchDrivers();
    fetchOrders();

    const interval = setInterval(() => {
      fetchDrivers();
      fetchOrders();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Find active driver details
  const activeDriver = drivers.find((d) => d.id === selectedDriverId) || {
    id: "driver_1",
    name: "Аман (Aman)",
    balance: 10.0,
  };

  // Handle order creation
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromLocation.trim() || !toLocation.trim() || !price || !passengerPhone.trim()) {
      showToast("Заполните все поля формы!", "error");
      return;
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      showToast("Укажите корректную цену выше 0 TMT!", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromLocation,
          toLocation,
          price: numericPrice,
          passengerPhone,
        }),
      });

      if (res.ok) {
        showToast("Заказ успешно опубликован в эфире!", "success");
        setFromLocation("");
        setToLocation("");
        setPrice("");
        setPassengerPhone("");
        fetchOrders();
      } else {
        const errData = await res.json();
        showToast(errData.error || "Ошибка при публикации заказа", "error");
      }
    } catch (err) {
      showToast("Ошибка сети при отправке заказа", "error");
    } finally {
      setLoading(false);
    }
  };

  // Handle Order Acceptance
  const handleAcceptOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: selectedDriverId }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast("Заказ принят! Комиссия 1.00 TMT списана.", "success");
        // Store revealed phone locally
        setRevealedPhones((prev) => ({
          ...prev,
          [orderId]: data.passengerPhone,
        }));
        // Reload statuses
        fetchDrivers();
        fetchOrders();
      } else {
        showToast(data.error || "Не удалось принять заказ", "error");
      }
    } catch (err) {
      showToast("Ошибка сети при принятии заказа", "error");
    }
  };

  // Handle simulated wallet replenishment
  const handleDeposit = async () => {
    try {
      const res = await fetch(`/api/drivers/${selectedDriverId}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 5.0 }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast("Кошелек успешно пополнен на +5.00 TMT!", "success");
        fetchDrivers();
      } else {
        showToast(data.error || "Не удалось пополнить счет", "error");
      }
    } catch (err) {
      showToast("Ошибка при пополнении счета", "error");
    }
  };

  // Reset database back to default state
  const handleResetSystem = async () => {
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (res.ok) {
        showToast("Данные успешно сброшены в исходное состояние", "info");
        setRevealedPhones({});
        fetchDrivers();
        fetchOrders();
      } else {
        showToast("Ошибка сброса данных", "error");
      }
    } catch (err) {
      showToast("Ошибка подключения при сбросе", "error");
    }
  };

  return (
    <div id="app-root" className="min-h-screen bg-[#09090b] text-[#fafafa] font-sans antialiased p-4 md:p-6 lg:p-8 flex flex-col justify-between">
      {/* Container with Max Width for Desktop / Fluid layout */}
      <div className="max-w-7xl w-full mx-auto space-y-6 flex-grow">
        
        {/* HEADER BENTO CARD */}
        <header id="bento-header" className="bg-[#18181b] border border-white/10 rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#fbbf24]/5 rounded-full filter blur-3xl pointer-events-none"></div>
          
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#fbbf24] rounded-xl flex items-center justify-center text-black font-black text-2xl shadow-lg shadow-[#fbbf24]/20">
              X
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">SAYT X TAXI</h1>
                <span className="text-[10px] bg-[#fbbf24]/20 text-[#fbbf24] border border-[#fbbf24]/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Auction MVP
                </span>
              </div>
              <p className="text-xs text-[#a1a1aa] mt-0.5">
                Модель такси-аукциона InDrive с фиксированной платой за контакт
              </p>
            </div>
          </div>

          {/* Test Driver Switcher & Balance Area */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
            {/* Driver Profile Switcher */}
            <div className="bg-[#27272a] p-1.5 rounded-xl border border-white/5 flex gap-1">
              <button
                id="btn-switch-aman"
                onClick={() => setSelectedDriverId("driver_1")}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                  selectedDriverId === "driver_1"
                    ? "bg-[#fbbf24] text-black shadow-md"
                    : "text-[#a1a1aa] hover:text-white"
                }`}
              >
                <User size={14} />
                Аман
              </button>
              <button
                id="btn-switch-resul"
                onClick={() => setSelectedDriverId("driver_2")}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                  selectedDriverId === "driver_2"
                    ? "bg-[#fbbf24] text-black shadow-md"
                    : "text-[#a1a1aa] hover:text-white"
                }`}
              >
                <User size={14} />
                Ресул (0.5 TMT)
              </button>
            </div>

            {/* Wallet Info Display */}
            <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-xl p-2 px-4 flex items-center justify-between sm:justify-start gap-4 shadow-inner min-w-[200px]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#fbbf24]/20 flex items-center justify-center text-[#fbbf24]">
                  <Wallet size={16} />
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#fbbf24] font-bold tracking-wider">Баланс</div>
                  <div className="text-base font-black tracking-tight text-white tabular-nums">
                    {activeDriver.balance.toFixed(2)} TMT
                  </div>
                </div>
              </div>
              <button 
                id="btn-deposit"
                onClick={handleDeposit}
                className="bg-[#fbbf24] hover:bg-[#fbbf24]/90 text-black text-xs font-extrabold px-2.5 py-1.5 rounded-lg shadow-sm transition-transform active:scale-95 flex items-center gap-1 cursor-pointer"
                title="Пополнить баланс на +5.00 TMT для тестов"
              >
                <Plus size={12} />
                +5 TMT
              </button>
            </div>
          </div>
        </header>

        {/* BENTO GRID CONTENT SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* SIDEBAR BENTO PANE: Passenger (Create Order) */}
          <aside id="bento-passenger-pane" className="lg:col-span-4 bg-[#18181b] border border-white/10 rounded-2xl p-5 md:p-6 flex flex-col justify-between space-y-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-[#fbbf24]/2 rounded-full filter blur-xl pointer-events-none"></div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 bg-[#fbbf24] rounded-full"></div>
                <h2 className="text-lg font-bold tracking-tight">Создать заказ пассажиром</h2>
              </div>
              <p className="text-xs text-[#a1a1aa]">
                Введите пункты поездки, предлагаемую цену и номер телефона. Водители увидят заказ в реальном времени.
              </p>
              
              <form onSubmit={handleCreateOrder} className="space-y-4 pt-2">
                {/* Point A */}
                <div className="space-y-1.5">
                  <label htmlFor="from" className="text-xs text-[#a1a1aa] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={12} className="text-[#fbbf24]" />
                    Откуда (Пункт А)
                  </label>
                  <input
                    id="from"
                    type="text"
                    value={fromLocation}
                    onChange={(e) => setFromLocation(e.target.value)}
                    placeholder="Например: Аэропорт Ашхабада"
                    className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl px-4 py-3 text-sm text-white placeholder-[#71717a] focus:outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]/30 transition-all duration-200"
                    required
                  />
                </div>

                {/* Point B */}
                <div className="space-y-1.5">
                  <label htmlFor="to" className="text-xs text-[#a1a1aa] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <Navigation size={12} className="text-[#fbbf24]" />
                    Куда (Пункт Б)
                  </label>
                  <input
                    id="to"
                    type="text"
                    value={toLocation}
                    onChange={(e) => setToLocation(e.target.value)}
                    placeholder="Например: ТЦ Беркарар"
                    className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl px-4 py-3 text-sm text-white placeholder-[#71717a] focus:outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]/30 transition-all duration-200"
                    required
                  />
                </div>

                {/* Price offering */}
                <div className="space-y-1.5">
                  <label htmlFor="price" className="text-xs text-[#a1a1aa] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign size={12} className="text-[#fbbf24]" />
                    Предлагаемая цена (TMT)
                  </label>
                  <div className="relative">
                    <input
                      id="price"
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Например: 15"
                      min="1"
                      step="0.5"
                      className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder-[#71717a] focus:outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]/30 transition-all duration-200"
                      required
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#fbbf24]">
                      TMT
                    </span>
                  </div>
                </div>

                {/* Passenger Telephone */}
                <div className="space-y-1.5">
                  <label htmlFor="phone" className="text-xs text-[#a1a1aa] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <Phone size={12} className="text-[#fbbf24]" />
                    Телефон пассажира
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={passengerPhone}
                    onChange={(e) => setPassengerPhone(e.target.value)}
                    placeholder="Например: +993 65 12-34-56"
                    className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl px-4 py-3 text-sm text-white placeholder-[#71717a] focus:outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]/30 transition-all duration-200"
                    required
                  />
                </div>

                <button
                  id="btn-submit-order"
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#fbbf24] hover:bg-[#fbbf24]/90 disabled:opacity-50 text-black font-extrabold py-3.5 px-4 rounded-xl shadow-lg hover:shadow-[#fbbf24]/10 transition-all active:scale-[0.98] text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-4"
                >
                  {loading ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Опубликовать заказ
                </button>
              </form>
            </div>

            {/* Lower info block with system helper */}
            <div className="border-t border-white/5 pt-4 space-y-3">
              <div className="flex gap-2.5 items-start text-xs text-[#a1a1aa] bg-white/2 p-3 rounded-xl border border-white/5">
                <Info size={16} className="text-[#fbbf24] shrink-0 mt-0.5" />
                <p>
                  Пассажир не платит комиссию. С водителя списывается ровно <strong>1.00 TMT</strong> за принятие заказа (плата за контакт).
                </p>
              </div>

              {/* Reset simulator state */}
              <button
                id="btn-reset-system"
                onClick={handleResetSystem}
                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2.5 px-4 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                title="Сбросить все данные к исходным значениям"
              >
                <Trash2 size={13} />
                Сбросить демонстрационные данные
              </button>
            </div>
          </aside>

          {/* MAIN BENTO PANE: Live Orders Feed */}
          <main id="bento-driver-pane" className="lg:col-span-8 bg-[#18181b] border border-white/10 rounded-2xl p-5 md:p-6 flex flex-col space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-[#fbbf24] rounded-full"></div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Живой эфир заказов</h2>
                  <p className="text-xs text-[#a1a1aa]">
                    Показаны только активные заказы. Выберите водителя выше для симуляции списания.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span className="text-xs bg-[#27272a] text-[#a1a1aa] px-3 py-1.5 rounded-lg border border-white/5 font-semibold">
                  {orders.length} заказов в базе
                </span>
                <button
                  id="btn-refresh"
                  onClick={() => fetchOrders(true)}
                  disabled={refreshing}
                  className="bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] border border-[#3f3f46] p-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin text-[#fbbf24]" : ""} />
                  Обновить ↻
                </button>
              </div>
            </div>

            {/* Orders Feed Cards Container */}
            <div className="flex-grow">
              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-3 bg-[#27272a]/10 rounded-2xl border border-dashed border-white/5">
                  <Car size={40} className="text-[#a1a1aa] opacity-40 animate-pulse" />
                  <div className="text-sm font-semibold text-white">В данный момент нет свободных заказов</div>
                  <p className="text-xs text-[#a1a1aa] max-w-sm">
                    Создайте новый заказ, используя форму слева, чтобы он мгновенно появился в живой ленте!
                  </p>
                </div>
              ) : (
                <div id="orders-list-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {orders.map((order) => {
                    const isRevealed = !!revealedPhones[order.id];
                    const isAcceptedByMe = order.status === "accepted" || isRevealed;

                    return (
                      <div
                        key={order.id}
                        className={`group relative overflow-hidden rounded-2xl border p-5 flex flex-col justify-between transition-all duration-200 ${
                          isAcceptedByMe
                            ? "bg-[#10b981]/5 border-[#10b981]/40 shadow-lg shadow-[#10b981]/5"
                            : "bg-[#18181b] border-white/5 hover:border-[#fbbf24]/50 hover:bg-white/[0.01]"
                        }`}
                      >
                        {/* Background subtle glowing indicators */}
                        {isAcceptedByMe ? (
                          <div className="absolute -top-12 -right-12 w-24 h-24 bg-[#10b981]/10 rounded-full filter blur-xl pointer-events-none"></div>
                        ) : (
                          <div className="absolute -top-12 -right-12 w-24 h-24 bg-[#fbbf24]/5 rounded-full filter blur-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                        )}

                        <div className="space-y-4">
                          {/* Order Metadata / Header */}
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] text-[#a1a1aa] uppercase font-bold tracking-widest block mb-0.5">
                                Заказ #{order.id.replace("order_", "")}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${isAcceptedByMe ? "bg-[#10b981] animate-ping" : "bg-[#fbbf24] animate-pulse"}`}></span>
                                <span className={`text-xs font-bold uppercase tracking-wide ${isAcceptedByMe ? "text-[#10b981]" : "text-[#fbbf24]"}`}>
                                  {isAcceptedByMe ? "Заказ получен" : "Ищет водителя"}
                                </span>
                              </div>
                            </div>

                            {/* Price Badge */}
                            <div className="bg-[#fbbf24]/15 border border-[#fbbf24]/30 px-3 py-1.5 rounded-xl flex items-baseline gap-1 shadow-inner">
                              <span className="text-xl font-black text-[#fbbf24] tracking-tight">{order.price}</span>
                              <span className="text-[10px] text-[#fbbf24] font-bold">TMT</span>
                            </div>
                          </div>

                          {/* Route Details with connector lines */}
                          <div className="relative pl-6 space-y-4 py-1">
                            {/* Route decorative connector line */}
                            <div className="absolute left-[7px] top-[14px] bottom-[14px] w-[2px] border-l border-dashed border-white/10"></div>
                            
                            {/* Point A */}
                            <div className="relative">
                              <span className="absolute left-[-23px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#27272a] border border-[#fbbf24]/60 flex items-center justify-center text-[8px] text-[#fbbf24] font-black">
                                А
                              </span>
                              <div className="text-[10px] text-[#a1a1aa] font-bold uppercase">Откуда</div>
                              <p className="text-sm font-semibold text-white line-clamp-1">{order.fromLocation}</p>
                            </div>

                            {/* Point B */}
                            <div className="relative">
                              <span className="absolute left-[-23px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#27272a] border border-[#10b981]/60 flex items-center justify-center text-[8px] text-[#10b981] font-black">
                                Б
                              </span>
                              <div className="text-[10px] text-[#a1a1aa] font-bold uppercase">Куда</div>
                              <p className="text-sm font-semibold text-white line-clamp-1">{order.toLocation}</p>
                            </div>
                          </div>
                        </div>

                        {/* Order action button or phone display */}
                        <div className="mt-5 pt-3 border-t border-white/5">
                          {isAcceptedByMe ? (
                            <div className="space-y-2">
                              <div className="text-[10px] font-bold uppercase text-[#10b981] tracking-wider text-center">
                                Контактные данные открыты
                              </div>
                              <div className="bg-[#10b981]/10 border border-[#10b981]/20 rounded-xl p-3 flex items-center justify-between shadow-inner">
                                <div className="flex items-center gap-2">
                                  <Phone size={16} className="text-[#10b981]" />
                                  <span className="text-base font-bold tracking-wider text-white select-all">
                                    {revealedPhones[order.id] || order.passengerPhone}
                                  </span>
                                </div>
                                <a
                                  href={`tel:${revealedPhones[order.id] || order.passengerPhone}`}
                                  className="bg-[#10b981] hover:bg-[#10b981]/90 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition-transform active:scale-95 cursor-pointer"
                                >
                                  Позвонить
                                </a>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleAcceptOrder(order.id)}
                              className="w-full bg-[#27272a] hover:bg-[#fbbf24] hover:text-black border border-white/5 hover:border-transparent text-white font-bold py-3 px-4 rounded-xl flex items-center justify-between transition-all duration-200 cursor-pointer active:scale-[0.98]"
                            >
                              <span className="text-xs uppercase tracking-wider">Принять за контакт</span>
                              <span className="text-xs bg-[#fbbf24]/10 group-hover:bg-black/10 px-2 py-0.5 rounded-md border border-white/5 font-extrabold text-[#fbbf24] group-hover:text-black">
                                -1.00 TMT
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="max-w-7xl w-full mx-auto mt-8 pt-4 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#a1a1aa]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-[#fbbf24] rounded-full"></span>
          <span>Новостной портал "Сайт Х" — Демонстрационный MVP такси-аукциона</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Среда тестирования</span>
          <span>Баланс водителя изменяется в реальном времени</span>
        </div>
      </footer>

      {/* TOASTS NOTIFICATIONS CONTAINER */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl border shadow-xl flex items-start gap-3 animate-slide-in duration-300 ${
              toast.type === "success"
                ? "bg-[#12221b] border-[#10b981]/30 text-[#4ade80]"
                : toast.type === "error"
                ? "bg-[#271616] border-red-500/30 text-red-400"
                : "bg-[#1b1e24] border-[#fbbf24]/30 text-[#fbbf24]"
            }`}
          >
            {toast.type === "success" && <CheckCircle size={18} className="shrink-0 mt-0.5" />}
            {toast.type === "error" && <AlertCircle size={18} className="shrink-0 mt-0.5" />}
            {toast.type === "info" && <Info size={18} className="shrink-0 mt-0.5" />}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider">
                {toast.type === "success" ? "Успешно" : toast.type === "error" ? "Ошибка" : "Информация"}
              </p>
              <p className="text-xs mt-0.5 font-medium leading-relaxed">{toast.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

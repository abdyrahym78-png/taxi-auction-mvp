import React, { useState, useEffect, useRef } from "react";
import { 
  MapPin, 
  Navigation, 
  Phone, 
  User, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Plus, 
  Trash2, 
  Car, 
  Info,
  Map as MapIcon,
  Search,
  Check
} from "lucide-react";
import L from "leaflet";

interface Order {
  id: string;
  fromLocation: string;
  toLocation: string;
  fromCoords?: [number, number]; // [lat, lng]
  toCoords?: [number, number];   // [lat, lng]
  price: number;
  status: "active" | "accepted";
  passengerPhone: string;
  acceptedBy?: string;
}

interface Driver {
  id: string;
  name: string;
  totalRides: number;
  rating: number;
}

interface Toast {
  message: string;
  type: "success" | "error" | "info";
  id: number;
}

// Turkmenistan regions preset for quick selection
const TURKMENISTAN_REGIONS = [
  { name: "Ашхабад (Столица)", center: [37.9601, 58.3261] as [number, number], zoom: 12 },
  { name: "Аркадаг (Новый город)", center: [38.0500, 58.1000] as [number, number], zoom: 13 },
  { name: "Ахалский велаят (Анау/Бахарден)", center: [37.9000, 58.5000] as [number, number], zoom: 9 },
  { name: "Марыйский велаят (Мары/Мерв)", center: [37.5955, 61.8306] as [number, number], zoom: 10 },
  { name: "Лебапский велаят (Туркменабат)", center: [39.0855, 63.5786] as [number, number], zoom: 10 },
  { name: "Дашогузский велаят (Дашогуз)", center: [41.8368, 59.9666] as [number, number], zoom: 10 },
  { name: "Балканский велаят (Туркменбаши/Балканабат)", center: [39.5122, 54.3644] as [number, number], zoom: 9 },
];

const popularLocations = [
  { name: "Аэропорт", lat: 37.9893, lng: 58.3614 },
  { name: "ТЦ Беркарар", lat: 37.9250, lng: 58.3833 },
  { name: "Вокзал", lat: 37.9450, lng: 58.3500 }, // примерные координаты
  { name: "Ямпаш", lat: 37.9300, lng: 58.3900 }   // примерные координаты
];

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("driver_1");
  
  // Order form state
  const [fromLocation, setFromLocation] = useState<string>("");
  const [toLocation, setToLocation] = useState<string>("");
  const [fromCoords, setFromCoords] = useState<[number, number] | null>(null);
  const [toCoords, setToCoords] = useState<[number, number] | null>(null);
  const [price, setPrice] = useState<string>("");
  const [passengerPhone, setPassengerPhone] = useState<string>(() => {
    return localStorage.getItem("passengerPhone") || "";
  });

  // ЗАДАЧА 2: Сохранение номера телефона в localStorage
  useEffect(() => {
    const savedPhone = localStorage.getItem("passengerPhone");
    if (savedPhone) {
      setPassengerPhone(savedPhone);
    }
  }, []);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPassengerPhone(val);
    localStorage.setItem("passengerPhone", val);
  };
  
  // Selection mode on map: 'from' or 'to' or null
  const [mapSelectingMode, setMapSelectingMode] = useState<"from" | "to" | null>("from");
  const [selectedRegionIndex, setSelectedRegionIndex] = useState<number>(0);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});

  // Leaflet map refs
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { message, type, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

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

  useEffect(() => {
    fetchDrivers();
    fetchOrders();

    const interval = setInterval(() => {
      fetchDrivers();
      fetchOrders();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Address Geocoding helper via Nominatim
  const getAddressFromCoords = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru`,
        {
          headers: {
            "User-Agent": "TaxiAuctionMVP/1.0 (abdyrahym78@gmail.com)"
          }
        }
      );
      if (!response.ok) throw new Error("Nominatim API error");
      const data = await response.json();
      if (data && data.display_name) {
        // Берем только первые 3 части адреса для краткости (Улица, Город, Велаят)
        const shortAddress = data.display_name.split(",").slice(0, 3).join(",").trim();
        return shortAddress;
      }
      return `Координаты [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
    } catch (error) {
      console.error("Ошибка геокодирования:", error);
      return `Координаты [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstanceRef.current) {
      // Center on Turkmenistan (Ashgabat default)
      const map = L.map(mapRef.current, {
        center: [37.9601, 58.3261],
        zoom: 12,
        zoomControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // OpenStreetMap Free Tile Layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Layer group for dynamic markers
      const markerGroup = L.layerGroup().addTo(map);
      markersRef.current = markerGroup;

      // Click on map listener to pick coordinates
      map.on("click", async (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        const loadingText = "📍 Определение адреса...";
        if (mapSelectingMode === "from" || !mapSelectingMode) {
          setFromCoords([lat, lng]);
          setFromLocation(loadingText);
          setMapSelectingMode("to");
          const address = await getAddressFromCoords(lat, lng);
          setFromLocation(address);
          showToast(`Пункт А установлен: ${address}`, "success");
        } else if (mapSelectingMode === "to") {
          setToCoords([lat, lng]);
          setToLocation(loadingText);
          setMapSelectingMode(null);
          const address = await getAddressFromCoords(lat, lng);
          setToLocation(address);
          showToast(`Пункт Б установлен: ${address}`, "success");
        }
      });

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map markers whenever fromCoords, toCoords, or orders change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markerGroup = markersRef.current;
    if (!map || !markerGroup) return;

    markerGroup.clearLayers();

    // Custom Icon helper
    const createCustomPin = (label: string, color: string) => {
      return L.divIcon({
        className: "custom-leaflet-pin",
        html: `<div style="background-color: ${color}; color: black; font-weight: 900; font-size: 11px; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.4);">${label}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
    };

    // Add Point A marker if selected
    if (fromCoords) {
      L.marker(fromCoords, {
        icon: createCustomPin("А", "#fbbf24"),
      })
        .addTo(markerGroup)
        .bindPopup(`<b>Пункт А (Откуда)</b><br/>${fromLocation}`);
    }

    // Add Point B marker if selected
    if (toCoords) {
      L.marker(toCoords, {
        icon: createCustomPin("Б", "#10b981"),
      })
        .addTo(markerGroup)
        .bindPopup(`<b>Пункт Б (Куда)</b><br/>${toLocation}`);
    }

    // Also plot active orders on the map if they have coordinates
    orders.forEach((ord) => {
      if (ord.fromCoords) {
        L.marker(ord.fromCoords, {
          icon: createCustomPin("🚗", "#3b82f6"),
        })
          .addTo(markerGroup)
          .bindPopup(`<b>Заказ #${ord.id.replace("order_", "")}</b><br/>Откуда: ${ord.fromLocation}<br/>Куда: ${ord.toLocation}<br/>Цена: <b>${ord.price} TMT</b>`);
      }
    });
  }, [fromCoords, toCoords, fromLocation, toLocation, orders]);

  // Draw route line between fromCoords and toCoords
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove existing route line if present
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    if (fromCoords && toCoords) {
      // Create dashed polyline for route visualization
      const polyline = L.polyline([fromCoords, toCoords], {
        color: "#fbbf24",
        weight: 4,
        opacity: 0.8,
        dashArray: "8, 12",
      }).addTo(map);

      routeLineRef.current = polyline;

      // Fit map bounds to show both points with some padding
      const bounds = L.latLngBounds([fromCoords, toCoords]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [fromCoords, toCoords]);
  const handleRegionChange = (index: number) => {
    setSelectedRegionIndex(index);
    const region = TURKMENISTAN_REGIONS[index];
    if (mapInstanceRef.current && region) {
      mapInstanceRef.current.setView(region.center, region.zoom);
      showToast(`Карта перемещена: ${region.name}`, "info");
    }
  };

  const activeDriver = drivers.find((d) => d.id === selectedDriverId) || {
    id: "driver_1",
    name: "Аман (Aman)",
    totalRides: 12,
    rating: 5.0,
  };

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
          fromCoords,
          toCoords,
          price: numericPrice,
          passengerPhone,
        }),
      });

      if (res.ok) {
        showToast("Заказ успешно опубликован в прямом эфире!", "success");
        setFromLocation("");
        setToLocation("");
        setFromCoords(null);
        setToCoords(null);
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

  // Direct connection acceptance (100% Free, no commission)
  const handleAcceptOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: selectedDriverId }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast("Связь установлена! Телефон пассажира открыт бесплатно.", "success");
        setRevealedPhones((prev) => ({
          ...prev,
          [orderId]: data.passengerPhone,
        }));
        fetchDrivers();
        fetchOrders();
      } else {
        showToast(data.error || "Не удалось принять заказ", "error");
      }
    } catch (err) {
      showToast("Ошибка сети при установке связи", "error");
    }
  };

  const handleResetSystem = async () => {
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (res.ok) {
        showToast("Данные успешно сброшены в исходное состояние", "info");
        setRevealedPhones({});
        setFromCoords(null);
        setToCoords(null);
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
      <div className="max-w-7xl w-full mx-auto space-y-6 flex-grow">
        
        {/* HEADER BENTO CARD */}
        <header id="bento-header" className="bg-[#18181b] border border-white/10 rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#fbbf24]/5 rounded-full filter blur-3xl pointer-events-none"></div>
          
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#fbbf24] rounded-xl flex items-center justify-center text-black font-black text-2xl shadow-lg shadow-[#fbbf24]/20">
              TM
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">SAYT X TAXI</h1>
                <span className="text-[10px] bg-[#fbbf24]/20 text-[#fbbf24] border border-[#fbbf24]/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Прямая связь • 100% Бесплатно
                </span>
              </div>
              <p className="text-xs text-[#a1a1aa] mt-0.5">
                Прямое связывание пассажира и водителя по всему Туркменистану без комиссий и балансов
              </p>
            </div>
          </div>

          {/* Test Driver Switcher & Stats */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
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
                Аман (⭐ 5.0)
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
                Ресул (⭐ 4.9)
              </button>
            </div>

            <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-xl p-2 px-4 flex items-center justify-between sm:justify-start gap-4 shadow-inner min-w-[200px]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#fbbf24]/20 flex items-center justify-center text-[#fbbf24]">
                  <Car size={16} />
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#fbbf24] font-bold tracking-wider">Рейсы водителя</div>
                  <div className="text-base font-black tracking-tight text-white tabular-nums">
                    {activeDriver.totalRides} поездок (Бесплатно)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* MAP & LOCATION SELECTOR BENTO ROW */}
        <section className="bg-[#18181b] border border-white/10 rounded-2xl p-5 md:p-6 space-y-4 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-[#fbbf24] rounded-full"></div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">Карта Туркменистана (OpenStreetMap)</h2>
                <p className="text-xs text-[#a1a1aa]">
                  Выберите велаят или кликните прямо на карту для установки точки А (Откуда) и точки Б (Куда)
                </p>
              </div>
            </div>

            {/* Region Switcher Dropdown & Selection Mode Indicators */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedRegionIndex}
                onChange={(e) => handleRegionChange(Number(e.target.value))}
                className="bg-[#27272a] border border-[#3f3f46] text-white text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-[#fbbf24]"
              >
                {TURKMENISTAN_REGIONS.map((reg, idx) => (
                  <option key={idx} value={idx}>
                    📍 {reg.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center bg-[#27272a] p-1 rounded-xl border border-white/5 text-xs">
                <button
                  type="button"
                  onClick={() => setMapSelectingMode("from")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                    mapSelectingMode === "from"
                      ? "bg-[#fbbf24] text-black shadow"
                      : "text-[#a1a1aa] hover:text-white"
                  }`}
                >
                  <MapPin size={12} />
                  Точка А {fromCoords ? "✓" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setMapSelectingMode("to")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                    mapSelectingMode === "to"
                      ? "bg-[#10b981] text-white shadow"
                      : "text-[#a1a1aa] hover:text-white"
                  }`}
                >
                  <Navigation size={12} />
                  Точка Б {toCoords ? "✓" : ""}
                </button>
              </div>
            </div>
          </div>

          {/* Leaflet Map Container */}
          <div className="relative w-full h-[360px] md:h-[420px] rounded-xl overflow-hidden border border-white/10 shadow-inner">
            <div ref={mapRef} className="w-full h-full z-10" />
            
            {/* Floating helper banner on map */}
            <div className="absolute top-3 left-3 z-20 bg-black/80 backdrop-blur-md border border-white/10 px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 shadow-lg">
              <span className="w-2.5 h-2.5 rounded-full animate-ping bg-[#fbbf24]"></span>
              <span className="font-semibold text-white">
                Режим выбора: <strong className="text-[#fbbf24] uppercase">{mapSelectingMode === "from" ? "Пункт А (Откуда)" : mapSelectingMode === "to" ? "Пункт Б (Куда)" : "Просмотр"}</strong>. Кликните на карту.
              </span>
            </div>
          </div>
        </section>

        {/* BENTO GRID: CREATE ORDER & LIVE FEED */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* SIDEBAR PANE: Create Order */}
          <aside className="lg:col-span-4 bg-[#18181b] border border-white/10 rounded-2xl p-5 md:p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 bg-[#fbbf24] rounded-full"></div>
                <h2 className="text-lg font-bold tracking-tight">Создать заказ</h2>
              </div>
              <p className="text-xs text-[#a1a1aa]">
                Заполните пункты маршрута (или выберите на карте), цену в манатах и телефон для прямой связи.
              </p>
              
              <form onSubmit={handleCreateOrder} className="space-y-4 pt-2">
                {/* Point A */}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#a1a1aa] font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin size={12} className="text-[#fbbf24]" />
                      Откуда (Пункт А)
                    </span>
                    <button
                      type="button"
                      onClick={() => setMapSelectingMode("from")}
                      className="text-[10px] text-[#fbbf24] hover:underline"
                    >
                      Выбрать на карте
                    </button>
                  </label>
                  <input
                    type="text"
                    value={fromLocation}
                    onChange={(e) => setFromLocation(e.target.value)}
                    placeholder="Например: Ашхабад, ТЦ Беркарар"
                    className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl px-4 py-3 text-sm text-white placeholder-[#71717a] focus:outline-none focus:border-[#fbbf24]"
                    required
                  />
                  {/* ЗАДАЧА 1: Быстрые кнопки-ориентиры (Чипсы) */}
                  <div className="flex overflow-x-auto gap-2 py-1 scrollbar-thin scrollbar-thumb-[#3f3f46]">
                    {popularLocations.map((loc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setFromLocation(loc.name);
                          setFromCoords([loc.lat, loc.lng]);
                          showToast(`Выбрано: ${loc.name}`, "success");
                        }}
                        className="whitespace-nowrap bg-[#27272a] hover:bg-[#fbbf24] hover:text-black text-[#a1a1aa] border border-[#3f3f46] hover:border-transparent text-xs px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer"
                      >
                        📍 {loc.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Point B */}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#a1a1aa] font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Navigation size={12} className="text-[#10b981]" />
                      Куда (Пункт Б)
                    </span>
                    <button
                      type="button"
                      onClick={() => setMapSelectingMode("to")}
                      className="text-[10px] text-[#10b981] hover:underline"
                    >
                      Выбрать на карте
                    </button>
                  </label>
                  <input
                    type="text"
                    value={toLocation}
                    onChange={(e) => setToLocation(e.target.value)}
                    placeholder="Например: Аэропорт Ашхабада"
                    className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl px-4 py-3 text-sm text-white placeholder-[#71717a] focus:outline-none focus:border-[#10b981]"
                    required
                  />
                </div>

                {/* Price */}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#a1a1aa] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    Цена поездки (TMT)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Например: 35"
                      min="1"
                      step="1"
                      className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder-[#71717a] focus:outline-none focus:border-[#fbbf24]"
                      required
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#fbbf24]">
                      TMT
                    </span>
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#a1a1aa] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <Phone size={12} className="text-[#fbbf24]" />
                    Телефон пассажира
                  </label>
                  <input
                    type="tel"
                    pattern="^\+993[0-9]{8}$"
                    value={passengerPhone}
                    onChange={handlePhoneChange}
                    placeholder="+99365123456"
                    className="w-full bg-[#27272a] border border-[#3f3f46] rounded-xl px-4 py-3 text-sm text-white placeholder-[#71717a] focus:outline-none focus:border-[#fbbf24]"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#fbbf24] hover:bg-[#fbbf24]/90 disabled:opacity-50 text-black font-extrabold py-3.5 px-4 rounded-xl shadow-lg transition-all active:scale-[0.98] text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-4"
                >
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
                  Опубликовать заказ
                </button>
              </form>
            </div>

            <div className="border-t border-white/5 pt-4 space-y-3">
              <div className="flex gap-2.5 items-start text-xs text-[#a1a1aa] bg-white/2 p-3 rounded-xl border border-white/5">
                <Info size={16} className="text-[#fbbf24] shrink-0 mt-0.5" />
                <p>
                  Все финансовые модули, балансы и комиссии полностью удалены. Прямая связь пассажира и водителя бесплатна.
                </p>
              </div>

              <button
                onClick={handleResetSystem}
                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2.5 px-4 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 size={13} />
                Сбросить демонстрационные данные
              </button>
            </div>
          </aside>

          {/* MAIN PANE: Live Orders Feed */}
          <main className="lg:col-span-8 bg-[#18181b] border border-white/10 rounded-2xl p-5 md:p-6 flex flex-col space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-[#fbbf24] rounded-full"></div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Эфир заказов Туркменистана</h2>
                  <p className="text-xs text-[#a1a1aa]">
                    Прямая связь между клиентом и водителями по всей стране
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span className="text-xs bg-[#27272a] text-[#a1a1aa] px-3 py-1.5 rounded-lg border border-white/5 font-semibold">
                  {orders.length} активных
                </span>
                <button
                  onClick={() => fetchOrders(true)}
                  disabled={refreshing}
                  className="bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] border border-[#3f3f46] p-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin text-[#fbbf24]" : ""} />
                  Обновить ↻
                </button>
              </div>
            </div>

            <div className="flex-grow">
              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-3 bg-[#27272a]/10 rounded-2xl border border-dashed border-white/5">
                  <Car size={40} className="text-[#a1a1aa] opacity-40 animate-pulse" />
                  <div className="text-sm font-semibold text-white">Нет активных заказов</div>
                  <p className="text-xs text-[#a1a1aa] max-w-sm">
                    Создайте заказ слева или выберите точку на карте Туркменистана.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {orders.map((order) => {
                    const isRevealed = !!revealedPhones[order.id];
                    const isAccepted = order.status === "accepted" || isRevealed;

                    return (
                      <div
                        key={order.id}
                        className={`relative overflow-hidden rounded-2xl border p-5 flex flex-col justify-between transition-all duration-200 ${
                          isAccepted
                            ? "bg-[#10b981]/5 border-[#10b981]/40 shadow-lg"
                            : "bg-[#18181b] border-white/5 hover:border-[#fbbf24]/50"
                        }`}
                      >
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] text-[#a1a1aa] uppercase font-bold tracking-widest block mb-0.5">
                                Заказ #{order.id.replace("order_", "")}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${isAccepted ? "bg-[#10b981]" : "bg-[#fbbf24] animate-pulse"}`}></span>
                                <span className={`text-xs font-bold uppercase tracking-wide ${isAccepted ? "text-[#10b981]" : "text-[#fbbf24]"}`}>
                                  {isAccepted ? "Связь установлена" : "Ищет водителя"}
                                </span>
                              </div>
                            </div>

                            <div className="bg-[#fbbf24]/15 border border-[#fbbf24]/30 px-3 py-1.5 rounded-xl flex items-baseline gap-1 shadow-inner">
                              <span className="text-xl font-black text-[#fbbf24] tracking-tight">{order.price}</span>
                              <span className="text-[10px] text-[#fbbf24] font-bold">TMT</span>
                            </div>
                          </div>

                          <div className="relative pl-6 space-y-4 py-1">
                            <div className="absolute left-[7px] top-[14px] bottom-[14px] w-[2px] border-l border-dashed border-white/10"></div>
                            
                            <div className="relative">
                              <span className="absolute left-[-23px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#27272a] border border-[#fbbf24]/60 flex items-center justify-center text-[8px] text-[#fbbf24] font-black">
                                А
                              </span>
                              <div className="text-[10px] text-[#a1a1aa] font-bold uppercase">Откуда</div>
                              <p className="text-sm font-semibold text-white line-clamp-1">{order.fromLocation}</p>
                            </div>

                            <div className="relative">
                              <span className="absolute left-[-23px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#27272a] border border-[#10b981]/60 flex items-center justify-center text-[8px] text-[#10b981] font-black">
                                Б
                              </span>
                              <div className="text-[10px] text-[#a1a1aa] font-bold uppercase">Куда</div>
                              <p className="text-sm font-semibold text-white line-clamp-1">{order.toLocation}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 pt-3 border-t border-white/5">
                          {isAccepted ? (
                            <div className="space-y-2">
                              <div className="text-[10px] font-bold uppercase text-[#10b981] tracking-wider text-center">
                                Прямая связь (Без комиссий)
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
                              <span className="text-xs uppercase tracking-wider">Связаться с пассажиром</span>
                              <span className="text-xs bg-[#10b981]/20 px-2 py-0.5 rounded-md font-extrabold text-[#4ade80]">
                                Бесплатно
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

      <footer className="max-w-7xl w-full mx-auto mt-8 pt-4 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#a1a1aa]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-[#fbbf24] rounded-full"></span>
          <span>SAYT X TAXI — Прямое связывание клиента и водителя по всему Туркменистану</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Leaflet + OpenStreetMap</span>
          <span>Без комиссий и кошельков</span>
        </div>
      </footer>

      {/* TOASTS CONTAINER */}
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

# QR-Vehicle-Alert

Aviso por **SMS** (EE. UU.) cuando un cliente de rent-a-car deja un vehículo y escanea un **código QR**.
Objetivo: que un empleado mueva el auto rápido y **evitar multas (parking tickets)**.

## Flujo

```
Cliente llega ──► deja las llaves en el buzón ──► escanea el QR del punto de devolución
                                                          │
                                         página móvil (EN/ES): placa, dónde lo dejó,
                                         GPS automático, "dejé las llaves" ✓
                                                          │
                 UN SMS (una sola vez) a los empleados seleccionados del punto,
                 o a todos si el punto no tiene "notify" (Twilio)
                              "DEVOLUCION #1042 - Miami Airport
                               Placa: FLA1234 / Lugar: Carril 3 / Mapa: ..."
```

No hay respuestas, asignación ni recordatorios: cada empleado recibe el aviso una sola vez.

Extras incluidos:
- **Anti-duplicados**: si escanean dos veces la misma placa en 15 min, no se reenvía el SMS.
- **Anti-spam**: máximo 5 envíos por IP cada 10 min + campo trampa para bots.
- SMS en **texto GSM-7** (sin emojis/acentos) para usar menos segmentos y pagar menos.
- **Modo DRY_RUN**: sin credenciales de Twilio los SMS solo se imprimen en consola (para probar).

## Demo en línea

**https://copy0096.github.io/QR-Vehicle-Alert/**

Versión estática (GitHub Pages) del flujo del cliente: escanee un QR o toque un punto de devolución,
llene el formulario y la página muestra el SMS que recibirían los empleados. **No envía SMS reales.**
Usa la misma página y la misma lógica de alertas que el servidor, ejecutadas en el navegador.

Se genera en `docs/` con `npm run demo:build`; vuelva a ejecutarlo y suba `docs/` después de cambiar
la página, los textos del SMS o `config/locations.json`.

## Requisitos

- Node.js 18+
- Cuenta de [Twilio](https://www.twilio.com) con un número de EE. UU.
- Un servidor con URL pública HTTPS (Render, Railway, Fly.io, un VPS, etc.)

## Instalación

```bash
npm install
cp .env.example .env      # complete sus datos
npm test                  # pruebas automáticas
npm start                 # http://localhost:3000/r/mia-airport
```

### 1. Configurar puntos de devolución — `config/locations.json`

```json
[
  { "id": "mia-airport", "name": "Miami Airport (MIA)", "address": "...",
    "instructions": "Texto que ve el cliente al escanear" },
  { "id": "brickell", "name": "Brickell Office", "notify": ["Ana", "Carlos"] }
]
```

`notify` es opcional: si se omite, se avisa a **todos** los empleados de `EMPLOYEES`.

### 2. Empleados — `.env`

```
EMPLOYEES=Ana:+13055550101,Luis:+13055550102,Carlos:+13055550103
SMS_LANG=es            # o "en"
TZ=America/New_York
```

### 3. Generar e imprimir los QR

```bash
BASE_URL=https://su-dominio.com npm run qr
```

Crea `qr-codes/<id>.png` (1200 px) y `.svg` para cada punto. Imprímalos junto al buzón de llaves,
laminados, con un texto tipo *"Drop keys & scan to notify our staff / Deje las llaves y escanee"*.

### 4. Conectar Twilio

1. En `.env`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_MESSAGING_SERVICE_SID`
   (o `TWILIO_FROM_NUMBER`).
2. `BASE_URL` debe ser la URL pública del servidor (es la que va dentro de los QR).

## ⚠️ Importante en EE. UU.: registro A2P 10DLC

Los operadores de EE. UU. (AT&T, T-Mobile, Verizon) **bloquean** SMS de aplicaciones enviados desde
números locales sin registrar. Antes de producción haga **una** de estas opciones en Twilio:

| Opción | Tiempo aprox. | Notas |
|---|---|---|
| **A2P 10DLC** (número local) | 1–3 semanas | Registrar *Brand* (su empresa, EIN) + *Campaign* tipo "Account Notifications / internal staff alerts". |
| **Toll-Free Verification** (número 8XX) | días–2 semanas | Suele ser más simple para avisos internos. |

Consejos para que aprueben la campaña:
- Describa el caso como *"internal operational alerts to our own employees about returned rental vehicles"*.
- Los empleados deben dar su **consentimiento** (opt-in) para recibir los SMS — guárdelo por escrito (p. ej., en el formulario de alta del empleado).
- Twilio gestiona automáticamente **STOP / HELP**.

Costo orientativo: ~US$0.008–0.01 por SMS + tarifa de operador, por empleado avisado.

## API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/r/:locationId` | Página que abre el QR |
| POST | `/api/returns` | Envío del formulario (JSON) |
| GET | `/api/alerts` | Historial (header `Authorization: Bearer $ADMIN_TOKEN`) |
| GET | `/health` | Estado |

## Estructura

```
src/server.js     arranque
src/app.js        rutas HTTP, rate limit
src/alerts.js     lógica: crear alerta y enviar el SMS
src/messages.js   textos de los SMS (es / en)
src/sms.js        cliente Twilio (o DRY_RUN)
src/store.js      persistencia simple en data/alerts.json
src/page.js       HTML de la página del cliente
public/           CSS + JS de la página (bilingüe, GPS)
scripts/generate-qr.js
scripts/build-demo.js  demo estática en docs/ (GitHub Pages)
```

> El almacenamiento es un archivo JSON, pensado para **una sola instancia** del servidor.
> al momento de escalar a varias instancias, cámbiar por una base de datos (Postgres, Redis…).

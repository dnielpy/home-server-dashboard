# Mapa de datos del home server para Astro

Verificado contra los repositorios y las APIs activas del servidor el 14 de noviembre de 2026. Esta guía es para consultas de **solo lectura** desde OpenClaw, que corre en el mismo servidor.

## Arquitectura y direcciones reales

```text
Navegador → Home Server Dashboard web :3020
                    ├─ páginas principales → Dashboard API :3021
                    ├─ páginas de energía → Bluetti API :3001
                    └─ páginas de red → Home Net API :3003

Dashboard API :3021 ─┬─ Bluetti API :3001
                     ├─ Home Net API :3003
                     ├─ LocalTube API :3005
                     └─ agente del host :3022 (systemd)

Astro (OpenClaw, en el host) → http://127.0.0.1:<puerto>
```

| Servicio | URL desde Astro | Función |
| --- | --- | --- |
| Dashboard web | `http://127.0.0.1:3020` | Interfaz, no hace falta para preguntas del bot. |
| Dashboard API | `http://127.0.0.1:3021` | Agrega métricas y gestiona las descargas de Tools. Punto de entrada preferido. |
| Bluetti API | `http://127.0.0.1:3001` | Datos Bluetooth e históricos de batería y energía. |
| Home Net API | `http://127.0.0.1:3003` | Nano, conexión, ancho de banda, dispositivos y cortes. |
| LocalTube API | `http://127.0.0.1:3005` | Vídeos y perfiles. Sus rutas de estadísticas requieren token. |
| Agente del host | `http://127.0.0.1:3022` | CPU, RAM, discos, tráfico del propio servidor y proyectos. |

Los contenedores de Dashboard usan `host.docker.internal` para llegar a las APIs del host. El **puerto Home Net en producción es 3003**; algunos ejemplos del repositorio muestran 3011, que es el puerto dentro del contenedor. La API de Dashboard usa `HOMENET_API_URL=http://host.docker.internal:3003`. Los puertos y las direcciones anteriores se comprobaron con los servicios activos, no solo con los archivos de ejemplo.

## Consulta única para «resumen completo de mis sistemas»

En el workspace de Astro, ejecutar:

```sh
python3 /mnt/localtube/openclaw/state/workspace/bin/system_snapshot.py
```

El script hace únicamente `GET` a las APIs locales, en paralelo, y entrega JSON con `checked_at` y `checks`. Cada entrada trae `ok: true` y `data`, o `ok: false` y `error`. Así un fallo de LocalTube no oculta el estado de la batería. Para mantener la respuesta breve, `power` trae `period_count_24h` y `recent_periods` (últimos cinco); `internet_outages_24h` trae `count` y `recent` (últimos diez). El script elimina la URL de cada descarga de Tools porque puede contener credenciales. Para una lista histórica completa, usa la ruta GET correspondiente. Interpreta los datos, muestra la hora de medición y declara cada fuente que falló. No confundas un error con un valor cero.

Para redactar el resumen:

1. **Salud:** `dashboard_health` y `sources`. `sources` cubre Bluetti, Home Net y LocalTube; la salud del agente se infiere de `server` o `projects`.
2. **Energía:** `battery` (`soc`, `state`, `load_w`, `hours_left`, `eta`); `battery_detail` (`computed_at`, `status`, `soc_estimate`, rangos de ETA); `power` (`receiving_ac`, `outage_ongoing`, horas con/sin red en 24 h). Revisa `computed_at` y `status` antes de decir «ahora».
3. **Internet:** `internet_status` (`online`, `break_at`, último corte y horas online/offline), `internet_outages_24h` y `network_speed` (descarga/subida instantánea del Nano). `network_usage_24h` es consumo acumulado, no velocidad. `last_speed_test` es un test guardado, no el ancho de banda actual.
4. **Servidor:** `server` (`updated_at`, `cpu_percent`, `memory.percent`, `disks`, `network`, `boot`) y `projects` (estado de los cuatro proyectos y contenedores). Distingue tráfico de la NIC del servidor de tráfico WAN del Nano.
5. **Descargas:** `localtube.downloading.items` incluye la cola de LocalTube, con `status`, `progress`, `speed`, `eta`.
6. **LocalTube:** `localtube.watch_time` es el tiempo por perfil **acumulado desde siempre**. Para las últimas 24 h hace falta la ruta original con token; ver abajo.

Conversión: `bytes/s × 8 / 1 000 000 = Mb/s`; `bytes / 1 000 000 000 = GB` decimales. Indica unidades. `rx` del Nano es descarga y `tx` es subida. `network.rx_bytes_per_second` del servidor mide solo su interfaz predeterminada.

## Rutas agregadas de Dashboard API (`:3021`)

| Pregunta | GET | Respuesta y origen |
| --- | --- | --- |
| ¿Funciona la API? | `/health` | Salud de Dashboard API. |
| ¿Funcionan los servicios? | `/dashboard/status` | `source`, `up`, `since`, `detail` para Bluetti, Home Net y LocalTube; son checks cada 30 s. |
| ¿Cuánta batería queda? | `/dashboard/battery` | `soc` %, `state`, `load_w` W, `reserve_percent`, `hours_left`, `eta`, `eta_kind`; Bluetti `/battery-estimate`. |
| ¿Hay corriente de la calle? | `/dashboard/power` | `receiving_ac`, `outage_ongoing`, `with_power_hours`, `without_power_hours`, `periods` en 24 h; Bluetti `/power-totals` y `/power-periods`. |
| ¿Cómo fue la batería? | `/dashboard/battery/history` | `points[{at,soc,load_w}]` de 24 h; Bluetti `/battery-status` y `/ac-output-history`. |
| ¿Cuál es el ancho de banda actual? | `/dashboard/network/speed` | `measured_at`, `rx_bytes_per_second`, `tx_bytes_per_second`; Home Net `/connection/throughput/current`, lectura del Nano de ~1 s. |
| ¿Cuánto tráfico hubo? | `/dashboard/network/usage` | Totales `total_rx_bytes`, `total_tx_bytes`, `top_device`, `hourly` de 24 h; Home Net `/bandwidth` y `/device-usage`. |
| ¿Cuál fue la última prueba de velocidad? | `/dashboard/network/speed-test` | `measured_at`, `download_mbps`, `ping_ms`, o `null`; test guardado por Home Net, normalmente cada 10 min. |
| ¿Qué descarga LocalTube? | `/dashboard/localtube` | `downloading.count/items` y `watch_time`; Dashboard añade el token de servicio necesario. |
| ¿Cómo está el servidor? | `/dashboard/system` | `updated_at`, CPU %, memoria, discos, red y arranque; agente `/system`. |
| ¿Tráfico histórico del servidor? | `/dashboard/system/traffic` | 7 días, promedios por 15 min; agente `/system/traffic`. |
| ¿Qué proyectos/containers hay? | `/management/projects` | `name`, `branch`, `service.up`, `service.since`, `behind`, `updating`, etc.; agente `/projects`. |

Dashboard devuelve `502` y `source` si una fuente falla. Las consultas al upstream tienen límite de 8 segundos. Un dato ausente o `null` significa que no hay medición suficiente o que la fuente no respondió; nunca lo reemplaces por cero.

## Rutas originales para preguntas concretas

**Energía, Bluetti `:3001`:**

| GET | Uso |
| --- | --- |
| `/battery-estimate` | Estimación completa; `computed_at` y `status` ayudan a detectar datos viejos. `load_w` es promedio reciente de salida AC de Bluetti. |
| `/power-status` | Estado y momento de último cambio de alimentación AC. |
| `/power-totals?hours=24`, `/power-periods?hours=24`, `/blackouts?hours=24` | Resúmenes y cortes históricos. |
| `/battery-status?hours=24`, `/ac-output-history?hours=24`, `/data-summary?page_size=1` | Series y último registro guardado. |
| `/battery`, `/ac-output`, `/dc-output`, `/ac-input`, `/dc-input` | Lecturas Bluetooth directas; pueden tardar o fallar si Bluetti no responde. |

El límite de series de Bluetti es 168 h. **Bluetti no mide exclusivamente los vatios del servidor**: `load_w` es la salida AC total conectada. El agente del host no tiene medidor eléctrico. Para decir «el servidor consume X W» hace falta un medidor dedicado o estimación explícita; no presentes la carga Bluetti como tal.

**Red, Home Net `:3003`:**

| GET | Uso |
| --- | --- |
| `/connection-status`, `/connection/latest`, `/connection/hops` | Estado, último chequeo guardado (aprox. cada 30 s), e identidad de los saltos. |
| `/connection/live`, `/connection/live/{hop}` | Pings nuevos para diagnosticar exactamente dónde se corta. |
| `/connection/throughput/current` | Velocidad instantánea del Nano; puede devolver 503 si Nano no está disponible. |
| `/speed-test/latest` | Última prueba guardada. |
| `/connection-history?hours=24`, `/outages?hours=24` | Historial y caídas de Internet. |
| `/bandwidth?hours=24&bucket=hour`, `/device-usage?hours=24` | Uso acumulado por tiempo y dispositivos. |
| `/devices`, `/devices/{mac}/history?hours=24&bucket=hour` | Lista de dispositivos e historial de uno. |

No ejecutes `POST /speed-test` para un resumen: lanza una prueba nueva y consume ancho de banda. Tampoco hagas operaciones de bloqueo o cambio de límites de dispositivos sin una petición específica.

**LocalTube `:3005`:** `GET /api/health` y `GET /api/status` son consultas de estado. `GET /api/stats/downloads/active` y `GET /api/stats/watch-time` (opcional `?hours=24`) requieren la cabecera secreta `X-Service-Token`. Para el resumen usa `/dashboard/localtube` y así no necesitas manejar el secreto. Las descargas históricas por perfil requieren autenticación de ese perfil; la ruta agregada muestra trabajos activos y pendientes, no todo el catálogo.

**Agente `:3022`:** `GET /system` y `/system/traffic` leen `/proc`, discos y el historial local de métricas; `/projects` lee proyectos y Docker. Los discos que aparecen son `/` y `/mnt/localtube` cuando el externo está montado. `boot.last_shutdown.clean=false` indica que el apagado previo no fue normal. Para el bot, usa sus equivalentes agregados en `:3021`.

## Dónde se implementa cada conexión

- Dashboard API: `apps/api/app/routers/dashboard.py`, `apps/api/app/clients/{bluetti,homenet,localtube,agent}.py`, `apps/api/app/clients/upstream.py`, `apps/api/app/schemas.py`.
- Web principal: `apps/web/lib/api.ts`, tarjetas en `apps/web/components/dashboard/`; las lecturas en vivo pasan por `/api/network-speed` y `/api/system` en Next.js.
- Web de energía: `apps/web/lib/bluetti-api.ts`; web de red: `apps/web/lib/homenet-api.ts`.
- En el servidor, repositorios en `/home/lianny/home-server/{home-server-dashboard,bluetti-powerstation-api,home-net-dashboard,local-tube}`. La configuración activa de Dashboard está en `/home/lianny/home-server/home-server-dashboard/.env.production` (contiene secretos: no copiar ni citar sus valores sensibles).
- Agente y OpenClaw: servicios de usuario `home-server-agent.service` y `openclaw-gateway.service`; workspace de Astro `/mnt/localtube/openclaw/state/workspace`.

Todas las rutas aquí son HTTP local sin TLS en `127.0.0.1`; evita publicar respuestas con nombres de dispositivos, rutas o proyectos fuera del chat autorizado. Para información de sistemas, usar solo `GET`; las rutas de administración y descargas también exponen operaciones que cambian estado.

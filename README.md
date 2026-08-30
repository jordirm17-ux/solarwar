# SOLARMAP: WAR — Guía de lanzamiento

Juego gratuito: reclama un planeta, esconde un punto débil, defiéndelo. Sin
pagos — solo necesitas hosting + una base de datos, no Stripe.

## 1. Crear las cuentas (10-15 min)

**Upstash** (base de datos gratis — puedes reutilizar la misma cuenta de
antes, pero crea una base de datos NUEVA y separada para este proyecto)
1. https://upstash.com → "Create Database" → nómbrala "solarmap-war-db"
2. Copia `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`

**Vercel** (si ya tienes cuenta de la versión de pago, reutilízala — esto
va como un proyecto nuevo y separado)

## 2. Subir a GitHub y Vercel

1. Sube esta carpeta a un repositorio NUEVO en GitHub (ej. `solarmap-war`)
2. En Vercel → "Add New" → "Project" → importa ese repositorio
3. Antes de desplegar, añade las variables de entorno (paso siguiente)

## 3. Variables de entorno en Vercel

| Nombre | Valor |
|---|---|
| `UPSTASH_REDIS_REST_URL` | de tu base de datos Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | de tu base de datos Upstash |

Solo estas dos — no hay Stripe en esta versión.

Dale a Deploy.

## 4. Conectar dominio (opcional)

Igual que la versión de pago: Vercel → Settings → Domains → añade tu
dominio, actualiza los DNS en tu proveedor.

## 5. Probar

1. Abre la web desplegada
2. Reclama un planeta cualquiera con un nombre y una URL
3. Abre la web en una ventana de incógnito (simula "otro jugador") e
   intenta atacar ese mismo planeta — deberías poder intentar adivinar la
   casilla, pero nunca ver cuál es la correcta de antemano
4. Repite el ataque enseguida — debería bloquearte por cooldown (2h)

## Cómo funciona la seguridad (por si algo falla)

- El punto débil de cada planeta se guarda SOLO en el servidor (Redis) —
  nunca se envía al navegador salvo al dueño legítimo, que se autentica
  con un token secreto generado al reclamar.
- Cada intento de ataque se compara en el servidor, no en el navegador —
  así nadie puede leer la respuesta correcta abriendo las herramientas de
  desarrollador.
- El cooldown de ataque (2h) se controla con el reloj del servidor, no el
  del navegador de cada jugador — no se puede saltar cambiando la hora
  del móvil.

### Contador "live" (usuarios conectados ahora)
Cada pestaña abierta manda una señal ("heartbeat") al servidor cada 20s.
El servidor guarda esa señal con caducidad de 45s — si cierras la pestaña
o pierdes conexión, tu señal desaparece sola y dejas de contar, sin que
nadie tenga que hacer nada. El número que ves en "live" es siempre gente
conectada de verdad en este momento, no un total histórico.

**Nota de coste**: cada heartbeat consume comandos de tu cuota gratuita
de Upstash (500.000/mes). Con tráfico normal no vas a notarlo, pero si
en algún momento tienes muchísima gente conectada a la vez de forma
sostenida, esto es lo que más rápido se comería la cuota — si eso pasa,
podemos alargar el intervalo (ahora 20s) para gastar menos.

### Anti-abuso: dos capas
1. **Por dispositivo** (estricto): 1 ataque cada 2h, atado a un token anónimo
   en `localStorage`. Borrar ese dato / abrir incógnito genera un token
   nuevo que el servidor no reconoce — así que técnicamente se puede
   saltar, uno por uno.
2. **Por IP** (permisivo, `IP_ATTACK_LIMIT` en `api/_constants.js`, 8/hora
   por defecto): frena a alguien abriendo incógnito muchas veces seguidas
   desde la misma red. Deliberadamente generoso — varias personas jugando
   desde el mismo wifi (casa, oficina) no deberían notarlo nunca en uso
   normal.

Ninguna de las dos cierra el hueco del todo frente a alguien con VPN y
mucha paciencia — para eso haría falta cuentas/verificación real (login,
email), lo cual añade fricción. Para un lanzamiento informal, esta
combinación es un balance razonable entre seguridad y no molestar a
gente normal. Si ves abuso real, podemos bajar el límite de IP o añadir
verificación.

### Si algo falla
- Ataques o reclamos que fallan con error 500 → revisa que las dos
  variables de entorno estén bien puestas en Vercel y haz Redeploy
- El punto débil de un planeta que no es tuyo aparece como "undefined" o
  similar en la consola → normal, es justo lo que no debe verse; el bug
  sería lo contrario

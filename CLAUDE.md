# VetShop Manager — Guía de proyecto para Claude

## Qué es este proyecto
Aplicación React de gestión de vacaciones y horarios para una clínica veterinaria.
Permite visualizar quién trabaja cada día, detectar huecos de cobertura (días sin veterinario),
y marcar/desmarcar vacaciones por empleado.

## Archivo principal actual
`clinic-vacations.jsx` — componente monolítico que contiene toda la app.
Es un fichero único pensado para incrustar en herramientas tipo Claude Artifacts o similares.

## Estructura de carpetas (para refactorizar a futuro)
```
vetshop_manager/
├── clinic-vacations.jsx      ← componente completo (punto de entrada actual)
├── src/
│   ├── components/           ← CoverageTimeline, Modal, EmployeeModal, DayDetail, YearMini…
│   ├── constants/            ← MONTHS, ROLE_COLORS, horarios, STORAGE_KEY…
│   ├── hooks/                ← useStorage, useCoverage…
│   └── utils/                ← dkey, parseDkey, toMin, fromMin, shiftHours, getCoverageGaps…
├── docs/                     ← decisiones de diseño, capturas, notas
└── exports/                  ← ficheros JSON exportados (ignorados por git)
```

## Stack técnico
- React (hooks: useState, useMemo, useEffect, useRef)
- Sin framework CSS — estilos inline con objetos JS
- Almacenamiento: `window.storage` (API de Claude Artifacts) con clave `clinic-v2`, modo compartido
- Exportación/importación manual en JSON

## Dominio: cómo funciona la clínica
- Horario de apertura: **08:30 – 19:00** (constantes `CLINIC_OPEN` / `CLINIC_CLOSE`)
- Días laborables: **lunes a viernes** (sábado y domingo = sin cobertura requerida)
- Roles: `veterinario`, `auxiliar`, `recepcion`, `jefe`
- Un "hueco de cobertura" = franja horaria sin ningún veterinario activo

## Lógica clave

### Vacaciones (`vacations`)
```js
vacations = {
  [empId]: { "YYYY-MM-DD": true, ... }
}
```
Persistido junto con `employees` en `window.storage`.

### Turno de un empleado
`employee.schedule[dayOfWeek]` → `{ start: "HH:MM", end: "HH:MM" }` o `null` (no trabaja).
`dayOfWeek`: 0=Lunes … 6=Domingo.

### Detectar huecos (`getCoverageGaps`)
Recorre minuto a minuto de `CLINIC_OPEN` a `CLINIC_CLOSE` buscando franjas sin veterinario.
Devuelve array de `{ startMin, endMin }`.

### `usedHoursMap`
Calcula las horas de vacaciones ya consumidas por empleado sumando la duración del turno
de cada día marcado como vacaciones.

## Componentes principales
| Componente | Responsabilidad |
|---|---|
| `App` | Estado global, persistencia, routing de tabs |
| `CoverageTimeline` | Barra visual de cobertura (compact/full) |
| `EmployeeModal` | Formulario crear/editar empleado |
| `DayDetail` | Modal con detalle del día seleccionado |
| `YearMini` | Vista miniatura de los 12 meses |
| `Modal` | Wrapper de modal reutilizable |
| `RoleBadge` | Etiqueta de rol con color |
| `TimeInput` | Input de hora estilizado |

## Convenciones
- Fechas como string `"YYYY-MM-DD"` (función `dkey(y, m, d)`)
- Tiempos como minutos desde medianoche internamente (`toMin` / `fromMin`)
- IDs de empleado: strings random cortos (`uid()`)
- Sin framework de testing por ahora — verificar visualmente en el artifact

## Tareas pendientes / roadmap
- [ ] Soporte para festivos nacionales/locales
- [ ] Turno de fin de semana opcional por empleado
- [ ] Vista de semana con timeline horizontal completo
- [ ] Notificación proactiva de huecos en el mes siguiente
- [ ] Separar el monolito en módulos (`src/components`, `src/utils`, etc.)
- [ ] Añadir package.json y bundler (Vite) para desarrollo local

## Comandos útiles
```bash
# (cuando haya package.json)
npm run dev       # servidor de desarrollo
npm run build     # build de producción
npm run lint      # linting
```

## Notas importantes para Claude
- El componente usa `window.storage` (no `localStorage`), disponible solo en Claude Artifacts.
  Al ejecutar fuera de ese entorno `storageOk.current` queda `false` y muestra "SIN ALMACENAMIENTO".
- Los estilos son 100% inline — no hay clases CSS ni ficheros `.css`.
- El array `schedule` tiene siempre 7 posiciones (índice 0 = lunes).
- `SHARED = true` hace que el storage sea compartido entre instancias del mismo artifact.

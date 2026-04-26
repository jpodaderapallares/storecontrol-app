# HLA logo · ubicación esperada

La pestaña "Generar QR" del storekeeper muestra el logo HLA en el header del
módulo (esquina superior derecha del bloque QR). El componente espera el
archivo en:

```
public/hla-logo.png
```

(Servido en runtime como `/hla-logo.png`.)

## Especificaciones recomendadas

- Formato: PNG con transparencia (o WebP).
- Resolución mínima: 512 × 512 px (idealmente 1024 × 1024 para retina).
- Fondo transparente (el QR se renderiza sobre `bg-bg-surface` oscuro).
- Si el logo es oscuro, considera usar una versión en blanco/claro para
  que se vea bien sobre fondo oscuro de StoreControl.

## Comportamiento sin logo

Si el archivo no existe, el componente sigue funcionando sin romper la UI:
muestra solo el icono `QrCode` de lucide-react en su lugar.

## Cómo añadirlo

1. Guarda el PNG adjuntado en el correo / chat con Claude como
   `public/hla-logo.png`.
2. Confirma con `git status` que aparece como untracked.
3. Inclúyelo en el commit del despliegue:
   `git add public/hla-logo.png`.

# 📱 GUÍA COMPLETA PARA GENERAR EL ARCHIVO APK (ANDROID) - D'CAMISAS

Esta aplicación ha sido desarrollada bajo una arquitectura móvil moderna (PWA + Capacitor Ready). Tienes **3 alternativas** para tenerla instalada en tu teléfono Android como una aplicación móvil con el logo oficial de **D'Camisas**.

---

## 🥇 MÉTODO 1: Generar el APK en 1 Clic con PWABuilder (El más rápido y recomendado)
*No requiere instalar Android Studio ni configurar Java en tu computadora.*

1. Sube los archivos de la app a cualquier hosting gratuito (como **Netlify**, **Vercel**, **GitHub Pages** o **Firebase Hosting**).
2. Entra en tu navegador a: [PWABuilder.com](https://www.pwabuilder.com)
3. Pega la URL de tu aplicación (ej: `https://dcamisas-app.netlify.app`) y haz clic en **Start**.
4. PWABuilder analizará automáticamente el `manifest.webmanifest`, el icono oficial y el Service Worker.
5. Haz clic en el botón **Package for Stores** > **Android**.
6. Selecciona la opción de descargar el paquete:
   - **Download APK** (para instalar directamente en cualquier teléfono Android).
   - O **Download AAB** (si deseas publicarla en Google Play Store).
7. Transfiere el archivo `.apk` a tu teléfono Android o descárgalo directamente desde el navegador de tu celular y pulsa **Instalar**. ¡Listo!

---

## 🥈 MÉTODO 2: Compilación Nativa con Capacitor y Android Studio
*Ideal si tienes Android Studio instalado y quieres compilar localmente.*

### Requisitos previos:
- Tener instalado [Node.js](https://nodejs.org/) (ya verificado).
- Tener instalado [Android Studio](https://developer.android.com/studio) con el Android SDK.

### Pasos:
1. Abre una terminal en la carpeta del proyecto `app-camisas`.
2. Ejecuta la minificación del código JavaScript para proteger la lógica y URLs en producción/APK:
   ```bash
   npm run build
   ```
   *(o `node scripts/build-minify.js`)*
3. Instala las dependencias de Capacitor ejecutando:
   ```bash
   npm install
   ```
4. Agrega la plataforma de Android:
   ```bash
   npx cap add android
   ```
5. Sincroniza los archivos web minificados con la carpeta nativa de Android:
   ```bash
   npx cap sync android
   ```
6. Abre el proyecto en Android Studio:
   ```bash
   npx cap open android
   ```
7. En Android Studio:
   - Espera que Gradle termine de sincronizar.
   - Ve al menú superior: **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
   - Al finalizar, Android Studio mostrará una notificación: *"Build APK(s): APK(s) generated successfully"*. Haz clic en **locate** para obtener tu archivo `app-debug.apk`.
   - **Ruta exacta del instalador APK:**
     - Para depuración / pruebas: `app-camisas/android/app/build/outputs/apk/debug/app-debug.apk`
     - Para versión firmada / producción: `app-camisas/android/app/build/outputs/apk/release/app-release.apk`
   - Si deseas un APK de producción firmado, ve a: **Build** > **Generate Signed Bundle / APK** > **APK** y sigue el asistente.

---

## 🥉 MÉTODO 3: Instalación Inmediata como PWA (Sin compilar nada)
*La app funciona exactamente como una app nativa, con icono en la pantalla de inicio, pantalla completa sin barra de navegación y funcionamiento offline.*

1. Abre la aplicación en el navegador **Google Chrome** en tu teléfono Android.
2. Toca el botón de opciones (los 3 puntos verticales arriba a la derecha).
3. Selecciona **"Agregar a la pantalla principal"** o **"Instalar aplicación"**.
4. Confirma la instalación.
5. En unos segundos, verás el icono con el logo oficial de **D'Camisas** en el cajón de aplicaciones de tu teléfono junto a WhatsApp e Instagram. Al abrirlo, se ejecuta en pantalla completa sin barra de direcciones.

---

## ⚙️ Permisos Incluidos
El proyecto ya cuenta con la configuración para:
- Conexión a Internet (`android.permission.INTERNET`) para consultar y actualizar el Google Sheets.
- Almacenamiento local persistente (`localStorage` y Service Worker Cache) para que la app no pierda la sesión ni los datos al cerrarse.
- Iconos adaptativos en resoluciones 192x192 y 512x512 con el isotipo sobre mancha acuarela rosa/magenta.

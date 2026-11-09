# 📋 GUÍA DE CONFIGURACIÓN Y DESPLIEGUE - GOOGLE APPS SCRIPT (D'CAMISAS)

Sigue estos sencillos pasos para tener tu base de datos en Google Sheets y tu API conectada a la aplicación móvil en menos de 3 minutos.

---

## 🚀 PASO 1: Crear la Hoja de Google Sheets
1. Entra a [Google Sheets](https://sheets.new) y crea una nueva hoja de cálculo.
2. Nómbrala: **"D'Camisas - Sistema de Inventario y Ventas"**.

---

## ⚡ PASO 2: Pegar el Código del Backend
1. En el menú superior de la hoja, ve a: **Extensiones** > **Apps Script**.
2. Verás un archivo llamado `Código.gs` (o `Code.gs`).
3. Borra todo lo que haya allí y copia el contenido completo de `google-apps-script/Código.gs`.
4. Guarda los cambios presionando el icono de disco 💾 o `Ctrl + S`.

---

## 🪄 PASO 3: Inicializar las Pestañas y Datos de Ejemplo
1. En la barra superior de Apps Script, en el selector de funciones (donde dice `myFunction` o similar), selecciona:
   👉 **`setupSheet`**
2. Haz clic en **Ejecutar** (botón ▶️ Run).
3. Google te pedirá permisos para acceder a la hoja la primera vez:
   - Clic en **Revisar permisos** (Review permissions).
   - Elige tu cuenta de Google.
   - Clic en **Opciones avanzadas** (Advanced) abajo a la izquierda.
   - Clic en **Ir a Proyecto (no seguro)** (Go to Project).
   - Clic en **Permitir** (Allow).
4. ¡Listo! Vuelve a tu Google Sheets y verás creadas automáticamente las 3 pestañas con formato elegante de la marca:
   - 👥 **`Usuarios`**: con los usuarios `admin`, `vendedor`, `inventario` y `inactivo`.
   - 📦 **`Stock_Actual`**: con camisas de muestra en tallas S, M, L, XL con sus entradas, salidas y stock calculado.
   - 🔄 **`Movimientos`**: con el historial de entradas y salidas registradas.

---

## 🌐 PASO 4: Desplegar la Aplicación Web (Web App)
1. En la esquina superior derecha de Apps Script, haz clic en el botón azul **Implementar** (Deploy) > **Nueva implementación** (New deployment).
2. En el icono de engranaje ⚙️ (Seleccionar tipo), elige **Aplicación web** (Web app).
3. Configura los siguientes campos:
   - **Descripción**: `Backend D'Camisas Móvil v1`
   - **Ejecutar como**: **Yo (tu cuenta de correo)**
   - **Quién tiene acceso**: **Cualquiera** (Anyone)  *(⚠️ IMPORTANTE: debe ser "Cualquiera" para que la app móvil pueda consultar y guardar movimientos sin requerir inicio de sesión OAuth en el teléfono)*.
4. Haz clic en **Implementar** (Deploy).
5. Copia la **URL de la aplicación web** generada (termina en `/exec`).
   *Ejemplo: `https://script.google.com/macros/s/AKfycbx.../exec`*

---

## 📱 PASO 5: Conectar con la Aplicación Móvil
1. Abre la aplicación móvil **D'Camisas**.
2. En la pantalla de login (o en la pestaña de Ajustes), haz clic en el icono de engranaje ⚙️ **Configuración**.
3. Pega tu URL de Apps Script en el campo **URL Web App de Google Sheets**.
4. Haz clic en **"Probar y Guardar Conexión"**.
5. ¡Listo! Ya puedes iniciar sesión con las credenciales creadas:
   - **Usuario**: `admin`
   - **Contraseña**: `1234`
   *(O `vendedor` / `camisas2026`)*.

---

## 🔒 Usuarios y Roles:
Estructura de columnas en la hoja **`Usuarios`**: `ID | USUARIO | CONTRASEÑA | ESTADO | ROL`

| ID | Usuario | Contraseña | Estado | Rol | Permisos en la App |
| :---: | :--- | :--- | :---: | :--- | :--- |
| **1** | `mayte` | `1234` | 1 | Usuario | Operaciones de inventario (Stock, Entradas, Salidas) |
| **2** | `mati` | `2222` | 1 | Usuario | Operaciones de inventario (Stock, Entradas, Salidas) |
| **3** | `admin` | `1111` | 1 | Administrador | Control total + Configuración de URL Google Apps Script |

Puedes agregar o modificar cualquier usuario directamente en la pestaña **Usuarios** de tu Google Sheets en cualquier momento.

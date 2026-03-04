# 🚀 NetRunner Pro v4.0 - Guía Rápida de Instalación

## ✅ Todo Listo para GitHub

Este proyecto está **100% listo** para hacer push a GitHub y deploy en Railway.

---

## 📦 Contenido del Proyecto

```
NetRunner-backend/
├── server.js                    # Backend optimizado (SIN MongoDB)
├── package.json                 # Solo Express como dependencia
├── .env.example                 # Template de variables
├── .gitignore                   # Git ignore configurado
├── README.md                    # Documentación completa
│
└── public/
    ├── index.html               # Frontend optimizado
    └── src/
        ├── config.js            # Configuración
        ├── chat.js              # Lógica de chat
        ├── executor.js          # Ejecución de código
        ├── browser.js           # Automatización navegador
        ├── filesystem-simple.js # Sistema de archivos SIN workspace
        ├── welcome.js           # Mensaje intuitivo
        ├── welcome-styles.css   # Estilos del mensaje
        └── styles.css           # Estilos principales
```

---

## 🎯 Mejoras Implementadas

### ✅ Sin Workspace Obligatorio
- Cada operación de archivo pide ubicación
- Diálogos de confirmación claros (SÍ/NO)
- Más seguro y transparente

### ✅ Mensaje de Bienvenida Intuitivo
- Saludo personalizado (Buenos días/tardes/noches)
- Cards clicables con ejemplos
- Sin jerga técnica

### ✅ Sistema Simplificado
- Sin MongoDB (no es necesario para empezar)
- Solo Express como dependencia
- Fácil de mantener

### ✅ Streaming en Tiempo Real
- Respuestas palabra por palabra
- Como ChatGPT
- Mejor experiencia de usuario

### ✅ Código Limpio
- Un solo README.md con TODA la documentación
- Sin archivos MD duplicados
- Estructura organizada

---

## 🚀 Instalación en 3 Pasos

### 1. Configurar Variables de Entorno

```bash
# Copia el template
cp .env.example .env

# Edita .env y añade tu API key
nano .env
```

Contenido de `.env`:
```env
GROQ_API_KEY=gsk_tu_api_key_real_aqui
NODE_ENV=development
PORT=3000
```

**Obtener API Key gratis:**
1. Ve a https://console.groq.com
2. Regístrate gratis
3. Ve a "API Keys"
4. Click "Create API Key"
5. Copia la key que empieza con `gsk_`

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Probar Localmente

```bash
npm start
```

Abre: http://localhost:3000

**Verificar:**
- ✅ Mensaje de bienvenida aparece
- ✅ Cards clicables funcionan
- ✅ Chat responde (si configuraste GROQ_API_KEY)

---

## 📤 Push a GitHub

### Si es un repositorio nuevo:

```bash
# Inicializar Git
git init

# Añadir archivos
git add .

# Commit
git commit -m "🚀 NetRunner Pro v4.0 - Initial commit"

# Crear repo en GitHub (web) y luego:
git remote add origin https://github.com/TU_USUARIO/NetRunner-backend.git
git branch -M main
git push -u origin main
```

### Si ya tienes el repositorio:

```bash
# Añadir cambios
git add .

# Commit
git commit -m "🚀 NetRunner Pro v4.0 - Optimizado y sin workspace"

# Push
git push origin main
```

---

## ☁️ Deploy en Railway

### Automático (desde GitHub):

1. Ve a https://railway.app
2. Click "New Project"
3. "Deploy from GitHub repo"
4. Selecciona tu repositorio
5. **Configura variables**:
   - `GROQ_API_KEY` = `gsk_tu_key`
   - `NODE_ENV` = `production`
6. Railway despliega automáticamente
7. **Genera dominio**:
   - Settings → Networking → Generate Domain
   - Te dará: `tu-app.railway.app`

### Verificar Deploy:

```bash
# Health check
curl https://tu-app.railway.app/health

# Debe devolver:
# {"ok":true,"mode":"groq","providers":["groq"],"version":"4.0.0"}
```

---

## ✅ Checklist de Verificación

### Local:
- [ ] `npm install` ejecutado sin errores
- [ ] `.env` creado con GROQ_API_KEY
- [ ] `npm start` funciona
- [ ] http://localhost:3000 carga correctamente
- [ ] Mensaje de bienvenida aparece
- [ ] Chat funciona (responde preguntas)
- [ ] Ejecutar código funciona
- [ ] Crear/leer archivos funciona (pide permisos)

### GitHub:
- [ ] `git add .` ejecutado
- [ ] `git commit -m "mensaje"` ejecutado
- [ ] `git push origin main` exitoso
- [ ] Código visible en GitHub

### Railway:
- [ ] Proyecto creado desde GitHub
- [ ] Variables GROQ_API_KEY y NODE_ENV configuradas
- [ ] Deploy exitoso (check verde)
- [ ] Dominio generado
- [ ] `/health` responde correctamente
- [ ] Interfaz web funciona en producción

---

## 🐛 Solución Rápida de Problemas

### Error: "Cannot find module 'express'"
```bash
rm -rf node_modules package-lock.json
npm install
```

### Error: "GROQ_API_KEY no configurada"
Asegúrate de:
1. Tener `.env` en la raíz del proyecto
2. La key empieza con `gsk_`
3. Reiniciaste el servidor después de crear `.env`

### Mensaje de bienvenida no aparece
1. Abre consola del navegador (F12)
2. Busca errores
3. Verifica que `welcome.js` y `welcome-styles.css` están en `/public/src/`
4. Limpia caché: Ctrl+Shift+Delete

### Operaciones de archivo no funcionan
- **Usa Chrome, Edge o Opera** (no funciona en Firefox/Safari)
- Acepta los permisos cuando el navegador los pida
- En producción (Railway), asegúrate de usar HTTPS

---

## 📊 Estructura del Proyecto

### Backend (`server.js`):
- Express server
- Rate limiting (30 req/min)
- Streaming SSE
- CORS configurado
- Security headers

### Frontend (`public/`):
- `index.html` - Interfaz principal
- `config.js` - Configuración (modelos, API URL)
- `chat.js` - Lógica principal
- `executor.js` - Ejecución de código (Piston API)
- `filesystem-simple.js` - Sistema de archivos (sin workspace)
- `browser.js` - Automatización del navegador
- `welcome.js` - Mensaje intuitivo
- `styles.css` - Estilos cyberpunk

---

## 🎯 Próximos Pasos

Después de que todo funcione:

1. **Personaliza** el mensaje de bienvenida en `welcome.js`
2. **Añade más modelos** en `config.js`
3. **Cambia colores** en `styles.css` (variables CSS al inicio)
4. **Comparte** tu deploy con amigos
5. **Contribuye** al proyecto en GitHub

---

## 📞 Soporte

Si algo no funciona:

1. **Lee el README.md completo** - Tiene toda la info
2. **Revisa los logs**:
   - Local: En la terminal donde corre `npm start`
   - Railway: Dashboard → Logs
3. **Consola del navegador**: F12 → Console
4. **GitHub Issues**: Reporta bugs

---

## 🎉 ¡Listo!

Tu NetRunner Pro v4.0 está **completamente optimizado** y listo para:
- ✅ Push a GitHub
- ✅ Deploy en Railway
- ✅ Uso en producción

**Tiempo estimado total**: 10-15 minutos  
**Dificultad**: Fácil (solo copiar y pegar)  
**Resultado**: Asistente de IA funcionando al 100%

---

**¡Éxito con tu proyecto! 🚀**

*NetRunner Pro v4.0 - Sin workspace, con permisos claros*

const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const compression = require('compression')
const { spawn, exec } = require('child_process')
const crypto = require('crypto')
const archiver = require('archiver')

const { sendOrderEmail } = require('./resend-mailer.js')

// Firebase версия 10+ импорт
const { initializeApp } = require('firebase/app')
const {
	getDatabase,
	ref,
	set,
	get,
	update,
	push,
	child,
} = require('firebase/database')

const app = express()
const PORT = process.env.PORT || 3000

// Путь к защищенному хранилищу APK
const APK_STORAGE_PATH = path.join(__dirname, 'secure-apk-storage')

// Создаем защищенную папку если нет
if (!fs.existsSync(APK_STORAGE_PATH)) {
	fs.mkdirSync(APK_STORAGE_PATH, { recursive: true })
	console.log(`🔐 Создана защищенная папка для APK: ${APK_STORAGE_PATH}`)
}

// ==================== ФУНКЦИЯ: Получить APK по productId ====================
function findAPKFileByProductId(productId) {
	try {
		// productId должен быть в формате KFXXX
		const match = productId.match(/KF(\d{3})/i)
		if (!match) {
			console.log(`❌ Неверный формат productId: ${productId}`)
			return null
		}

		const normalizedId = match[0].toUpperCase() // KF001
		const apkDirPath = path.join(__dirname, 'apk', normalizedId)

		console.log(`🔍 Ищем APK для: ${normalizedId}, путь: ${apkDirPath}`)

		if (!fs.existsSync(apkDirPath)) {
			console.log(`❌ Папка не существует: ${apkDirPath}`)
			return null
		}

		// Ищем .apk файлы в папке
		const files = fs.readdirSync(apkDirPath)
		console.log(`📁 Файлы в папке ${normalizedId}:`, files)

		const apkFile = files.find(file => file.toLowerCase().endsWith('.apk'))

		if (!apkFile) {
			console.log(`❌ APK файл не найден в ${normalizedId}`)
			return null
		}

		const fullPath = path.join(apkDirPath, apkFile)
		console.log(`✅ Найден APK: ${fullPath}`)

		return {
			path: fullPath,
			name: apkFile,
			productId: normalizedId,
		}
	} catch (error) {
		console.error('❌ Ошибка поиска APK:', error)
		return null
	}
}

// ==================== ЗАЩИЩЕННЫЙ МАРШРУТ ДЛЯ СКАЧИВАНИЯ ВСЕХ APK ====================
app.get('/api/secure-download/:receivingId', async (req, res) => {
	try {
		console.log(`🔐 === ЗАПРОС НА ЗАЩИЩЕННОЕ СКАЧИВАНИЕ ===`)
		console.log(`📦 ReceivingId: ${req.params.receivingId}`)
		console.log(`🌐 IP: ${req.ip}`)
		console.log(`📱 User-Agent: ${req.headers['user-agent']}`)

		const { receivingId } = req.params

		// 1. ПОЛУЧАЕМ И ПРОВЕРЯЕМ ЗАКАЗ
		let order = await getOrderByReceivingIdFromFirebase(receivingId)

		if (!order) {
			order = getOrderByReceivingId(receivingId)
		}

		if (!order) {
			console.log(`❌ Заказ не найден для receivingId: ${receivingId}`)
			return res.status(404).json({
				success: false,
				error: 'Заказ не найден',
			})
		}

		if (order.status !== 'paid') {
			console.log(
				`❌ Заказ не оплачен: ${order.orderId}, статус: ${order.status}`,
			)
			return res.status(403).json({
				success: false,
				error: 'Заказ не оплачен',
			})
		}

		console.log(`✅ Заказ найден: ${order.orderId}`)
		console.log(`📦 ProductId: ${order.productId}`)
		console.log(`📧 Email: ${order.customerEmail}`)

		// 2. ИЗВЛЕКАЕМ KFXXX ИЗ ДАННЫХ ЗАКАЗА
		let watchfaceId = null
		const possibleSources = [
			order.productId,
			order.productName,
			order.folderName,
		]

		for (const source of possibleSources) {
			if (source) {
				const match = source.match(/KF(\d{3})/i)
				if (match) {
					watchfaceId = match[0].toUpperCase()
					console.log(`🎯 Найден watchfaceId: ${watchfaceId} в ${source}`)
					break
				}
			}
		}

		if (!watchfaceId) {
			console.log(`❌ Не удалось извлечь KFXXX из заказа:`, order)
			return res.status(400).json({
				success: false,
				error: 'Не удалось определить циферблат',
			})
		}

		// 3. ИЩЕМ ВСЕ APK ФАЙЛЫ
		const apkFiles = findAllAPKFilesByProductId(watchfaceId)

		if (apkFiles.length === 0) {
			console.log(`❌ APK файлы не найдены для ${watchfaceId}`)
			return res.status(404).json({
				success: false,
				error: 'Файлы циферблата не найдены',
			})
		}

		console.log(`📦 Найдено APK файлов: ${apkFiles.length} для ${watchfaceId}`)
		apkFiles.forEach((file, index) => {
			console.log(
				`   ${index + 1}. ${file.name} (${(file.size / 1024 / 1024).toFixed(
					2,
				)} MB)`,
			)
		})

		// 4. ЕСЛИ ТОЛЬКО ОДИН ФАЙЛ - отправляем с ОРИГИНАЛЬНЫМ именем
		if (apkFiles.length === 1) {
			const apkData = apkFiles[0]
			console.log(`📤 Отправка одного файла: ${apkData.name}`)

			// ОРИГИНАЛЬНОЕ имя файла
			const originalFileName = apkData.name

			res.setHeader('Content-Type', 'application/vnd.android.package-archive')
			res.setHeader(
				'Content-Disposition',
				`attachment; filename="${originalFileName}"`,
			)
			res.setHeader('X-Content-Type-Options', 'nosniff')
			res.setHeader(
				'Cache-Control',
				'no-store, no-cache, must-revalidate, private',
			)

			const fileStream = fs.createReadStream(apkData.path)
			fileStream.pipe(res)
		} else {
			// 5. ЕСЛИ НЕСКОЛЬКО ФАЙЛОВ - создаем ZIP архив с ОРИГИНАЛЬНЫМИ именами
			console.log(`📦 Создание ZIP архива с ${apkFiles.length} файлами`)

			const zipFileName = `${watchfaceId}_watchfaces_${order.orderId}.zip`

			res.setHeader('Content-Type', 'application/zip')
			res.setHeader(
				'Content-Disposition',
				`attachment; filename="${zipFileName}"`,
			)
			res.setHeader('X-Content-Type-Options', 'nosniff')
			res.setHeader(
				'Cache-Control',
				'no-store, no-cache, must-revalidate, private',
			)

			// Создаем ZIP архив
			const archive = archiver('zip', {
				zlib: { level: 9 }, // Максимальное сжатие
			})

			archive.on('error', err => {
				console.error('❌ Ошибка создания архива:', err)
				res.status(500).json({ error: 'Ошибка создания архива' })
			})

			archive.on('warning', err => {
				if (err.code === 'ENOENT') {
					console.log('⚠️ Предупреждение архиватора:', err)
				} else {
					console.error('❌ Ошибка архиватора:', err)
					throw err
				}
			})

			archive.on('end', () => {
				console.log(`✅ Архив создан: ${archive.pointer()} байт`)
			})

			// Пайпим архив в ответ
			archive.pipe(res)

			// Добавляем все APK файлы в архив с ОРИГИНАЛЬНЫМИ именами
			apkFiles.forEach((apkData, index) => {
				archive.file(apkData.path, { name: apkData.name }) // Оригинальное имя
				console.log(`   📁 Добавлен в архив: ${apkData.name}`)
			})

			// Завершаем архив
			archive.finalize()

			console.log(`✅ Создание ZIP архива начато`)
		}

		// 6. Логируем успешное скачивание
		console.log(`✅ Файл(ы) отправлены`)
		console.log(`👤 Покупатель: ${order.customerEmail}`)
		console.log(`💰 Цена: ${order.price} руб.`)
		console.log(`🎯 Watchface: ${watchfaceId}`)
		console.log(`📊 Количество файлов: ${apkFiles.length}`)
	} catch (error) {
		console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error)
		res.status(500).json({
			success: false,
			error: 'Ошибка сервера при скачивании',
		})
	}
})

// ==================== ПРОСТАЯ ПРОВЕРКА ДОСТУПА ====================
app.get('/api/check-access/:receivingId', async (req, res) => {
	try {
		const { receivingId } = req.params

		// Минимальная проверка - только для JS на клиенте
		const order = await getOrderByReceivingIdFromFirebase(receivingId)

		if (!order || order.status !== 'paid') {
			return res.json({
				success: false,
				accessible: false,
				message: 'Доступ запрещен',
			})
		}

		return res.json({
			success: true,
			accessible: true,
			productName: order.productName || `Циферблат ${order.productId}`,
			orderId: order.orderId,
		})
	} catch (error) {
		return res.json({
			success: false,
			accessible: false,
			message: 'Ошибка проверки',
		})
	}
})

// ==================== ФУНКЦИЯ: Найти ВСЕ APK файлы по productId ====================
function findAllAPKFilesByProductId(productId) {
	try {
		// Извлекаем KFXXX из productId
		const match = productId.match(/KF(\d{3})/i)
		if (!match) {
			console.log(`❌ Неверный формат productId: ${productId}`)
			return []
		}

		const normalizedId = match[0].toUpperCase() // KF159
		const apkDirPath = path.join(__dirname, 'apk', normalizedId)

		console.log(`🔍 Ищем ВСЕ APK для: ${normalizedId}, путь: ${apkDirPath}`)

		if (!fs.existsSync(apkDirPath)) {
			console.log(`❌ Папка не существует: ${apkDirPath}`)
			return []
		}

		// Ищем ВСЕ .apk файлы в папке
		const allFiles = fs.readdirSync(apkDirPath)
		console.log(`📁 Все файлы в папке ${normalizedId}:`, allFiles)

		const apkFiles = allFiles
			.filter(file => file.toLowerCase().endsWith('.apk'))
			.map(file => {
				const fullPath = path.join(apkDirPath, file)
				const stats = fs.statSync(fullPath)
				return {
					path: fullPath,
					name: file, // ОРИГИНАЛЬНОЕ имя
					originalName: file, // Сохраняем оригинальное имя
					size: stats.size,
					sizeMB: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
					productId: normalizedId,
				}
			})

		console.log(`✅ Найдено APK файлов: ${apkFiles.length}`)

		return apkFiles
	} catch (error) {
		console.error('❌ Ошибка поиска APK:', error)
		return []
	}
}
// ==================== API ДЛЯ ПРОВЕРКИ КОЛИЧЕСТВА ФАЙЛОВ ====================
app.get('/api/check-apk-files/:kfId', (req, res) => {
	try {
		const { kfId } = req.params
		const normalizedId = kfId.toUpperCase()
		const apkFiles = findAllAPKFilesByProductId(normalizedId)

		res.json({
			success: true,
			productId: normalizedId,
			fileCount: apkFiles.length,
			files: apkFiles.map(f => ({
				name: f.name,
				size: f.size,
				sizeMB: f.sizeMB,
			})),
		})
	} catch (error) {
		res.json({
			success: false,
			error: error.message,
			fileCount: 0,
		})
	}
})

// Добавьте это ДО всех маршрутов robokassa
const bodyParser = require('body-parser')

// Парсинг application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }))

// Парсинг application/json
app.use(bodyParser.json())

// Middleware
app.use(compression())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))

// Добавляем статическую раздачу для папки guide
app.use('/guide', express.static(path.join(__dirname, 'public', 'guide')))
app.use('/static', express.static(path.join(__dirname, 'public')))

// Инициализация Firebase
const firebaseConfig = {
	apiKey: 'AIzaSyAINukGK-Eklftf-2cKG1eE6UeViUocwU0',
	authDomain: 'krekfree.firebaseapp.com',
	projectId: 'krekfree',
	storageBucket: 'krekfree.firebasestorage.app',
	messagingSenderId: '234608388001',
	appId: '1:234608388001:web:d1d9514062221de856cde0',
	measurementId: 'G-XRGPB3BKMK',
	databaseURL:
		'https://krekfree-default-rtdb.europe-west1.firebasedatabase.app/',
}

// Инициализируем Firebase
const firebaseApp = initializeApp(firebaseConfig)
const database = getDatabase(firebaseApp)
console.log('✅ Firebase инициализирован в server.js')

// Конфигурация multer для загрузки файлов
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, 'uploads/')
	},
	filename: function (req, file, cb) {
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
		cb(
			null,
			file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname),
		)
	},
})

const upload = multer({ storage: storage })

// Создаем необходимые папки
const requiredFolders = [
	'uploads',
	path.join('public', 'guide', 'WearLoad'),
	'orders', // Оставляем для обратной совместимости
]

requiredFolders.forEach(folder => {
	const fullPath = path.join(__dirname, folder)
	if (!fs.existsSync(fullPath)) {
		fs.mkdirSync(fullPath, { recursive: true })
	}
})

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function extractFolderNumber(folderName) {
	const match = folderName.match(/KF(\d{3})/i)
	return match ? parseInt(match[1]) : 0
}

function getFolderFiles(folderPath) {
	try {
		return fs.readdirSync(folderPath).map(filename => {
			const filePath = path.join(folderPath, filename)
			const stats = fs.statSync(filePath)
			const extension = path.extname(filename).toLowerCase().replace('.', '')

			return {
				name: filename,
				type: extension,
				size: stats.size,
				modified: stats.mtime,
			}
		})
	} catch (error) {
		console.error('Ошибка чтения файлов папки:', error)
		return []
	}
}

// ==================== FIREBASE ORDER FUNCTIONS ====================

// Генерация уникального ID для ссылки получения
// ==================== FIREBASE ORDER FUNCTIONS ====================

// Генерация уникального ID для ссылки получения в формате UUID v4
function generateReceivingId() {
	return crypto.randomUUID() // Встроенная функция Node.js 14.17.0+
}
// Сохранение заказа в Firebase (без receivingId до оплаты)
async function saveOrderToFirebase(orderData) {
	try {
		orderData.createdAt = new Date().toISOString()
		orderData.updatedAt = new Date().toISOString()
		orderData.receivingId = null // Будет сгенерирован после оплаты
		orderData.receivingUrl = null // Будет сгенерирован после оплаты
		orderData.status = 'pending' // Убедитесь что статус установлен

		// Сохраняем заказ в Firebase без receivingId
		await set(ref(database, `orders/${orderData.orderId}`), orderData)

		console.log(`✅ Заказ сохранен в Firebase (pending): ${orderData.orderId}`)
		console.log(`🔒 Receiving ID: будет сгенерирован после оплаты`)

		// Возвращаем true вместо receivingId
		return true
	} catch (error) {
		console.error('❌ Ошибка сохранения заказа в Firebase:', error)
		return false
	}
}

// Генерация receivingId и обновление заказа после успешной оплаты
async function generateReceivingForPaidOrder(orderId) {
	try {
		const receivingId = generateReceivingId()

		const updates = {
			receivingId: receivingId,
			receivingUrl: `/purchase/receiving/${receivingId}`,
			updatedAt: new Date().toISOString(),
		}

		// Обновляем заказ с receivingId
		await update(ref(database, `orders/${orderId}`), updates)

		// Создаем индекс для быстрого поиска по receivingId
		await set(ref(database, `orderByReceivingId/${receivingId}`), {
			orderId: orderId,
			status: 'paid',
			receivingId: receivingId,
		})

		console.log(
			`✅ Generated receivingId for paid order ${orderId}: ${receivingId}`,
		)
		return receivingId
	} catch (error) {
		console.error('❌ Ошибка генерации receivingId:', error)
		return null
	}
}

// Получение заказа по receivingId из Firebase
async function getOrderByReceivingIdFromFirebase(receivingId) {
	try {
		// Сначала получаем индекс
		const indexSnapshot = await get(
			ref(database, `orderByReceivingId/${receivingId}`),
		)

		if (!indexSnapshot.exists()) {
			return null
		}

		const indexData = indexSnapshot.val()

		// Проверяем что заказ оплачен (индекс создается только для paid заказов)
		if (indexData.status !== 'paid') {
			return null
		}

		// Получаем полный заказ
		const orderSnapshot = await get(
			ref(database, `orders/${indexData.orderId}`),
		)

		if (!orderSnapshot.exists()) {
			return null
		}

		const order = orderSnapshot.val()

		// Дополнительная проверка
		if (order.status !== 'paid' || order.receivingId !== receivingId) {
			return null
		}

		return order
	} catch (error) {
		console.error('❌ Ошибка чтения заказа из Firebase:', error)
		return null
	}
}

// Получение заказа по orderId из Firebase
async function getOrderByOrderIdFromFirebase(orderId) {
	try {
		const snapshot = await get(ref(database, `orders/${orderId}`))

		if (!snapshot.exists()) {
			return null
		}

		return snapshot.val()
	} catch (error) {
		console.error('❌ Ошибка чтения заказа из Firebase:', error)
		return null
	}
}

// Обновление статуса заказа в Firebase
async function updateOrderStatusInFirebase(orderId, updates) {
	try {
		updates.updatedAt = new Date().toISOString()

		// Обновляем основной объект заказа
		await update(ref(database, `orders/${orderId}`), updates)

		// Получаем заказ для получения receivingId
		const order = await getOrderByOrderIdFromFirebase(orderId)
		if (order && order.receivingId) {
			// Обновляем индекс
			await update(ref(database, `orderByReceivingId/${order.receivingId}`), {
				status: updates.status || order.status,
				updatedAt: new Date().toISOString(),
			})
		}

		console.log(`✅ Статус заказа ${orderId} обновлен в Firebase`)
		return true
	} catch (error) {
		console.error('❌ Ошибка обновления заказа в Firebase:', error)
		return false
	}
}

// ==================== BACKUP: Локальное сохранение (для обратной совместимости) ====================

function saveOrderWithReceivingId(orderData) {
	try {
		const receivingId = generateReceivingId()
		orderData.receivingId = receivingId
		orderData.receivingUrl = `/purchase/receiving/${receivingId}`
		orderData.createdAt = new Date().toISOString()

		// Безопасное имя файла (заменяем дефисы)
		const safeReceivingId = receivingId.replace(/-/g, '_')

		// Сохраняем по двум ключам для быстрого поиска
		const orderFileById = path.join(
			__dirname,
			'orders',
			`order_${orderData.orderId}.json`,
		)
		const orderFileByReceivingId = path.join(
			__dirname,
			'orders',
			`receiving_${safeReceivingId}.json`,
		)

		fs.writeFileSync(orderFileById, JSON.stringify(orderData, null, 2))
		fs.writeFileSync(orderFileByReceivingId, JSON.stringify(orderData, null, 2))

		return receivingId
	} catch (error) {
		console.error('Ошибка сохранения заказа локально:', error)
		return null
	}
}

function getOrderByReceivingId(receivingId) {
	try {
		// Безопасное имя файла для UUID
		const safeReceivingId = receivingId.replace(/-/g, '_')
		const orderFile = path.join(
			__dirname,
			'orders',
			`receiving_${safeReceivingId}.json`,
		)

		if (fs.existsSync(orderFile)) {
			const data = fs.readFileSync(orderFile, 'utf8')
			return JSON.parse(data)
		}
		return null
	} catch (error) {
		console.error('Ошибка чтения заказа локально:', error)
		return null
	}
}

function getOrderByOrderId(orderId) {
	try {
		const orderFile = path.join(__dirname, 'orders', `order_${orderId}.json`)

		if (fs.existsSync(orderFile)) {
			const data = fs.readFileSync(orderFile, 'utf8')
			return JSON.parse(data)
		}
		return null
	} catch (error) {
		console.error('Ошибка чтения заказа локально:', error)
		return null
	}
}

// ==================== PYTHON ФУНКЦИИ ====================

async function checkPythonInstallation() {
	return new Promise((resolve, reject) => {
		const pythonCommands = ['python3', 'python', 'py']

		function tryCommand(index) {
			if (index >= pythonCommands.length) {
				resolve({ installed: false })
				return
			}

			const cmd = pythonCommands[index]
			exec(`${cmd} --version`, (error, stdout, stderr) => {
				if (error) {
					tryCommand(index + 1)
				} else {
					resolve({
						installed: true,
						command: cmd,
						version: stdout || stderr,
					})
				}
			})
		}

		tryCommand(0)
	})
}

function callPythonScript(scriptName, data) {
	return new Promise(async (resolve, reject) => {
		const scriptPath = path.join(__dirname, scriptName)

		if (!fs.existsSync(scriptPath)) {
			reject(new Error(`Python скрипт не найден: ${scriptPath}`))
			return
		}

		const pythonCheck = await checkPythonInstallation()

		if (!pythonCheck.installed) {
			reject(new Error('Python не установлен'))
			return
		}

		const pythonProcess = spawn(pythonCheck.command, [scriptPath], {
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: true,
			env: {
				...process.env,
				PYTHONIOENCODING: 'utf-8',
				PYTHONUTF8: '1',
				LC_ALL: 'en_US.UTF-8',
				LANG: 'en_US.UTF-8',
			},
		})
		let stdout = ''
		let stderr = ''

		pythonProcess.stdout.on('data', data => {
			stdout += data.toString('utf8')
		})

		pythonProcess.stderr.on('data', data => {
			stderr += data.toString('utf8')
		})

		pythonProcess.on('close', code => {
			// Убираем логи выхода Python
			if (code === 0) {
				try {
					// Ищем JSON в stdout
					const cleanStdout = stdout.trim()

					// Если stdout пустой, проверяем stderr
					let jsonStr = cleanStdout
					if (!jsonStr && stderr) {
						// Ищем JSON в stderr
						const stderrMatch = stderr.match(/\{.*\}/s)
						if (stderrMatch) {
							jsonStr = stderrMatch[0]
						}
					}

					if (!jsonStr) {
						reject(new Error('Python скрипт вернул пустой ответ'))
						return
					}

					// Парсим JSON
					const result = JSON.parse(jsonStr)
					resolve(result)
				} catch (parseError) {
					console.error('❌ Ошибка парсинга JSON от Python:')
					console.error('Stdout:', stdout)
					console.error('Stderr:', stderr)
					reject(new Error(`Ошибка парсинга JSON: ${parseError.message}`))
				}
			} else {
				reject(
					new Error(
						`Python ошибка (код ${code}): ${stderr || 'Неизвестная ошибка'}`,
					),
				)
			}
		})

		pythonProcess.on('error', error => {
			reject(new Error(`Ошибка запуска Python: ${error.message}`))
		})

		// Отправляем данные в Python
		const inputData = JSON.stringify(data, null, 2)
		pythonProcess.stdin.write(inputData, 'utf8')
		pythonProcess.stdin.end()
	})
}

async function testPythonConnection() {
	try {
		const pythonCheck = await checkPythonInstallation()

		if (!pythonCheck.installed) {
			return { success: false, error: 'Python не установлен' }
		}

		const testData = { action: 'test', message: 'Hello from Node.js' }
		const result = await callPythonScript('robokassa_handler.py', testData)

		return { success: true, result }
	} catch (error) {
		return { success: false, error: error.message }
	}
}

// ==================== ROBOKASSA API ====================

app.get('/api/test-python', async (req, res) => {
	try {
		const testResult = await testPythonConnection()
		res.json({
			success: testResult.success,
			message: testResult.success
				? 'Python работает корректно'
				: 'Ошибка Python',
			python_test: testResult,
		})
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error.message,
		})
	}
})

app.post('/api/robokassa/create-payment-link', async (req, res) => {
	try {
		const { productId, customerEmail, price, productName } = req.body

		if (!productId || !customerEmail || !price) {
			return res.status(400).json({
				success: false,
				error: 'Не указаны обязательные параметры',
			})
		}

		function generateInvoiceId() {
			const timestampPart = Math.floor(Date.now() / 1000)
			const randomPart = Math.floor(Math.random() * 10000)
			const uniqueId = parseInt(
				timestampPart.toString() + randomPart.toString().padStart(4, '0'),
			)
			return uniqueId % 1000000000
		}

		const invId = generateInvoiceId()

		// ПЕРЕДАЕМ ВСЁ КАК В ТЕСТОВОМ КОДЕ
		const pythonData = {
			action: 'generate_short_link',
			out_sum: parseFloat(price),
			inv_id: invId,
			description: encodeURIComponent(`Watchface ${productName || productId}`),
			email: customerEmail,
			product_name: productName || productId, // ВАЖНО: передаем название товара
			Culture: 'ru',
			is_test: false,
		}

		console.log(`\n\n\n`)
		console.log(
			`================================================================`,
		)
		console.log(`💰 СОЗДАНИЕ ПЛАТЕЖНОЙ ССЫЛКИ С RECEIPT`)
		console.log(`🛒 Товар: ${productId}`)
		console.log(`📧 Email: ${customerEmail}`)
		console.log(`💰 Цена: ${price} руб.`)
		console.log(`📋 Product Name: ${productName || productId}`)
		console.log(`\n`)

		const result = await callPythonScript('robokassa_handler.py', pythonData)

		if (!result.success) {
			throw new Error(result.error || 'Ошибка создания ссылки оплаты')
		}

		// СОЗДАЕМ ЗАКАЗ В FIREBASE
		const orderData = {
			orderId: invId,
			productId,
			customerEmail,
			price,
			productName: productName || `Циферблат ${productId}`,
			paymentUrl: result.payment_url,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			status: 'pending',
			isDaily: false,
			robokassaData: {
				is_test: result.is_test || false,
				method: result.method || 'manual_with_receipt',
				receipt_data: result.receipt_data || null, // сохраняем receipt для отладки
			},
		}

		// Сохраняем заказ в Firebase
		const saveResult = await saveOrderToFirebase(orderData)

		if (!saveResult) {
			console.log('⚠️  Firebase не работает, сохраняем локально')
			const oldReceivingId = saveOrderWithReceivingId(orderData)
			if (!oldReceivingId) {
				throw new Error('Ошибка сохранения заказа')
			}

			res.json({
				success: true,
				paymentUrl: result.payment_url,
				orderId: invId,
				receivingId: oldReceivingId,
				message: 'Ссылка для оплаты успешно создана (локальное сохранение)',
				test_mode: result.is_test || false,
			})
			return
		}

		console.log(`✅ Ссылка создана (с Receipt)`)
		console.log(`🔗 ${result.payment_url.substring(0, 100)}...`)
		console.log(`💾 Заказ ${invId} сохранен (ожидание оплаты)`)
		console.log(
			`================================================================`,
		)

		res.json({
			success: true,
			paymentUrl: result.payment_url,
			orderId: invId,
			receivingId: null, // НЕТ receivingId до оплаты!
			message: 'Ссылка для оплаты успешно создана с фискализацией',
			test_mode: result.is_test || false,
		})
	} catch (error) {
		console.error(`❌ Ошибка: ${error.message}`)
		res.status(500).json({
			success: false,
			error: error.message,
			message: 'Не удалось создать ссылку оплаты',
		})
	}
})

app.post('/api/robokassa/result', async (req, res) => {
	try {
		console.log('📨 ====== ROBOKASSA RESULT URL CALLBACK (POST) ======')
		console.log('📅 Time:', new Date().toISOString())
		console.log('🌐 IP:', req.ip)
		console.log('📦 Content-Type:', req.headers['content-type'])
		console.log('📦 Raw body keys:', Object.keys(req.body))

		// Robokassa отправляет как application/x-www-form-urlencoded
		// Node.js парсит все ключи в lowercase
		const rawParams = req.body

		// Нормализуем параметры - учитываем все возможные варианты имен
		const params = {
			OutSum: rawParams.OutSum || rawParams.out_summ || rawParams.outsum,
			InvId: rawParams.InvId || rawParams.inv_id || rawParams.invid,
			SignatureValue:
				rawParams.SignatureValue || rawParams.crc || rawParams.signaturevalue,
			Receipt: rawParams.Receipt || rawParams.receipt,
			IsTest: rawParams.IsTest || rawParams.istest || rawParams.is_test,
			Culture: rawParams.Culture || rawParams.culture,
			Email: rawParams.Email || rawParams.EMail || rawParams.email,
			Description: rawParams.Description || rawParams.description,
			PaymentMethod: rawParams.PaymentMethod || rawParams.paymentmethod,
			IncSum: rawParams.IncSum || rawParams.incsum,
			IncCurrLabel: rawParams.IncCurrLabel || rawParams.inccurrlabel,
			Fee: rawParams.Fee || rawParams.fee,
		}

		console.log('🔍 Normalized parameters:')
		console.log('- OutSum:', params.OutSum)
		console.log('- InvId:', params.InvId)
		console.log('- SignatureValue:', params.SignatureValue)
		console.log('- IsTest:', params.IsTest)
		console.log('- Culture:', params.Culture)
		console.log(
			'- Receipt:',
			params.Receipt
				? 'ПРИСУТСТВУЕТ (' + params.Receipt.substring(0, 50) + '...)'
				: 'ОТСУТСТВУЕТ',
		)
		console.log('- Email:', params.Email)
		console.log('- Description:', params.Description)
		console.log('- PaymentMethod:', params.PaymentMethod)
		console.log('- IncSum:', params.IncSum)
		console.log('- IncCurrLabel:', params.IncCurrLabel)
		console.log('- Fee:', params.Fee)

		// Проверяем обязательные параметры
		if (!params.OutSum || !params.InvId || !params.SignatureValue) {
			console.error('❌ MISSING REQUIRED PARAMETERS')
			console.error('- Has OutSum:', !!params.OutSum)
			console.error('- Has InvId:', !!params.InvId)
			console.error('- Has SignatureValue:', !!params.SignatureValue)
			console.error('- Raw params:', rawParams)
			return res.status(400).send('ERROR: Missing required parameters')
		}

		const orderId = parseInt(params.InvId)

		// Пробуем оба варианта проверки подписи
		let result = null
		let signatureValid = false

		// Сначала пробуем проверку С Receipt
		if (params.Receipt) {
			console.log('🐍 TRYING check_result_signature WITH receipt...')
			const pythonDataWithReceipt = {
				action: 'check_result_signature',
				out_sum: parseFloat(params.OutSum),
				inv_id: orderId,
				signature: params.SignatureValue,
				receipt: params.Receipt,
				IsTest: params.IsTest === '1',
				Culture: params.Culture || 'ru',
			}

			console.log(
				'🐍 Python data WITH receipt:',
				JSON.stringify(pythonDataWithReceipt, null, 2),
			)

			try {
				result = await callPythonScript(
					'robokassa_handler.py',
					pythonDataWithReceipt,
				)
				console.log('✅ Python check_result_signature WITH receipt RETURNED:')
				console.log('- Success:', result.success)
				console.log('- Is Valid:', result.is_valid)
				console.log('- Method:', result.method)
				console.log('- Error:', result.error || 'None')

				signatureValid = result.is_valid
			} catch (error) {
				console.log('❌ Python WITH receipt check failed:', error.message)
			}
		}

		// Если не прошло или нет Receipt, пробуем БЕЗ Receipt
		if (!signatureValid) {
			console.log('🐍 TRYING check_result_signature_simple WITHOUT receipt...')
			const pythonDataSimple = {
				action: 'check_result_signature_simple',
				out_sum: parseFloat(params.OutSum),
				inv_id: orderId,
				signature: params.SignatureValue,
				IsTest: params.IsTest === '1',
				Culture: params.Culture || 'ru',
			}

			console.log(
				'🐍 Python data WITHOUT receipt:',
				JSON.stringify(pythonDataSimple, null, 2),
			)

			try {
				result = await callPythonScript(
					'robokassa_handler.py',
					pythonDataSimple,
				)
				console.log('✅ Python check_result_signature_simple RETURNED:')
				console.log('- Success:', result.success)
				console.log('- Is Valid:', result.is_valid)
				console.log('- Calculated:', result.calculated)
				console.log('- Received:', result.received)
				console.log('- Error:', result.error || 'None')

				signatureValid = result.is_valid
			} catch (error) {
				console.log('❌ Python WITHOUT receipt check failed:', error.message)
			}
		}

		// Если все еще не валидно, пробуем ручную проверку
		if (!signatureValid) {
			console.log('🔍 Manual signature check as last resort...')
			const manualSignatureString = `${process.env.ROBOKASSA_LOGIN}:${params.OutSum}:${orderId}:${process.env.ROBOKASSA_PASS2}`
			const manualCalculated = crypto
				.createHash('md5')
				.update(manualSignatureString)
				.digest('hex')
				.toUpperCase()
			const manualReceived = params.SignatureValue.toUpperCase()

			console.log('🔍 Manual check details:')
			console.log('- String:', manualSignatureString)
			console.log('- Calculated:', manualCalculated)
			console.log('- Received:', manualReceived)

			if (manualCalculated === manualReceived) {
				console.log('✅ Manual signature check PASSED')
				signatureValid = true
				result = {
					success: true,
					is_valid: true,
					method: 'manual_check',
					calculated: manualCalculated,
				}
			} else {
				console.log('❌ Manual signature check FAILED')

				// ВНИМАНИЕ: Временный bypass для тестирования
				if (params.IsTest === '1') {
					console.warn('⚠️ Test mode - bypassing signature check for debugging')
					signatureValid = true
					result = {
						success: true,
						is_valid: true,
						method: 'bypassed_for_testing',
						bypassed: true,
					}
				}
			}
		}

		// Проверяем результат
		if (!result || !result.success) {
			console.error('❌ PYTHON SCRIPT ERROR:', result?.error || 'Unknown error')
			console.error('⚠️ Payment NOT confirmed - Python script failed')
			return res.status(400).send('ERROR: Python script error')
		}

		if (!signatureValid) {
			console.error('❌ ALL SIGNATURE CHECKS FAILED')
			console.error('🔒 Payment NOT confirmed - signature verification FAILED')
			return res.status(400).send('ERROR: Invalid signature')
		}

		console.log('🎉 PAYMENT CONFIRMED!')
		console.log(`📋 Order ID: ${orderId}`)
		console.log(`💰 Amount: ${params.OutSum} RUB`)
		console.log(`🧪 Test mode: ${params.IsTest === '1' ? 'YES' : 'NO'}`)
		console.log(`📝 Receipt provided: ${params.Receipt ? 'YES' : 'NO'}`)
		console.log(`🔐 Method used: ${result.method || 'unknown'}`)

		// ========== ПОЛУЧАЕМ ИЛИ СОЗДАЕМ ЗАКАЗ ==========
		let order = await getOrderByOrderIdFromFirebase(orderId)

		// ВАЖНО: Объявляем receivingId здесь
		let receivingId = null

		if (!order) {
			console.log(`⚠️ Order ${orderId} not found in Firebase`)
			console.log('🆕 Creating new order from Result URL data...')

			// Получаем email из параметров если есть
			let customerEmail = 'unknown@example.com'
			if (params.Email) {
				customerEmail = params.Email
			}

			// Получаем productId из description или параметров
			let productId = 'unknown'
			if (params.Description) {
				const match = params.Description.match(/KF\d{3}/i)
				if (match) {
					productId = match[0].toUpperCase()
				}
			}

			// Генерируем receivingId
			receivingId = generateReceivingId()

			// Создаем новый заказ с данными из Result URL
			order = {
				orderId: orderId,
				productId: productId,
				customerEmail: customerEmail,
				price: parseFloat(params.OutSum),
				productName: `Циферблат ${productId}`,
				status: 'paid',
				paymentUrl: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				paidAt: new Date().toISOString(),
				robokassaParams: params,
				robokassaData: {
					is_test: params.IsTest || '0',
					method: 'robokassa',
					signature_valid: signatureValid,
					signature_method: result.method || 'unknown',
					bypassed: result.bypassed || false,
					confirmed_via: 'result_url',
					confirmed_at: new Date().toISOString(),
					receipt_provided: !!params.Receipt,
				},
				isDaily: false,
				receivingId: receivingId,
				receivingUrl: `/purchase/receiving/${receivingId}`,
			}

			// Сохраняем новый заказ
			await set(ref(database, `orders/${orderId}`), order)

			// Создаем индекс для быстрого поиска
			await set(ref(database, `orderByReceivingId/${receivingId}`), {
				orderId: orderId,
				status: 'paid',
				receivingId: receivingId,
				productId: order.productId,
				customerEmail: order.customerEmail,
				createdAt: new Date().toISOString(),
				paidAt: order.paidAt || new Date().toISOString(),
			})

			console.log(`✅ Created new order ${orderId} from Result URL`)
			console.log(`🔗 Generated receivingId: ${receivingId}`)
		} else {
			console.log(`✅ Found existing order ${orderId}`)
			console.log(`📊 Current status: ${order.status}`)
			console.log(`📧 Customer email: ${order.customerEmail}`)
			console.log(`🛒 Product: ${order.productId}`)

			// Сохраняем существующий receivingId
			receivingId = order.receivingId || null

			// Обновляем статус на paid
			if (order.status !== 'paid') {
				console.log(
					`🔄 Updating order ${orderId} from "${order.status}" to "paid"`,
				)

				// Если нет receivingId, генерируем его
				if (!receivingId) {
					receivingId = generateReceivingId()
					console.log(`🔑 Generated new receivingId: ${receivingId}`)
				}

				const updates = {
					status: 'paid',
					paidAt: new Date().toISOString(),
					receivingId: receivingId,
					receivingUrl: `/purchase/receiving/${receivingId}`,
					robokassaParams: params,
					updatedAt: new Date().toISOString(),
					robokassaData: {
						...(order.robokassaData || {}),
						is_test: params.IsTest || '0',
						signature_valid: signatureValid,
						signature_method: result.method || 'unknown',
						bypassed: result.bypassed || false,
						confirmed_via: 'result_url',
						confirmed_at: new Date().toISOString(),
						receipt_provided: !!params.Receipt,
					},
				}

				await update(ref(database, `orders/${orderId}`), updates)

				// Обновляем индекс
				await set(ref(database, `orderByReceivingId/${receivingId}`), {
					orderId: orderId,
					status: 'paid',
					receivingId: receivingId,
					productId: order.productId,
					customerEmail: order.customerEmail,
					createdAt: new Date().toISOString(),
					paidAt: order.paidAt || new Date().toISOString(),
				})

				console.log(`✅ Order ${orderId} marked as PAID`)
				console.log(`🔗 Receiving URL: /purchase/receiving/${receivingId}`)

				// Обновляем локальный объект
				order = { ...order, ...updates }
			} else {
				console.log(`✅ Order ${orderId} already marked as paid`)
				console.log(`📅 Was paid at: ${order.paidAt}`)
				console.log(`🔗 Existing receiving URL: ${order.receivingUrl}`)
			}
		}

		// ========== ОТПРАВКА ПИСЬМА ==========
		try {
			const emailResult = await sendOrderEmail({
				orderId: orderId,
				productId: order.productId,
				productName: order.productName || `Циферблат ${order.productId}`,
				customerEmail: order.customerEmail,
				price: parseFloat(params.OutSum),
				paidAt: order.paidAt || new Date().toISOString(),
				receivingId: receivingId,
			})

			if (emailResult.success) {
				console.log(`✅ EMAIL SENT SUCCESSFULLY to ${order.customerEmail}`)
				console.log(`📧 Message ID: ${emailResult.messageId}`)

				// Логируем в Firebase
				await update(ref(database, `orders/${orderId}`), {
					emailSent: true,
					emailSentAt: new Date().toISOString(),
					emailMessageId: emailResult.messageId,
					updatedAt: new Date().toISOString(),
				})
			} else {
				console.log(`❌ EMAIL FAILED for ${order.customerEmail}`)
				console.log(`❌ Error: ${emailResult.error}`)

				// Логируем ошибку в Firebase
				await update(ref(database, `orders/${orderId}`), {
					emailSent: false,
					emailError: emailResult.error,
					emailErrorAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				})
			}
		} catch (emailErr) {
			console.log(`❌ CRITICAL EMAIL ERROR:`)
			console.log(`❌ Message: ${emailErr.message}`)
		}

		console.log(`📧 ====== EMAIL PROCESSING COMPLETE ======`)

		// ВАЖНО: Отправляем ответ Robokassa в правильном формате
		console.log(`📤 Sending response to Robokassa: "OK${orderId}"`)
		res.send('OK' + orderId)

		console.log('🎯 RESULT URL PROCESSING COMPLETE')
		console.log('='.repeat(50))
	} catch (error) {
		console.error('❌ CRITICAL ERROR in Result URL handler:')
		console.error('Message:', error.message)
		console.error('Stack:', error.stack)
		console.error('Params at time of error:', JSON.stringify(req.body, null, 2))
		res.status(500).send('ERROR: Server processing error')
	}
})

// Тестовый эндпоинт для Resend
app.get('/api/test-resend-email', async (req, res) => {
	try {
		const result = await sendOrderEmail({
			orderId: 999999,
			productId: 'KF159',
			productName: 'Циферблат KF159',
			customerEmail: 'selezneff.sergej2011@yandex.ru',
			price: 150,
			paidAt: new Date().toISOString(),
			receivingId: 'test-123',
		})
		res.json(result)
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.get('/api/debug/email-config', (req, res) => {
	const config = {
		EMAILJS_SERVICE_ID: process.env.EMAILJS_SERVICE_ID ? 'SET' : 'NOT SET',
		EMAILJS_TEMPLATE_ID: process.env.EMAILJS_TEMPLATE_ID ? 'SET' : 'NOT SET',
		EMAILJS_PUBLIC_KEY: process.env.EMAILJS_PUBLIC_KEY
			? 'SET (hidden)'
			: 'NOT SET',
		SITE_URL: process.env.SITE_URL || 'NOT SET',
		NODE_ENV: process.env.NODE_ENV || 'NOT SET',
	}

	res.json(config)
})

// ==================== SUCCESS URL ОБРАБОТКА ====================

app.get('/success', async (req, res) => {
	try {
		const params = req.query
		const orderId = parseInt(params.InvId)

		if (!orderId) {
			return res.redirect('/')
		}

		// 1. Ищем заказ в Firebase
		const order = await getOrderByOrderIdFromFirebase(orderId)

		// 2. Если заказ найден и оплачен - на страницу получения
		if (order && order.status === 'paid' && order.receivingId) {
			console.log(`✅ Success URL: перенаправляем на страницу получения`)
			return res.redirect(`/purchase/receiving/${order.receivingId}`)
		}

		// 3. Если заказ не найден или не оплачен
		// Возможно Result URL еще не обработал платеж
		// Просто показываем сообщение и редирект на главную
		console.log(`⚠️ Success URL: заказ ${orderId} еще не обработан`)

		return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Оплата обрабатывается</title>
        <meta http-equiv="refresh" content="5;url=/">
        <style>
          body { font-family: 'Comfortaa', cursive; text-align: center; padding: 50px; }
        </style>
      </head>
      <body>
        <h2>⏳ Оплата обрабатывается...</h2>
        <p>Ваш платеж получен и находится в обработке.</p>
        <p>Ссылка для скачивания будет отправлена на вашу почту.</p>
        <p>Через 5 секунд вы будете перенаправлены на главную страницу.</p>
      </body>
      </html>
    `)
	} catch (error) {
		console.error('Error in Success URL:', error)
		return res.redirect('/')
	}
})

// Эндпоинт для тестирования получения данных от Robokassa
app.post('/api/debug/robokassa-data', (req, res) => {
	console.log('🔍 ====== DEBUG ROBOKASSA DATA ======')
	console.log('📅 Time:', new Date().toISOString())
	console.log('📦 Headers:', req.headers)
	console.log('📦 Raw body:', req.body)
	console.log('📦 Query params:', req.query)
	console.log('📦 Content-Type:', req.get('Content-Type'))

	res.json({
		success: true,
		headers: req.headers,
		body: req.body,
		query: req.query,
		receivedAt: new Date().toISOString(),
	})
})

app.get('/api/test-email', async (req, res) => {
	try {
		const result = await sendOrderEmail({
			orderId: 999999,
			productId: 'KF159',
			productName: 'Циферблат KF159',
			customerEmail: 'koranitplay@gmail.com', // твоя почта для теста
			price: 150,
			paidAt: new Date().toISOString(),
			receivingId: 'test-123',
		})
		res.json(result)
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.get('/api/test-emailjs-email', async (req, res) => {
	try {
		const result = await sendTestEmail()
		res.json(result)
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.get('/api/test-mailersend-email', async (req, res) => {
	try {
		const result = await sendOrderEmail({
			orderId: 999999,
			productId: 'KF159',
			productName: 'Циферблат KF159',
			customerEmail: 'koranitplay@gmail.com',
			price: 150,
			paidAt: new Date().toISOString(),
			receivingId: 'test-123',
		})
		res.json(result)
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

// Дебаг-эндпоинт для проверки подписи
app.get('/api/debug/signature', async (req, res) => {
	try {
		const params = req.query
		const pythonData = {
			action: 'debug_signature',
			out_sum: parseFloat(params.OutSum || 120),
			inv_id: parseInt(params.InvId || 281476090),
			IsTest: params.IsTest || '1',
			Culture: params.Culture || 'ru',
		}

		const result = await callPythonScript('robokassa_handler.py', pythonData)

		// Добавляем ручную проверку для сравнения
		const manualCheck = {
			with_receipt: {
				string: `${process.env.ROBOKASSA_LOGIN}:${params.OutSum || 120}:${params.InvId || 281476090}:${result.receipt_encoded}:${process.env.ROBOKASSA_PASS1}`,
				signature: crypto
					.createHash('md5')
					.update(
						`${process.env.ROBOKASSA_LOGIN}:${params.OutSum || 120}:${params.InvId || 281476090}:${result.receipt_encoded}:${process.env.ROBOKASSA_PASS1}`,
					)
					.digest('hex'),
			},
			without_receipt: {
				string: `${process.env.ROBOKASSA_LOGIN}:${params.OutSum || 120}:${params.InvId || 281476090}:${process.env.ROBOKASSA_PASS2}`,
				signature: crypto
					.createHash('md5')
					.update(
						`${process.env.ROBOKASSA_LOGIN}:${params.OutSum || 120}:${params.InvId || 281476090}:${process.env.ROBOKASSA_PASS2}`,
					)
					.digest('hex'),
			},
		}

		res.json({
			...result,
			manual_check: manualCheck,
			env_vars: {
				ROBOKASSA_LOGIN: process.env.ROBOKASSA_LOGIN,
				ROBOKASSA_PASS1: process.env.ROBOKASSA_PASS1
					? '***' + process.env.ROBOKASSA_PASS1.slice(-3)
					: 'NOT SET',
				ROBOKASSA_PASS2: process.env.ROBOKASSA_PASS2
					? '***' + process.env.ROBOKASSA_PASS2.slice(-3)
					: 'NOT SET',
			},
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.get('/api/test/signature-check', async (req, res) => {
	try {
		const { out_sum, inv_id, signature, receipt } = req.query

		const pythonData = {
			action: 'check_result_signature',
			out_sum: parseFloat(out_sum || 120),
			inv_id: parseInt(inv_id || 141377873),
			signature: signature || '75F64EC5304E7CAB97975F268231842C',
			receipt: receipt || null,
			IsTest: true,
			Culture: 'ru',
		}

		const result = await callPythonScript('robokassa_handler.py', pythonData)

		// Также пробуем простую проверку
		const pythonDataSimple = {
			action: 'check_result_signature_simple',
			out_sum: parseFloat(out_sum || 120),
			inv_id: parseInt(inv_id || 141377873),
			signature: signature || '75F64EC5304E7CAB97975F268231842C',
			IsTest: true,
			Culture: 'ru',
		}

		const resultSimple = await callPythonScript(
			'robokassa_handler.py',
			pythonDataSimple,
		)

		// Ручная проверка
		const manualString = `${process.env.ROBOKASSA_LOGIN}:${out_sum || 120}:${inv_id || 141377873}:${process.env.ROBOKASSA_PASS2}`
		const manualSignature = crypto
			.createHash('md5')
			.update(manualString)
			.digest('hex')
			.toUpperCase()

		res.json({
			original_check: result,
			simple_check: resultSimple,
			manual_check: {
				string: manualString,
				calculated: manualSignature,
				received: signature || '75F64EC5304E7CAB97975F268231842C',
				match:
					manualSignature ===
					(signature || '75F64EC5304E7CAB97975F268231842C').toUpperCase(),
			},
			test_data: {
				out_sum: out_sum || 120,
				inv_id: inv_id || 141377873,
				signature: signature || '75F64EC5304E7CAB97975F268231842C',
				receipt: receipt || 'NOT PROVIDED',
			},
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.post('/api/test/signature-validation', async (req, res) => {
	try {
		const { out_sum, inv_id, signature, receipt } = req.body

		console.log('🔍 Testing signature validation with:')
		console.log('- out_sum:', out_sum)
		console.log('- inv_id:', inv_id)
		console.log('- signature:', signature)
		console.log('- receipt:', receipt ? 'PROVIDED' : 'NOT PROVIDED')

		// Тест 1: Проверка с receipt
		let resultWithReceipt = null
		if (receipt) {
			try {
				const pythonDataWith = {
					action: 'check_result_signature',
					out_sum: parseFloat(out_sum),
					inv_id: parseInt(inv_id),
					signature: signature,
					receipt: receipt,
					IsTest: true,
					Culture: 'ru',
				}
				resultWithReceipt = await callPythonScript(
					'robokassa_handler.py',
					pythonDataWith,
				)
			} catch (error) {
				console.log('❌ Check with receipt failed:', error.message)
			}
		}

		// Тест 2: Проверка без receipt
		let resultWithoutReceipt = null
		try {
			const pythonDataWithout = {
				action: 'check_result_signature_simple',
				out_sum: parseFloat(out_sum),
				inv_id: parseInt(inv_id),
				signature: signature,
				IsTest: true,
				Culture: 'ru',
			}
			resultWithoutReceipt = await callPythonScript(
				'robokassa_handler.py',
				pythonDataWithout,
			)
		} catch (error) {
			console.log('❌ Check without receipt failed:', error.message)
		}

		res.json({
			success: true,
			with_receipt: resultWithReceipt,
			without_receipt: resultWithoutReceipt,
			summary: {
				valid_with_receipt: resultWithReceipt?.is_valid || false,
				valid_without_receipt: resultWithoutReceipt?.is_valid || false,
				any_valid:
					resultWithReceipt?.is_valid ||
					false ||
					resultWithoutReceipt?.is_valid ||
					false,
			},
		})
	} catch (error) {
		res.status(500).json({ success: false, error: error.message })
	}
})

app.get('/api/robokassa/fail', async (req, res) => {
	try {
		const params = req.query
		const orderId = parseInt(params.InvId)

		// Обновляем статус заказа в Firebase
		const order = await getOrderByOrderIdFromFirebase(orderId)
		if (order) {
			await updateOrderStatusInFirebase(orderId, {
				status: 'failed',
				failedAt: new Date().toISOString(),
				robokassaFailParams: params,
			})
		} else {
			// Обновляем локально
			const orderFile = path.join(__dirname, 'orders', `order_${orderId}.json`)
			if (fs.existsSync(orderFile)) {
				const orderData = JSON.parse(fs.readFileSync(orderFile, 'utf8'))
				orderData.status = 'failed'
				orderData.failedAt = new Date().toISOString()
				fs.writeFileSync(orderFile, JSON.stringify(orderData, null, 2))
			}
		}

		res.redirect(`/payment-failed?orderId=${orderId}`)
	} catch (error) {
		res.redirect('/payment-error')
	}
})

app.post('/api/payment/create', async (req, res) => {
	try {
		const { productId, customerEmail, productName, price } = req.body

		if (!productId || !customerEmail) {
			return res.status(400).json({
				success: false,
				error: 'Не указаны обязательные параметры',
			})
		}

		const response = await fetch(
			`http://localhost:${PORT}/api/robokassa/create-payment-link`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					productId,
					customerEmail,
					productName,
					price: price || 150,
				}),
			},
		)

		const result = await response.json()

		if (!result.success) {
			throw new Error(result.error || 'Ошибка создания платежа')
		}

		res.json({
			success: true,
			paymentUrl: result.paymentUrl,
			orderId: result.orderId,
			receivingId: result.receivingId,
			message: 'Платеж создан успешно',
			test_mode: true,
		})
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error.message,
			message: 'Не удалось создать платеж',
		})
	}
})

// ==================== НОВЫЙ API ДЛЯ СКАЧИВАНИЯ ФАЙЛА ====================

app.get('/api/download/watchface/:receivingId', async (req, res) => {
	try {
		const { receivingId } = req.params

		// Пробуем получить заказ из Firebase
		let order = await getOrderByReceivingIdFromFirebase(receivingId)

		if (!order) {
			// Пробуем получить локально
			order = getOrderByReceivingId(receivingId)
		}

		if (!order) {
			return res.status(404).json({ error: 'Заказ не найден' })
		}

		if (order.status !== 'paid') {
			return res.status(403).json({ error: 'Заказ не оплачен' })
		}

		// Находим файл циферблата
		const watchPath = path.join(__dirname, 'public', 'watch')
		const productFolder = path.join(watchPath, order.productId)

		if (!fs.existsSync(productFolder)) {
			return res.status(404).json({ error: 'Файл циферблата не найден' })
		}

		// Ищем файл .apk в папке
		const files = fs.readdirSync(productFolder)
		const apkFile = files.find(file => file.toLowerCase().endsWith('.apk'))

		if (!apkFile) {
			return res.status(404).json({ error: 'Файл .apk не найден' })
		}

		const filePath = path.join(productFolder, apkFile)
		const fileName = `${order.productId}_${apkFile}`

		// Логируем скачивание
		console.log(
			`📥 Скачивание: ${receivingId}, файл: ${apkFile}, email: ${order.customerEmail}`,
		)

		// Отправляем файл
		res.download(filePath, fileName, err => {
			if (err) {
				console.error('Ошибка отправки файла:', err)
			}
		})
	} catch (error) {
		console.error('Ошибка загрузки файла:', error)
		res.status(500).json({ error: 'Ошибка сервера' })
	}
})

// ==================== СТРАНИЦА ПОЛУЧЕНИЯ ЗАКАЗА ====================

app.get('/purchase/receiving/:receivingId', (req, res) => {
	try {
		const { receivingId } = req.params

		// Проверяем существование HTML файла страницы
		const receivingPage = path.join(
			__dirname,
			'public',
			'html',
			'receiving.html',
		)

		if (!fs.existsSync(receivingPage)) {
			// Если файла нет, создаем простую страницу на лету
			// Сначала пробуем Firebase
			getOrderByReceivingIdFromFirebase(receivingId)
				.then(order => {
					if (!order) {
						// Пробуем локально
						order = getOrderByReceivingId(receivingId)
						if (!order) {
							return res.status(404).send('Заказ не найден')
						}
					}

					return res.send(createReceivingPage(order))
				})
				.catch(error => {
					console.error('Ошибка загрузки заказа:', error)
					return res.status(500).send('Ошибка сервера')
				})
		} else {
			// Если файл существует, отправляем его
			res.sendFile(receivingPage)
		}
	} catch (error) {
		console.error('Ошибка загрузки страницы получения:', error)
		res.status(500).send('Ошибка сервера')
	}
})

// Функция создания HTML страницы получения
function createReceivingPage(order) {
	return `
		<!DOCTYPE html>
		<html lang="ru">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Получение заказа - KF WATCH FACE</title>
			<style>
				* { margin: 0; padding: 0; box-sizing: border-box; }
				body { font-family: 'Comfortaa', cursive; background: linear-gradient(135deg, #f5f0e8 0%, #e8dfd0 100%); min-height: 100vh; }
				.container { max-width: 800px; margin: 0 auto; padding: 20px; }
				.header { background: white; padding: 20px; border-radius: 15px; margin-bottom: 30px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
				.logo { display: flex; align-items: center; gap: 15px; color: #8b7355; text-decoration: none; font-weight: 700; font-size: 1.5rem; }
				.content { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
				.success-icon { text-align: center; font-size: 4rem; color: #4CAF50; margin-bottom: 20px; }
				h1 { text-align: center; margin-bottom: 30px; color: #1a1a1a; }
				.order-info { background: #f9f9f9; padding: 25px; border-radius: 10px; margin-bottom: 30px; }
				.info-row { display: flex; justify-content: space-between; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee; }
				.info-row:last-child { border-bottom: none; margin-bottom: 0; }
				.label { color: #666; font-weight: 500; }
				.value { color: #1a1a1a; font-weight: 600; }
				.download-section { text-align: center; margin-top: 30px; }
				.btn-download { background: linear-gradient(135deg, #8b7355 0%, #a89176 100%); color: white; border: none; padding: 15px 40px; border-radius: 25px; font-size: 1.1rem; font-weight: 600; cursor: pointer; transition: transform 0.3s; text-decoration: none; display: inline-block; }
				.btn-download:hover { transform: translateY(-2px); }
				.instructions { margin-top: 40px; padding: 20px; background: #f0f7ff; border-radius: 10px; border-left: 4px solid #2196F3; }
				.instructions h3 { color: #2196F3; margin-bottom: 15px; }
				.warning { background: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 15px; border-radius: 8px; margin-top: 20px; }
				.support { margin-top: 30px; text-align: center; }
			</style>
		</head>
		<body>
			<div class="container">
				<div class="header">
					<a href="/" class="logo">
						<i class="fas fa-clock"></i>
						<span>KF WATCH FACE</span>
					</a>
				</div>
				
				<div class="content">
					<div class="success-icon">✓</div>
					<h1>Оплата успешно завершена!</h1>
					
					<div class="order-info">
						<div class="info-row">
							<span class="label">Номер заказа:</span>
							<span class="value">${order.orderId}</span>
						</div>
						<div class="info-row">
							<span class="label">Циферблат:</span>
							<span class="value">${order.productName || order.productId}</span>
						</div>
						<div class="info-row">
							<span class="label">Email:</span>
							<span class="value">${order.customerEmail}</span>
						</div>
						<div class="info-row">
							<span class="label">Сумма:</span>
							<span class="value">${order.price} ₽</span>
						</div>
						<div class="info-row">
							<span class="label">Статус:</span>
							<span class="value" style="color: #4CAF50;">Оплачено ✓</span>
						</div>
						<div class="info-row">
							<span class="label">Дата оплаты:</span>
							<span class="value">${new Date(order.paidAt || order.createdAt).toLocaleString(
								'ru-RU',
							)}</span>
						</div>
					</div>
					
					<div class="download-section">
						<h2>Скачайте файл циферблата</h2>
						<a href="/api/download/watchface/${order.receivingId}" class="btn-download">
							<i class="fas fa-download"></i> Скачать файл (*.apk)
						</a>
						<p style="margin-top: 15px; color: #666; font-size: 0.9rem;">
							Файл будет скачан в формате APK для установки на часы
						</p>
					</div>
					
					<div class="instructions">
						<h3><i class="fas fa-info-circle"></i> Как установить циферблат:</h3>
						<ol style="margin-left: 20px; margin-top: 15px;">
							<li>Скачайте файл выше на ваш телефон</li>
							<li>Установите приложение WearLoad, ADB App Control или Bugjaeger</li>
							<li>Подключите часы к телефону по Bluetooth</li>
							<li>Загрузите файл .apk через приложение на часы</li>
						</ol>
					</div>
					
					<div class="warning">
						<i class="fas fa-exclamation-triangle"></i>
						<strong>Важно:</strong> Для установки необходимы умные часы с Wear OS и подключение к телефону.
					</div>
					
					<div class="support">
						<p>Нужна помощь с установкой?</p>
						<a href="https://t.me/krek_free" target="_blank" style="color: #0088cc; text-decoration: none;">
							<i class="fab fa-telegram"></i> Написать в Telegram
						</a>
					</div>
				</div>
			</div>
			
			<script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js"></script>
		</body>
		</html>
	`
}

// API для проверки статуса заказа
app.get('/api/order/status/:orderId', async (req, res) => {
	try {
		const orderId = parseInt(req.params.orderId)
		const order = await getOrderByOrderIdFromFirebase(orderId)

		if (!order) {
			return res.status(404).json({
				status: 'not_found',
				message: 'Заказ не найден',
			})
		}

		res.json({
			status: order.status,
			orderId: order.orderId,
			receivingUrl: order.receivingUrl,
			paidAt: order.paidAt,
		})
	} catch (error) {
		res.status(500).json({
			status: 'error',
			message: 'Ошибка сервера',
		})
	}
})

// ==================== API ДЛЯ ПОЛУЧЕНИЯ ИНФОРМАЦИИ О ЗАКАЗЕ ====================

app.get('/api/order/receiving/:receivingId', async (req, res) => {
	try {
		const { receivingId } = req.params

		// Пробуем получить из Firebase
		let order = await getOrderByReceivingIdFromFirebase(receivingId)

		// Если нет в Firebase, проверяем локальные файлы (для обратной совместимости)
		if (!order) {
			order = getOrderByReceivingId(receivingId)
		}

		if (!order) {
			return res.status(404).json({ error: 'Заказ не найден' })
		}

		// Скрываем чувствительные данные
		const safeOrder = {
			orderId: order.orderId,
			productId: order.productId,
			productName: order.productName,
			customerEmail: order.customerEmail,
			price: order.price,
			status: order.status,
			paidAt: order.paidAt,
			createdAt: order.createdAt,
			isDaily: order.isDaily || false,
			receivingId: order.receivingId,
		}

		res.json(safeOrder)
	} catch (error) {
		console.error('Ошибка получения заказа:', error)
		res.status(500).json({ error: 'Ошибка сервера' })
	}
})

// ==================== ПРОВЕРКА ДОСТУПНОСТИ ССЫЛКИ ====================

app.get('/api/order/validate/:receivingId', async (req, res) => {
	try {
		const { receivingId } = req.params

		// Пробуем получить из Firebase
		let order = await getOrderByReceivingIdFromFirebase(receivingId)

		// Если нет в Firebase, проверяем локальные файлы
		if (!order) {
			order = getOrderByReceivingId(receivingId)
		}

		if (!order) {
			return res.json({ valid: false, reason: 'not_found' })
		}

		if (order.status !== 'paid') {
			return res.json({ valid: false, reason: 'not_paid' })
		}

		// Проверяем не истекла ли ссылка (например, 30 дней)
		const orderDate = new Date(order.paidAt || order.createdAt)
		const now = new Date()
		const daysDiff = (now - orderDate) / (1000 * 60 * 60 * 24)

		if (daysDiff > 30) {
			return res.json({
				valid: false,
				reason: 'expired',
				expiredDays: Math.floor(daysDiff),
			})
		}

		return res.json({
			valid: true,
			orderId: order.orderId,
			productName: order.productName,
		})
	} catch (error) {
		console.error('Ошибка валидации заказа:', error)
		res.json({ valid: false, reason: 'server_error' })
	}
})

// ==================== ОСНОВНЫЕ API ====================

app.get('/api/product/:productId', (req, res) => {
	try {
		const productId = parseInt(req.params.productId)
		const watchPath = path.join(__dirname, 'public', 'watch')

		if (!fs.existsSync(watchPath)) {
			return res.status(404).json({ error: 'Товар не найден' })
		}

		// Получаем все папки
		const folders = fs
			.readdirSync(watchPath, { withFileTypes: true })
			.filter(dirent => dirent.isDirectory())
			.map(dirent => dirent.name)
			.sort((a, b) => {
				const numA = extractFolderNumber(a)
				const numB = extractFolderNumber(b)
				return numB - numA
			})

		if (folders.length === 0) {
			return res.status(404).json({ error: 'Товары не найдены' })
		}

		// Ищем товар
		let folderName = null
		const rawFolders = fs
			.readdirSync(watchPath, { withFileTypes: true })
			.filter(dirent => dirent.isDirectory())
			.map(dirent => dirent.name)

		// По индексу
		if (productId > 0 && productId <= rawFolders.length) {
			folderName = rawFolders[productId - 1]
			console.log(
				`✅ Найден по индексу: ${folderName} (индекс ${productId - 1})`,
			)
		}

		// По номеру KFXXX
		if (!folderName) {
			for (const folder of folders) {
				if (extractFolderNumber(folder) === productId) {
					folderName = folder
					console.log(`✅ Найден по номеру KF: ${folderName}`)
					break
				}
			}
		}

		// Берем первый если не нашли
		if (!folderName) {
			folderName = folders[0]
			console.log(`⚠️  Не найден, берем первый: ${folderName}`)
		}

		const folderPath = path.join(watchPath, folderName)
		const files = getFolderFiles(folderPath)

		// Изображения
		const images = files
			.filter(file => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.type))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(file => ({
				name: file.name,
				type: file.type,
				url: `/api/view-file?folder=${encodeURIComponent(
					folderName,
				)}&file=${encodeURIComponent(file.name)}`,
				size: file.size,
			}))

		// Описание
		let description = ''
		const descFile = files.find(
			f =>
				f.name.toLowerCase() === 'описание.txt' ||
				f.name.toLowerCase() === 'description.txt',
		)
		if (descFile) {
			const descPath = path.join(folderPath, descFile.name)
			description = fs.readFileSync(descPath, 'utf-8')
		}

		// Цена
		let price = 150
		const priceFile = files.find(f => f.name.toLowerCase() === 'price.txt')
		if (priceFile) {
			const pricePath = path.join(folderPath, priceFile.name)
			const priceContent = fs.readFileSync(pricePath, 'utf-8').trim()
			price = parseInt(priceContent) || 150
		}

		console.log(`✅ Товар загружен успешно`)

		res.json({
			id: productId,
			folderId: extractFolderNumber(folderName),
			name: folderName,
			displayName: folderName,
			price: price,
			oldPrice: null,
			isNewProduct: false,
			images: images,
			description: description,
			folderName: folderName,
			totalImages: images.length,
			hasDescription: description.length > 0,
		})
	} catch (error) {
		console.error(`❌ Ошибка: ${error.message}`)
		res.status(500).json({
			error: 'Ошибка загрузки товара',
			details: error.message,
		})
	}
})

app.get('/api/products', (req, res) => {
	try {
		const watchPath = path.join(__dirname, 'public', 'watch')
		if (!fs.existsSync(watchPath)) {
			return res.json({
				products: [],
				latestProduct: null,
				stats: { total: 0 },
			})
		}

		// Получаем все папки
		const folders = fs
			.readdirSync(watchPath, { withFileTypes: true })
			.filter(dirent => dirent.isDirectory())
			.map(dirent => dirent.name)
			.sort((a, b) => {
				const numA = extractFolderNumber(a)
				const numB = extractFolderNumber(b)
				return numB - numA
			})

		if (folders.length === 0) {
			return res.json({
				products: [],
				latestProduct: null,
				stats: { total: 0 },
			})
		}

		// Новинка (первая папка)
		const latestFolder = folders[0]
		const latestFolderPath = path.join(watchPath, latestFolder)
		const latestFiles = getFolderFiles(latestFolderPath)

		const latestImages = latestFiles
			.filter(file => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.type))
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, 5)
			.map(file => ({
				name: file.name,
				url: `/api/view-file?folder=${encodeURIComponent(
					latestFolder,
				)}&file=${encodeURIComponent(file.name)}`,
			}))

		const latestProduct = {
			id: 1,
			name: latestFolder,
			displayName: latestFolder,
			price: 150,
			oldPrice: 190,
			isNewProduct: true,
			images: latestImages,
			folderName: latestFolder,
			totalImages: latestImages.length,
		}

		// Остальные товары
		const otherProducts = folders.slice(1).map((folder, index) => {
			const folderPath = path.join(watchPath, folder)
			const files = getFolderFiles(folderPath)

			const firstImage = files.find(file =>
				['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.type),
			)

			return {
				id: index + 2,
				name: folder,
				displayName: folder.replace(/(KF)(\d{3})/i, '$1 $2'),
				price: 150,
				folderName: folder,
				hasImage: !!firstImage,
				imageUrl: firstImage
					? `/api/view-file?folder=${encodeURIComponent(
							folder,
						)}&file=${encodeURIComponent(firstImage.name)}`
					: null,
				folderNumber: extractFolderNumber(folder),
			}
		})

		res.json({
			products: otherProducts,
			latestProduct: latestProduct,
			stats: {
				total: folders.length,
				latestFolder: latestFolder,
			},
		})
	} catch (error) {
		res.status(500).json({
			error: 'Ошибка загрузки товаров',
			products: [],
			latestProduct: null,
		})
	}
})

app.get('/api/watch-content', (req, res) => {
	try {
		const watchPath = path.join(__dirname, 'public', 'watch')

		if (!fs.existsSync(watchPath)) {
			return res.json({
				folders: [],
				stats: {
					totalFolders: 0,
					totalFiles: 0,
					totalImages: 0,
				},
				message: 'Папка watch не существует',
			})
		}

		const folders = fs
			.readdirSync(watchPath, { withFileTypes: true })
			.filter(dirent => dirent.isDirectory())
			.map(dirent => {
				const folderPath = path.join(watchPath, dirent.name)
				const files = getFolderFiles(folderPath)

				return {
					name: dirent.name,
					path: folderPath,
					files: files,
				}
			})

		const stats = calculateStats(folders)

		res.json({
			folders: folders,
			stats: stats,
			path: watchPath,
		})
	} catch (error) {
		res.status(500).json({
			error: 'Ошибка чтения папки',
			message: error.message,
		})
	}
})

// Вспомогательная функция для подсчета статистики
function calculateStats(folders) {
	let totalFolders = folders.length
	let totalFiles = 0
	let totalImages = 0

	folders.forEach(folder => {
		if (folder.files) {
			totalFiles += folder.files.length
			totalImages += folder.files.filter(file =>
				['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.type),
			).length
		}
	})

	return {
		totalFolders: totalFolders,
		totalFiles: totalFiles,
		totalImages: totalImages,
	}
}

app.post('/api/create-folder', (req, res) => {
	try {
		const { folderName, description } = req.body

		if (!folderName) {
			return res.status(400).json({ error: 'Не указано название папки' })
		}

		if (!/^[a-zA-Z0-9_\-]+$/.test(folderName)) {
			return res.status(400).json({
				error: 'Недопустимые символы в названии папки',
			})
		}

		const folderPath = path.join(__dirname, 'public', 'watch', folderName)

		if (fs.existsSync(folderPath)) {
			return res.status(400).json({ error: 'Папка уже существует' })
		}

		fs.mkdirSync(folderPath, { recursive: true })

		if (description) {
			const descPath = path.join(folderPath, 'description.txt')
			fs.writeFileSync(descPath, description)
		}

		const pricePath = path.join(folderPath, 'price.txt')
		fs.writeFileSync(pricePath, '150')

		res.json({
			success: true,
			message: 'Папка успешно создана',
			folderName: folderName,
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.post('/api/upload-files', upload.array('files'), (req, res) => {
	try {
		const folderName = req.body.folderName
		const files = req.files

		if (!folderName) {
			return res.status(400).json({ error: 'Не указана папка' })
		}

		if (!files || files.length === 0) {
			return res.status(400).json({ error: 'Нет файлов для загрузки' })
		}

		const folderPath = path.join(__dirname, 'public', 'watch', folderName)

		if (!fs.existsSync(folderPath)) {
			return res.status(404).json({ error: 'Папка не найдена' })
		}

		let uploadedCount = 0
		const uploadedFiles = []

		files.forEach(file => {
			try {
				const originalName = file.originalname
				const targetPath = path.join(folderPath, originalName)

				if (fs.existsSync(targetPath)) {
					const timestamp = Date.now()
					const nameWithoutExt = path.parse(originalName).name
					const ext = path.parse(originalName).ext
					const newFileName = `${nameWithoutExt}_${timestamp}${ext}`
					const newTargetPath = path.join(folderPath, newFileName)

					fs.renameSync(file.path, newTargetPath)
					uploadedFiles.push(newFileName)
				} else {
					fs.renameSync(file.path, targetPath)
					uploadedFiles.push(originalName)
				}

				uploadedCount++
			} catch (fileError) {
				console.error(`Ошибка обработки файла:`, fileError)
			}
		})

		res.json({
			success: true,
			message: 'Файлы успешно загружены',
			uploadedFiles: uploadedCount,
			files: uploadedFiles,
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.post('/api/rename-folder', (req, res) => {
	try {
		const { oldName, newName } = req.body

		if (!oldName || !newName) {
			return res.status(400).json({ error: 'Не указаны имена папки' })
		}

		if (!/^[a-zA-Z0-9_\-]+$/.test(newName)) {
			return res.status(400).json({
				error: 'Недопустимые символы в названии папки',
			})
		}

		const oldPath = path.join(__dirname, 'public', 'watch', oldName)
		const newPath = path.join(__dirname, 'public', 'watch', newName)

		if (!fs.existsSync(oldPath)) {
			return res.status(404).json({ error: 'Исходная папка не найдена' })
		}

		if (fs.existsSync(newPath)) {
			return res
				.status(400)
				.json({ error: 'Папка с таким именем уже существует' })
		}

		fs.renameSync(oldPath, newPath)

		res.json({
			success: true,
			message: 'Папка успешно переименована',
			oldName: oldName,
			newName: newName,
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.post('/api/delete-folder', (req, res) => {
	try {
		const { folderName } = req.body

		if (!folderName) {
			return res.status(400).json({ error: 'Не указано имя папки' })
		}

		const folderPath = path.join(__dirname, 'public', 'watch', folderName)

		if (!fs.existsSync(folderPath)) {
			return res.status(404).json({ error: 'Папка не найдена' })
		}

		fs.rmSync(folderPath, { recursive: true, force: true })

		res.json({
			success: true,
			message: 'Папка успешно удалена',
			folderName: folderName,
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.post('/api/delete-file', (req, res) => {
	try {
		const { folderName, fileName } = req.body

		if (!folderName || !fileName) {
			return res.status(400).json({ error: 'Не указаны папка или файл' })
		}

		const filePath = path.join(
			__dirname,
			'public',
			'watch',
			folderName,
			fileName,
		)

		if (!fs.existsSync(filePath)) {
			return res.status(404).json({ error: 'Файл не найден' })
		}

		fs.unlinkSync(filePath)

		res.json({
			success: true,
			message: 'Файл успешно удален',
			folderName: folderName,
			fileName: fileName,
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.get('/api/view-file', (req, res) => {
	try {
		const { folder, file, type } = req.query

		if (!file) {
			return res.status(400).json({ error: 'Не указан файл' })
		}

		let filePath

		if (type === 'guide' && folder) {
			filePath = path.join(__dirname, 'public', 'guide', folder, file)
		} else if (folder) {
			filePath = path.join(__dirname, 'public', 'watch', folder, file)
		} else {
			filePath = path.join(__dirname, 'public', 'guide', file)
		}

		if (!fs.existsSync(filePath)) {
			return res.status(404).json({ error: 'Файл не найден' })
		}

		const fileExt = path.extname(file).toLowerCase().replace('.', '')
		const contentTypes = {
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
			gif: 'image/gif',
			webp: 'image/webp',
			txt: 'text/plain; charset=utf-8',
			md: 'text/markdown; charset=utf-8',
			json: 'application/json',
			html: 'text/html; charset=utf-8',
			css: 'text/css; charset=utf-8',
			js: 'text/javascript; charset=utf-8',
		}

		const contentType = contentTypes[fileExt] || 'application/octet-stream'
		res.setHeader('Content-Type', contentType)

		// Кеширование для изображений
		if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
			res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
		}

		const fileStream = fs.createReadStream(filePath)
		fileStream.pipe(res)
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.get('/api/download-file', (req, res) => {
	try {
		const { folder, file } = req.query

		if (!folder || !file) {
			return res.status(400).json({ error: 'Не указаны папка или файл' })
		}

		const filePath = path.join(__dirname, 'public', 'watch', folder, file)

		if (!fs.existsSync(filePath)) {
			return res.status(404).json({ error: 'Файл не найден' })
		}

		res.download(filePath, file, err => {
			if (err) {
				res.status(500).json({ error: err.message })
			}
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.post('/api/scan-watch', (req, res) => {
	try {
		const watchPath = path.join(__dirname, 'public', 'watch')

		if (!fs.existsSync(watchPath)) {
			fs.mkdirSync(watchPath, { recursive: true })
		}

		res.json({
			success: true,
			message: 'Папка watch успешно отсканирована',
			path: watchPath,
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

// ==================== МАРШРУТЫ ДЛЯ СТРАНИЦЫ ПОКУПКИ ====================

app.get('/purchase/:id', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'purchase.html'))
})

app.get('/public/css/purchase.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'css', 'purchase.css'))
})

app.get('/public/js/purchase.js', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'js', 'purchase.js'))
})

app.get('/purchase.html', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'purchase.html'))
})

app.get('/fail', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'fail.html'))
})

// ==================== МАРШРУТЫ ДЛЯ ГАЙДОВ ====================

app.get('/api/guides/check', (req, res) => {
	try {
		const guidePath = path.join(__dirname, 'public', 'guide')
		const wearLoadPath = path.join(guidePath, 'WearLoad')

		const guides = {
			wearload: {
				exists: fs.existsSync(wearLoadPath),
				files: fs.existsSync(wearLoadPath) ? fs.readdirSync(wearLoadPath) : [],
				path: wearLoadPath,
			},
		}

		res.json({
			success: true,
			guides: guides,
			totalGuides: Object.keys(guides).length,
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

app.get('/api/guides/:guideName/images', (req, res) => {
	try {
		const guideName = req.params.guideName
		const guidePath = path.join(__dirname, 'public', 'guide', guideName)

		if (!fs.existsSync(guidePath)) {
			return res.status(404).json({ error: 'Гайд не найден' })
		}

		const files = fs
			.readdirSync(guidePath)
			.filter(file => {
				const ext = path.extname(file).toLowerCase().replace('.', '')
				return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
			})
			.sort((a, b) => {
				const numA = parseInt(a.match(/\d+/)?.[0]) || 0
				const numB = parseInt(b.match(/\d+/)?.[0]) || 0
				return numA - numB
			})
			.map(file => ({
				name: file,
				url: `/guide/${guideName}/${file}`,
				apiUrl: `/api/view-file?type=guide&folder=${encodeURIComponent(
					guideName,
				)}&file=${encodeURIComponent(file)}`,
			}))

		res.json({
			success: true,
			guideName: guideName,
			images: files,
			totalImages: files.length,
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
})

// ==================== ОСНОВНЫЕ МАРШРУТЫ ====================

app.get('/admin', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'admin.html'))
})

app.get('/modals', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'modals.html'))
})

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'index.html'))
})

app.get('/public/html/:filename', (req, res) => {
	const filePath = path.join(__dirname, 'public', 'html', req.params.filename)

	if (fs.existsSync(filePath)) {
		res.sendFile(filePath)
	} else {
		res.status(404).send('Файл не найден')
	}
})

app.get('/public/:folder/:filename', (req, res) => {
	const filePath = path.join(
		__dirname,
		'public',
		req.params.folder,
		req.params.filename,
	)

	if (fs.existsSync(filePath)) {
		res.sendFile(filePath)
	} else {
		res.status(404).send('Файл не найден')
	}
})

app.get('/guide/:guideName/:fileName', (req, res) => {
	const filePath = path.join(
		__dirname,
		'public',
		'guide',
		req.params.guideName,
		req.params.fileName,
	)

	if (fs.existsSync(filePath)) {
		const ext = path.extname(req.params.fileName).toLowerCase().replace('.', '')

		const contentTypes = {
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
			gif: 'image/gif',
			webp: 'image/webp',
			txt: 'text/plain',
		}

		const contentType = contentTypes[ext] || 'application/octet-stream'
		res.setHeader('Content-Type', contentType)

		if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
			res.setHeader('Cache-Control', 'public, max-age=604800')
		}

		res.sendFile(filePath)
	} else {
		res.status(404).send('Файл гайда не найден')
	}
})

// Обработка ошибок 404
app.use((req, res, next) => {
	res.status(404).send('Страница не найдена')
})

// Обработка ошибок сервера
app.use((err, req, res, next) => {
	console.error('Ошибка сервера:', err)
	res.status(500).send('Внутренняя ошибка сервера')
})

// Страница успешной оплаты (упрощенная версия для ручного перехода)
app.get('/payment-success', (req, res) => {
	const orderId = req.query.orderId
	res.send(`
		<!DOCTYPE html>
		<html lang="ru">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Оплата успешна</title>
			<style>
				.success-container {
					max-width: 600px;
					margin: 100px auto;
					padding: 40px;
					background: white;
					border-radius: 20px;
					box-shadow: 0 10px 30px rgba(0,0,0,0.1);
					text-align: center;
				}
				.success-icon {
					font-size: 4rem;
					color: #4CAF50;
					margin-bottom: 20px;
				}
				.btn-return {
					display: inline-block;
					margin-top: 20px;
					padding: 12px 30px;
					background: #8b7355;
					color: white;
					border-radius: 25px;
					text-decoration: none;
					font-weight: 600;
				}
			</style>
		</head>
		<body>
			<div class="success-container">
				<div class="success-icon">✓</div>
				<h1>Оплата успешно завершена!</h1>
				<p>Номер вашего заказа: <strong>${orderId || 'неизвестен'}</strong></p>
				<p>Переходите на страницу получения заказа для скачивания файла.</p>
				<a href="/" class="btn-return">Вернуться в магазин</a>
			</div>
		</body>
		</html>
	`)
})

app.get('/payment-failed', (req, res) => {
	const orderId = req.query.orderId
	res.send(`
		<!DOCTYPE html>
		<html lang="ru">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Оплата не прошла</title>
			<style>
				.error-container {
					max-width: 600px;
					margin: 100px auto;
					padding: 40px;
					background: white;
					border-radius: 20px;
					box-shadow: 0 10px 30px rgba(0,0,0,0.1);
					text-align: center;
				}
				.error-icon {
					font-size: 4rem;
					color: #ff6b6b;
					margin-bottom: 20px;
				}
				.btn-return {
					display: inline-block;
					margin-top: 20px;
					padding: 12px 30px;
					background: #8b7355;
					color: white;
					border-radius: 25px;
					text-decoration: none;
					font-weight: 600;
				}
			</style>
		</head>
		<body>
			<div class="error-container">
				<div class="error-icon">✗</div>
				<h1>Оплата не завершена</h1>
				<p>Номер вашего заказа: <strong>${orderId || 'неизвестен'}</strong></p>
				<p>Пожалуйста, попробуйте еще раз.</p>
				<a href="/" class="btn-return">Вернуться в магазин</a>
			</div>
		</body>
		</html>
	`)
})

app.get('/payment-error', (req, res) => {
	const reason = req.query.reason
	const reasonTexts = {
		missing_params: 'Отсутствуют обязательные параметры оплаты',
		order_not_found: 'Заказ не найден',
		server_error: 'Ошибка сервера',
		invalid_signature: 'Неверная подпись платежа',
		python_error: 'Ошибка Python скрипта',
		not_test_mode: 'Не тестовый режим (только для тестовых платежей)',
	}

	res.send(`
		<!DOCTYPE html>
		<html lang="ru">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Ошибка оплаты</title>
			<style>
				.error-container {
					max-width: 600px;
					margin: 100px auto;
					padding: 40px;
					background: white;
					border-radius: 20px;
					box-shadow: 0 10px 30px rgba(0,0,0,0.1);
					text-align: center;
				}
				.error-icon {
					font-size: 4rem;
					color: #ff6b6b;
					margin-bottom: 20px;
				}
				.btn-return {
					display: inline-block;
					margin-top: 20px;
					padding: 12px 30px;
					background: #8b7355;
					color: white;
					border-radius: 25px;
					text-decoration: none;
					font-weight: 600;
				}
				.btn-support {
					display: inline-block;
					margin-top: 10px;
					padding: 10px 25px;
					background: #0088cc;
					color: white;
					border-radius: 25px;
					text-decoration: none;
					font-weight: 600;
				}
			</style>
		</head>
		<body>
			<div class="error-container">
				<div class="error-icon">⚠️</div>
				<h1>Произошла ошибка при обработке оплаты</h1>
				<p>${reasonTexts[reason] || 'Неизвестная ошибка'}</p>
				<p>Номер ошибки: <code>${reason || 'неизвестно'}</code></p>
				<p>Пожалуйста, попробуйте еще раз или свяжитесь с поддержкой.</p>
				<a href="/" class="btn-return">Вернуться в магазин</a>
				<br>
				<a href="https://t.me/krek_free" target="_blank" class="btn-support">
					<i class="fab fa-telegram"></i> Связаться с поддержкой
				</a>
			</div>
		</body>
		</html>
	`)
})

// Запуск сервера
// Запуск сервера
app.listen(PORT, async () => {
	// ASCII-арт
	console.log(`\n\n\n`)
	console.log(`
██████╗ ███████╗ █████╗ ████████╗███████╗███████╗██████╗ 
██╔══██╗██╔════╝██╔══██╗╚══██╔══╝██╔════╝██╔════╝██╔══██╗
██║  ██║█████╗  ███████║   ██║   ███████╗█████╗  ██████╔╝
██║  ██║██╔══╝  ██╔══██║   ██║   ╚════██║██╔══╝  ██╔══██╗
██████╔╝███████╗██║  ██║   ██║   ███████║███████╗██║  ██║
╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚══════╝╚═╝  ╚═╝
	`)

	console.log(`\n\n\n`)
	console.log(
		`================================================================`,
	)
	console.log(`Сервис FIREBASE для базы данных - ПОДКЛЮЧЕН`)
	console.log(`\n\n`)
	console.log(`Сервис RESEND для отправки писем - ПОДКЛЮЧЕН`)
	console.log(`\n\n`)
	console.log(`Сервис ROBOKASSA для создания ссылок на оплату - ПОДКЛЮЧЕН`)
	console.log(
		`================================================================`,
	)
	console.log(`\n\n\n`)

	// Тестируем Python
	// Проверяем Python
	try {
		const pythonCheck = await checkPythonInstallation()
		if (pythonCheck.installed) {
		} else {
			console.log(`❌ Сервис ROBOKASSA: Python не установлен`)
		}
	} catch (error) {
		console.log(`❌ Сервис ROBOKASSA: ${error.message}`)
	}

	console.log(`\n\n\n`)
	console.log(
		`================================================================`,
	)
	console.log(`🚀 СЕРВЕР ЗАПУЩЕН`)
	console.log(`📅 Время запуска: ${new Date().toLocaleString()}`)
	console.log(
		`================================================================`,
	)
	console.log(`\n\n\n`)
})

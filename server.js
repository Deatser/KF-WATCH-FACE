const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const compression = require('compression')
const { spawn, exec } = require('child_process')
const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(compression())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))

// Добавляем статическую раздачу для папки guide
app.use('/guide', express.static(path.join(__dirname, 'public', 'guide')))
app.use('/static', express.static(path.join(__dirname, 'public')))

// Конфигурация multer для загрузки файлов
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, 'uploads/')
	},
	filename: function (req, file, cb) {
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
		cb(
			null,
			file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)
		)
	},
})

const upload = multer({ storage: storage })

// Создаем папку uploads если ее нет
if (!fs.existsSync('uploads')) {
	fs.mkdirSync('uploads', { recursive: true })
}

// Создаем папку guide если ее нет
const guidePath = path.join(__dirname, 'public', 'guide')
if (!fs.existsSync(guidePath)) {
	fs.mkdirSync(guidePath, { recursive: true })
	console.log('✓ Создана папка для гайдов:', guidePath)
}

// Создаем папку WearLoad внутри guide если ее нет
const wearLoadPath = path.join(guidePath, 'WearLoad')
if (!fs.existsSync(wearLoadPath)) {
	fs.mkdirSync(wearLoadPath, { recursive: true })
	console.log('✓ Создана папка для гайда WearLoad:', wearLoadPath)
}

// Вспомогательная функция для извлечения номера из KF###
function extractFolderNumber(folderName) {
	const match = folderName.match(/KF(\d{3})/i)
	return match ? parseInt(match[1]) : 0
}

// Вспомогательная функция для проверки, новинка ли товар
function isProductNew(folderName, allFolders) {
	const currentNum = extractFolderNumber(folderName)
	if (currentNum === 0) return false

	// Находим максимальный номер среди всех папок
	let maxNum = 0
	for (const folder of allFolders) {
		const num = extractFolderNumber(folder)
		if (num > maxNum) maxNum = num
	}

	return currentNum === maxNum
}

// Вспомогательная функция для получения файлов папки
function getFolderFiles(folderPath) {
	try {
		const files = fs.readdirSync(folderPath).map(filename => {
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

		return files
	} catch (error) {
		console.error('Ошибка чтения файлов папки:', error)
		return []
	}
}

// Вспомогательная функция для подсчета статистики
function calculateStats(folders) {
	let totalFolders = folders.length
	let totalFiles = 0
	let totalImages = 0

	folders.forEach(folder => {
		if (folder.files) {
			totalFiles += folder.files.length
			totalImages += folder.files.filter(file =>
				['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.type)
			).length
		}
	})

	return {
		totalFolders: totalFolders,
		totalFiles: totalFiles,
		totalImages: totalImages,
	}
}

// ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С PYTHON ====================

// Функция для проверки установки Python
async function checkPythonInstallation() {
	return new Promise((resolve, reject) => {
		console.log('🔍 Проверяем установку Python...')

		const pythonCommands = ['python3', 'python', 'py']

		function tryCommand(index) {
			if (index >= pythonCommands.length) {
				console.log('❌ Все команды Python не найдены')
				resolve({ installed: false, commands: [] })
				return
			}

			const cmd = pythonCommands[index]
			console.log(`  Пробуем команду: "${cmd}"`)

			exec(`${cmd} --version`, (error, stdout, stderr) => {
				if (error) {
					console.log(`    ❌ "${cmd}" не найдена: ${error.message}`)
					tryCommand(index + 1)
				} else {
					console.log(`    ✅ "${cmd}" найдена: ${stdout || stderr}`)
					resolve({
						installed: true,
						command: cmd,
						version: stdout || stderr,
						allCommands: pythonCommands,
					})
				}
			})
		}

		tryCommand(0)
	})
}

// Вспомогательная функция для вызова Python скрипта с подробным логированием
function callPythonScript(scriptName, data) {
	return new Promise(async (resolve, reject) => {
		console.log(`🔄 Вызов Python скрипта: ${scriptName}`)
		console.log(`📤 Данные для Python:`, JSON.stringify(data, null, 2))

		const scriptPath = path.join(__dirname, scriptName)
		console.log(`📁 Путь к скрипту: ${scriptPath}`)

		// Проверяем существует ли файл скрипта
		if (!fs.existsSync(scriptPath)) {
			console.error(`❌ Файл скрипта не найден: ${scriptPath}`)
			reject(new Error(`Файл Python скрипта не найден: ${scriptPath}`))
			return
		}

		console.log(`✅ Файл скрипта найден`)

		// Проверяем установку Python
		const pythonCheck = await checkPythonInstallation()

		if (!pythonCheck.installed) {
			const errorMsg =
				'Python не установлен. Установите Python 3 с https://python.org и добавьте в PATH'
			console.error(`❌ ${errorMsg}`)
			reject(new Error(errorMsg))
			return
		}

		const pythonCmd = pythonCheck.command
		console.log(`🐍 Используем Python команду: ${pythonCmd}`)

		const jsonData = JSON.stringify(data)
		console.log(`📦 Длина данных JSON: ${jsonData.length} байт`)

		// Используем spawn для лучшего контроля
		console.log(`🚀 Запускаем процесс Python...`)
		const pythonProcess = spawn(pythonCmd, [scriptPath])

		let stdout = ''
		let stderr = ''

		pythonProcess.stdout.on('data', data => {
			const dataStr = data.toString()
			stdout += dataStr
			console.log(`📥 Python stdout: ${dataStr.trim()}`)
		})

		pythonProcess.stderr.on('data', data => {
			const dataStr = data.toString()
			stderr += dataStr
			console.log(`📥 Python stderr: ${dataStr.trim()}`)
		})

		pythonProcess.on('close', code => {
			console.log(`📦 Python процесс завершился с кодом: ${code}`)
			console.log(
				`📥 Полный stdout: ${stdout.substring(0, 500)}${
					stdout.length > 500 ? '...' : ''
				}`
			)

			if (code === 0 && stdout.trim()) {
				try {
					const result = JSON.parse(stdout)
					console.log(`✅ Python скрипт выполнен успешно`)
					console.log(
						`📊 Результат от Python:`,
						JSON.stringify(result, null, 2)
					)
					resolve(result)
				} catch (parseError) {
					console.error(`❌ Ошибка парсинга JSON от Python:`)
					console.error(`   Ошибка: ${parseError.message}`)
					console.error(`   Stdout: ${stdout.substring(0, 200)}`)
					reject(
						new Error(`Ошибка парсинга ответа Python: ${parseError.message}`)
					)
				}
			} else {
				console.error(`❌ Python скрипт завершился с ошибкой (код ${code})`)
				console.error(`   Stderr: ${stderr}`)
				reject(
					new Error(
						`Python скрипт завершился с ошибкой: ${
							stderr || 'Неизвестная ошибка'
						}`
					)
				)
			}
		})

		pythonProcess.on('error', error => {
			console.error(`❌ Ошибка запуска Python процесса:`, error)
			reject(new Error(`Ошибка запуска Python: ${error.message}`))
		})

		// Отправляем данные в stdin
		console.log(`📤 Отправляем данные в Python stdin...`)
		pythonProcess.stdin.write(jsonData)
		pythonProcess.stdin.end()
		console.log(`✅ Данные отправлены в Python`)
	})
}

// Тестовая функция для проверки Python
async function testPythonConnection() {
	console.log('\n🧪 ==== ТЕСТИРОВАНИЕ PYTHON ====')
	try {
		const pythonCheck = await checkPythonInstallation()

		if (!pythonCheck.installed) {
			console.log('❌ Python не установлен')
			return { success: false, error: 'Python не установлен' }
		}

		console.log(
			`✅ Python найден: ${pythonCheck.command} (${pythonCheck.version})`
		)

		// Тестируем скрипт
		const testData = {
			action: 'test',
			message: 'Hello from Node.js',
		}

		console.log(`🧪 Отправляем тестовые данные в Python...`)
		const result = await callPythonScript('robokassa_handler.py', testData)

		console.log(`✅ Python тест пройден:`, result)
		return { success: true, result }
	} catch (error) {
		console.error(`❌ Ошибка тестирования Python:`, error)
		return { success: false, error: error.message }
	}
}

// ==================== API ДЛЯ ROBOKASSA ====================

// API для проверки работы Python
app.get('/api/test-python', async (req, res) => {
	console.log('\n🔧 ==== API: /api/test-python ====')
	console.log(`🌐 IP клиента: ${req.ip}`)
	console.log(`🕐 Время запроса: ${new Date().toISOString()}`)

	try {
		const testResult = await testPythonConnection()

		res.json({
			success: testResult.success,
			message: testResult.success
				? 'Python работает корректно'
				: 'Ошибка Python',
			python_test: testResult,
			timestamp: new Date().toISOString(),
			server_info: {
				node_version: process.version,
				platform: process.platform,
				arch: process.arch,
			},
		})
	} catch (error) {
		console.error('❌ Ошибка в API test-python:', error)
		res.status(500).json({
			success: false,
			error: error.message,
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
			timestamp: new Date().toISOString(),
		})
	}
})

// API для создания ссылки оплаты через Robokassa
app.post('/api/robokassa/create-payment-link', async (req, res) => {
	console.log('\n💰 ==== API: /api/robokassa/create-payment-link ====')
	console.log(`🌐 IP клиента: ${req.ip}`)
	console.log(`📦 Тело запроса:`, JSON.stringify(req.body, null, 2))

	try {
		const { productId, customerEmail, price, productName } = req.body

		if (!productId || !customerEmail || !price) {
			console.log('❌ Не указаны обязательные параметры')
			return res.status(400).json({
				success: false,
				error:
					'Не указаны обязательные параметры: productId, customerEmail, price',
				received: { productId, customerEmail, price },
			})
		}

		console.log(`🛒 Создаем платеж для товара: ${productId}`)
		console.log(`📧 Email покупателя: ${customerEmail}`)
		console.log(`💰 Цена: ${price} руб.`)

		// Создаем уникальный ID заказа
		const invId = Math.floor(100000 + Math.random() * 900000)
		console.log(`🆔 ID заказа: ${invId}`)

		const pythonData = {
			action: 'generate_short_link', // Или 'generate_long_link' для длинных
			out_sum: parseFloat(price),
			inv_id: invId,
			description: `Циферблат ${productName || productId}`,
			email: customerEmail,
			shp_product_id: productId,
			shp_email: customerEmail,
			shp_user_id: req.body.userId || 'anonymous',
			is_test: true, // Поставьте false для продакшена
		}
		console.log(`📤 Данные для Python:`, pythonData)

		// Вызываем Python скрипт
		console.log(`🐍 Вызываем Python скрипт...`)
		const result = await callPythonScript('robokassa_handler.py', pythonData)

		if (!result.success) {
			console.error(`❌ Python вернул ошибку:`, result.error)
			throw new Error(result.error || 'Ошибка создания ссылки оплаты')
		}

		console.log(`✅ Python успешно создал ссылку`)
		console.log(`🔗 Ссылка оплаты: ${result.payment_url}`)

		// Сохраняем информацию о заказе
		const orderData = {
			orderId: invId,
			productId,
			customerEmail,
			price,
			productName,
			paymentUrl: result.payment_url,
			createdAt: new Date().toISOString(),
			status: 'pending',
			pythonResult: result,
		}

		// Сохраняем во временный файл
		const ordersDir = path.join(__dirname, 'orders')
		if (!fs.existsSync(ordersDir)) {
			fs.mkdirSync(ordersDir, { recursive: true })
			console.log(`📁 Создана папка для заказов: ${ordersDir}`)
		}

		const orderFile = path.join(ordersDir, `order_${invId}.json`)
		fs.writeFileSync(orderFile, JSON.stringify(orderData, null, 2))
		console.log(`💾 Заказ сохранен в: ${orderFile}`)

		res.json({
			success: true,
			paymentUrl: result.payment_url,
			orderId: invId,
			message: 'Ссылка для оплаты успешно создана',
			test_mode: result.is_test || true,
			timestamp: new Date().toISOString(),
		})
	} catch (error) {
		console.error('❌ Ошибка создания ссылки оплаты:', error)
		console.error('Stack:', error.stack)

		res.status(500).json({
			success: false,
			error: error.message,
			message: 'Не удалось создать ссылку оплаты',
			timestamp: new Date().toISOString(),
			suggestion: 'Проверьте установку Python и файл robokassa_handler.py',
		})
	}
})

// API для обработки Result URL от Robokassa (POST запрос)
app.post('/api/robokassa/result', async (req, res) => {
	console.log('\n📨 ==== API: /api/robokassa/result ====')
	console.log(`🌐 IP отправителя: ${req.ip}`)
	console.log(`📦 Полученные данные:`, req.body)

	try {
		const params = req.body

		console.log(`🔄 Обрабатываем уведомление от Robokassa`)
		console.log(`💰 Сумма: ${params.OutSum}`)
		console.log(`🆔 ID заказа: ${params.InvId}`)
		console.log(`🔐 Подпись: ${params.SignatureValue}`)

		// Проверяем подпись
		const pythonData = {
			action: 'check_signature',
			out_sum: parseFloat(params.OutSum),
			inv_id: parseInt(params.InvId),
			signature: params.SignatureValue,
		}

		// Добавляем пользовательские параметры (shp_*)
		Object.keys(params).forEach(key => {
			if (key.startsWith('shp_')) {
				pythonData[key] = params[key]
			}
		})

		console.log(`📤 Данные для проверки подписи:`, pythonData)

		const result = await callPythonScript('robokassa_handler.py', pythonData)

		if (!result.success || !result.is_valid) {
			console.error(`❌ Неверная подпись платежа`)
			throw new Error('Неверная подпись платежа')
		}

		console.log(`✅ Подпись проверена успешно`)

		// Обновляем статус заказа
		const orderId = parseInt(params.InvId)
		const orderFile = path.join(__dirname, 'orders', `order_${orderId}.json`)

		if (fs.existsSync(orderFile)) {
			const orderData = JSON.parse(fs.readFileSync(orderFile, 'utf8'))
			orderData.status = 'paid'
			orderData.paidAt = new Date().toISOString()
			orderData.robokassaParams = params

			fs.writeFileSync(orderFile, JSON.stringify(orderData, null, 2))

			console.log(`✅ Заказ ${orderId} помечен как оплаченный`)

			// TODO: Здесь можно отправить письмо с файлом циферблата
			// или выполнить другие действия при успешной оплате
		} else {
			console.warn(`⚠️ Файл заказа не найден: ${orderId}`)
		}

		// Robokassa ожидает ответ "OK" в случае успеха
		console.log(`📨 Отправляем ответ "OK" Robokassa`)
		res.send('OK')
	} catch (error) {
		console.error('❌ Ошибка обработки Result URL:', error)
		console.error('Stack:', error.stack)
		res.status(500).send('ERROR')
	}
})

// API для обработки Success URL (перенаправление после успешной оплаты)
app.get('/api/robokassa/success', async (req, res) => {
	console.log('\n✅ ==== API: /api/robokassa/success ====')
	console.log(`🌐 IP клиента: ${req.ip}`)
	console.log(`📦 Query параметры:`, req.query)

	try {
		const params = req.query

		console.log(`🔄 Обрабатываем успешную оплату`)
		console.log(`💰 Сумма: ${params.OutSum}`)
		console.log(`🆔 ID заказа: ${params.InvId}`)

		// Проверяем подпись
		const pythonData = {
			action: 'check_signature',
			out_sum: parseFloat(params.OutSum),
			inv_id: parseInt(params.InvId),
			signature: params.SignatureValue,
		}

		// Добавляем пользовательские параметры (shp_*)
		Object.keys(params).forEach(key => {
			if (key.startswith('shp_')) {
				pythonData[key] = params[key]
			}
		})

		const result = await callPythonScript('robokassa_handler.py', pythonData)

		if (!result.success || !result.is_valid) {
			console.warn(`⚠️ Неверная подпись, но перенаправляем на страницу успеха`)
			// Все равно перенаправляем, но логируем предупреждение
		} else {
			console.log(`✅ Подпись проверена успешно`)
		}

		// Перенаправляем пользователя на страницу успешной оплаты
		console.log(`🔀 Перенаправляем на /payment-success`)
		res.redirect(`/payment-success?orderId=${params.InvId}`)
	} catch (error) {
		console.error('❌ Ошибка обработки Success URL:', error)
		res.redirect('/payment-error')
	}
})

// API для обработки Fail URL (перенаправление после неудачной оплаты)
app.get('/api/robokassa/fail', async (req, res) => {
	console.log('\n❌ ==== API: /api/robokassa/fail ====')
	console.log(`🌐 IP клиента: ${req.ip}`)
	console.log(`📦 Query параметры:`, req.query)

	try {
		const params = req.query

		console.log(`🔄 Обрабатываем неудачную оплату`)
		console.log(`💰 Сумма: ${params.OutSum}`)
		console.log(`🆔 ID заказа: ${params.InvId}`)

		// Обновляем статус заказа на "failed"
		const orderId = parseInt(params.InvId)
		const orderFile = path.join(__dirname, 'orders', `order_${orderId}.json`)

		if (fs.existsSync(orderFile)) {
			const orderData = JSON.parse(fs.readFileSync(orderFile, 'utf8'))
			orderData.status = 'failed'
			orderData.failedAt = new Date().toISOString()

			fs.writeFileSync(orderFile, JSON.stringify(orderData, null, 2))
			console.log(`📝 Заказ ${orderId} помечен как неудачный`)
		} else {
			console.warn(`⚠️ Файл заказа не найден: ${orderId}`)
		}

		// Перенаправляем пользователя на страницу ошибки оплаты
		console.log(`🔀 Перенаправляем на /payment-failed`)
		res.redirect(`/payment-failed?orderId=${params.InvId}`)
	} catch (error) {
		console.error('❌ Ошибка обработки Fail URL:', error)
		res.redirect('/payment-error')
	}
})

// Страница успешной оплаты
app.get('/payment-success', (req, res) => {
	const orderId = req.query.orderId
	console.log(`✅ Страница успешной оплаты для заказа: ${orderId}`)

	res.send(`
		<!DOCTYPE html>
		<html lang="ru">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Оплата успешна - KF WATCH FACE</title>
			<link rel="stylesheet" href="/public/css/style.css">
			<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
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
					transition: all 0.3s ease;
				}
				.btn-return:hover {
					background: #a89176;
					transform: translateY(-2px);
				}
				.debug-info {
					margin-top: 20px;
					padding: 15px;
					background: #f5f5f5;
					border-radius: 10px;
					font-family: monospace;
					font-size: 12px;
					text-align: left;
				}
			</style>
		</head>
		<body>
			<div class="success-container">
				<div class="success-icon">
					<i class="fas fa-check-circle"></i>
				</div>
				<h1>Оплата успешно завершена!</h1>
				<p>Номер вашего заказа: <strong>${orderId || 'неизвестен'}</strong></p>
				<p>Ссылка на скачивание циферблата и инструкция будут отправлены на ваш email.</p>
				<p>Если у вас возникнут вопросы, свяжитесь с нами в Telegram.</p>
				<a href="/" class="btn-return">Вернуться в магазин</a>
				
				<div class="debug-info">
					<strong>Информация для отладки:</strong><br>
					Заказ ID: ${orderId || 'нет'}<br>
					Время: ${new Date().toISOString()}<br>
					IP: ${req.ip}<br>
					Режим: Тестовый (Robokassa Demo)
				</div>
			</div>
		</body>
		</html>
	`)
})

// Страница неудачной оплаты
app.get('/payment-failed', (req, res) => {
	const orderId = req.query.orderId
	console.log(`❌ Страница неудачной оплаты для заказа: ${orderId}`)

	res.send(`
		<!DOCTYPE html>
		<html lang="ru">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Оплата не прошла - KF WATCH FACE</title>
			<link rel="stylesheet" href="/public/css/style.css">
			<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
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
					transition: all 0.3s ease;
				}
				.btn-return:hover {
					background: #a89176;
					transform: translateY(-2px);
				}
			</style>
		</head>
		<body>
			<div class="error-container">
				<div class="error-icon">
					<i class="fas fa-times-circle"></i>
				</div>
				<h1>Оплата не завершена</h1>
				<p>Номер вашего заказа: <strong>${orderId || 'неизвестен'}</strong></p>
				<p>Похоже, что-то пошло не так во время оплаты.</p>
				<p>Пожалуйста, попробуйте еще раз или свяжитесь с нами для помощи.</p>
				<a href="/" class="btn-return">Вернуться в магазин</a>
			</div>
		</body>
		</html>
	`)
})

// Обновленная функция для обработки платежа
app.post('/api/payment/create', async (req, res) => {
	console.log('\n💳 ==== API: /api/payment/create ====')
	console.log(`🌐 IP клиента: ${req.ip}`)
	console.log(`📦 Тело запроса:`, JSON.stringify(req.body, null, 2))

	try {
		const { productId, customerEmail, productName, price } = req.body

		if (!productId || !customerEmail) {
			console.log('❌ Не указаны обязательные параметры')
			return res.status(400).json({
				success: false,
				error: 'Не указаны обязательные параметры',
			})
		}

		console.log(`🛒 Создание платежа для товара: ${productId}`)
		console.log(`📧 Email покупателя: ${customerEmail}`)

		// Создаем ссылку на оплату через Robokassa
		const robokassaResponse = await fetch(
			`http://localhost:${PORT}/api/robokassa/create-payment-link`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					productId,
					customerEmail,
					productName,
					price: price || 150,
				}),
			}
		)

		const robokassaResult = await robokassaResponse.json()
		console.log(`📨 Ответ от Robokassa API:`, robokassaResult)

		if (!robokassaResult.success) {
			throw new Error(robokassaResult.error || 'Ошибка создания платежа')
		}

		res.json({
			success: true,
			paymentUrl: robokassaResult.paymentUrl,
			orderId: robokassaResult.orderId,
			message: 'Платеж создан успешно',
			test_mode: true,
			timestamp: new Date().toISOString(),
		})
	} catch (error) {
		console.error('❌ Ошибка создания платежа:', error)
		console.error('Stack:', error.stack)

		res.status(500).json({
			success: false,
			error: error.message,
			message: 'Не удалось создать платеж',
			timestamp: new Date().toISOString(),
		})
	}
})

// ==================== СУЩЕСТВУЮЩИЕ API (сохраняем все что было) ====================

// API для получения конкретного товара (все данные сразу)
app.get('/api/product/:productId', (req, res) => {
	console.log(`\n📦 ==== API: /api/product/${req.params.productId} ====`)
	console.log(`🌐 IP клиента: ${req.ip}`)

	try {
		const productId = parseInt(req.params.productId)
		const watchPath = path.join(__dirname, 'public', 'watch')

		console.log(`🔍 Поиск товара ID: ${productId}`)
		console.log(`📁 Путь к товарам: ${watchPath}`)

		if (!fs.existsSync(watchPath)) {
			console.log(`❌ Папка watch не найдена`)
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
				return numB - numA // Сортируем по убыванию (новые первыми)
			})

		console.log(`📂 Найдено папок: ${folders.length}`)

		if (folders.length === 0) {
			console.log(`❌ Товары не найдены`)
			return res.status(404).json({ error: 'Товары не найдены' })
		}

		// Получаем папки в исходном порядке (без сортировки)
		const rawFolders = fs
			.readdirSync(watchPath, { withFileTypes: true })
			.filter(dirent => dirent.isDirectory())
			.map(dirent => dirent.name)

		// Сортируем папки для определения новинки
		const sortedFolders = [...rawFolders].sort((a, b) => {
			const numA = extractFolderNumber(a)
			const numB = extractFolderNumber(b)
			return numB - numA // Новые первыми
		})

		// Логика поиска товара
		let folderName = null

		// Вариант 1: По номеру в URL (индексу) - используем ИСХОДНЫЙ порядок
		if (productId > 0 && productId <= rawFolders.length) {
			folderName = rawFolders[productId - 1]
			console.log(
				`✅ Найден по индексу: ${folderName} (индекс ${productId - 1})`
			)
		}

		// Вариант 2: По KFXXX номеру
		if (!folderName) {
			console.log(`🔍 Поиск по номеру KFXXX...`)
			for (const folder of folders) {
				const folderNumber = extractFolderNumber(folder)
				if (folderNumber === productId) {
					folderName = folder
					console.log(`✅ Найден по номеру: ${folderName}`)
					break
				}
			}
		}

		// Если не нашли, берем первый товар
		if (!folderName) {
			folderName = folders[0]
			console.log(`⚠️ Товар не найден, используем первый: ${folderName}`)
		}

		const folderPath = path.join(watchPath, folderName)
		console.log(`📁 Путь к товару: ${folderPath}`)

		const files = getFolderFiles(folderPath)
		console.log(`📄 Файлов в папке: ${files.length}`)

		// Получаем все изображения сразу
		const images = files
			.filter(file => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.type))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(file => ({
				name: file.name,
				type: file.type,
				url: `/api/view-file?folder=${encodeURIComponent(
					folderName
				)}&file=${encodeURIComponent(file.name)}`,
				size: file.size,
			}))

		console.log(`🖼️ Найдено изображений: ${images.length}`)

		// Получаем описание
		let description = ''
		const descFile = files.find(
			f =>
				f.name.toLowerCase() === 'описание.txt' ||
				f.name.toLowerCase() === 'description.txt'
		)
		if (descFile) {
			const descPath = path.join(folderPath, descFile.name)
			description = fs.readFileSync(descPath, 'utf-8')
			console.log(`📝 Описание найдено, длина: ${description.length} символов`)
		} else {
			console.log(`⚠️ Файл описания не найден`)
		}

		// Получаем цену
		let price = 150
		const priceFile = files.find(f => f.name.toLowerCase() === 'price.txt')
		if (priceFile) {
			const pricePath = path.join(folderPath, priceFile.name)
			const priceContent = fs.readFileSync(pricePath, 'utf-8').trim()
			price = parseInt(priceContent) || 150
			console.log(`💰 Цена из файла: ${price} руб.`)
		} else {
			console.log(
				`⚠️ Файл цены не найден, используем по умолчанию: ${price} руб.`
			)
		}

		// Определяем новинку
		const isNew = isProductNew(folderName, sortedFolders)
		console.log(`🆕 Это новинка: ${isNew}`)

		const responseData = {
			id: productId,
			folderId: extractFolderNumber(folderName),
			name: folderName,
			displayName: folderName.replace(/(KF)(\d{3})/i, '$1 $2'),
			price: price,
			oldPrice: isNew ? 190 : null,
			isNewProduct: isNew,
			images: images,
			description: description,
			folderName: folderName,
			totalImages: images.length,
			hasDescription: description.length > 0,
		}

		console.log(`✅ Товар загружен успешно`)

		res.json(responseData)
	} catch (error) {
		console.error('❌ Ошибка загрузки товара:', error)
		console.error('Stack:', error.stack)

		res.status(500).json({
			error: 'Ошибка загрузки товара',
			details: error.message,
			timestamp: new Date().toISOString(),
		})
	}
})

// API для получения всех товаров с оптимизацией
app.get('/api/products', async (req, res) => {
	console.log(`\n🛍️ ==== API: /api/products ====`)
	console.log(`🌐 IP клиента: ${req.ip}`)

	try {
		const watchPath = path.join(__dirname, 'public', 'watch')
		console.log(`📁 Путь к товарам: ${watchPath}`)

		if (!fs.existsSync(watchPath)) {
			console.log(`❌ Папка watch не существует`)
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

		console.log(`📂 Найдено товаров: ${folders.length}`)

		if (folders.length === 0) {
			console.log(`❌ Товары не найдены`)
			return res.json({
				products: [],
				latestProduct: null,
				stats: { total: 0 },
			})
		}

		// Берем первую папку как новинку
		const latestFolder = folders[0]
		const latestFolderPath = path.join(watchPath, latestFolder)
		const latestFiles = getFolderFiles(latestFolderPath)

		console.log(`🆕 Новинка: ${latestFolder}`)

		// Получаем изображения для новинки
		const latestImages = latestFiles
			.filter(file => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.type))
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, 5)
			.map(file => ({
				name: file.name,
				url: `/api/view-file?folder=${encodeURIComponent(
					latestFolder
				)}&file=${encodeURIComponent(file.name)}`,
			}))

		console.log(`🖼️ Изображений у новинки: ${latestImages.length}`)

		// Формируем данные новинки
		const latestProduct = {
			id: 1,
			name: latestFolder,
			displayName: latestFolder.replace(/(KF)(\d{3})/i, '$1 $2'),
			price: 150,
			oldPrice: 190,
			isNewProduct: true,
			images: latestImages,
			folderName: latestFolder,
			totalImages: latestImages.length,
		}

		// Формируем остальные товары
		const otherProducts = folders.slice(1).map((folder, index) => {
			const folderPath = path.join(watchPath, folder)
			const files = getFolderFiles(folderPath)

			// Берем только первое изображение для превью
			const firstImage = files.find(file =>
				['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.type)
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
							folder
					  )}&file=${encodeURIComponent(firstImage.name)}`
					: null,
				folderNumber: extractFolderNumber(folder),
			}
		})

		console.log(`✅ Товары загружены успешно`)

		res.json({
			products: otherProducts,
			latestProduct: latestProduct,
			stats: {
				total: folders.length,
				latestFolder: latestFolder,
			},
		})
	} catch (error) {
		console.error('❌ Ошибка загрузки товаров:', error)
		console.error('Stack:', error.stack)

		res.status(500).json({
			error: 'Ошибка загрузки товаров',
			products: [],
			latestProduct: null,
			timestamp: new Date().toISOString(),
		})
	}
})

// Оригинальный API для обратной совместимости
app.get('/api/watch-content', (req, res) => {
	console.log(`\n📁 ==== API: /api/watch-content ====`)

	try {
		const watchPath = path.join(__dirname, 'public', 'watch')
		console.log(`📁 Сканирование папки: ${watchPath}`)

		if (!fs.existsSync(watchPath)) {
			console.log(`❌ Папка watch не существует`)
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

		console.log(
			`📊 Статистика: ${stats.totalFolders} папок, ${stats.totalFiles} файлов, ${stats.totalImages} изображений`
		)

		res.json({
			folders: folders,
			stats: stats,
			path: watchPath,
		})
	} catch (error) {
		console.error('❌ Ошибка чтения папки watch:', error)
		res.status(500).json({
			error: 'Ошибка чтения папки',
			message: error.message,
		})
	}
})

// API для создания папки
app.post('/api/create-folder', (req, res) => {
	console.log(`\n📂 ==== API: /api/create-folder ====`)
	console.log(`📦 Тело запроса:`, req.body)

	try {
		const { folderName, description } = req.body

		if (!folderName) {
			console.log(`❌ Не указано название папки`)
			return res.status(400).json({ error: 'Не указано название папки' })
		}

		if (!/^[a-zA-Z0-9_\-]+$/.test(folderName)) {
			console.log(`❌ Недопустимые символы в названии: ${folderName}`)
			return res.status(400).json({
				error:
					'Недопустимые символы в названии папки. Можно использовать только буквы, цифры, дефис и подчеркивание.',
			})
		}

		const folderPath = path.join(__dirname, 'public', 'watch', folderName)
		console.log(`📁 Путь для создания: ${folderPath}`)

		if (fs.existsSync(folderPath)) {
			console.log(`❌ Папка уже существует: ${folderName}`)
			return res
				.status(400)
				.json({ error: 'Папка с таким именем уже существует' })
		}

		fs.mkdirSync(folderPath, { recursive: true })
		console.log(`✅ Папка создана: ${folderPath}`)

		if (description) {
			const descPath = path.join(folderPath, 'description.txt')
			fs.writeFileSync(descPath, description)
			console.log(`📝 Файл описания создан`)
		}

		const pricePath = path.join(folderPath, 'price.txt')
		fs.writeFileSync(pricePath, '150')
		console.log(`💰 Файл цены создан`)

		res.json({
			success: true,
			message: 'Папка успешно создана',
			path: folderPath,
			folderName: folderName,
		})
	} catch (error) {
		console.error('❌ Ошибка создания папки:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для загрузки файлов
app.post('/api/upload-files', upload.array('files'), (req, res) => {
	console.log(`\n📤 ==== API: /api/upload-files ====`)
	console.log(`📦 Данные формы:`, req.body)
	console.log(`📄 Загружено файлов: ${req.files ? req.files.length : 0}`)

	try {
		const folderName = req.body.folderName
		const files = req.files

		if (!folderName) {
			console.log(`❌ Не указана папка`)
			return res.status(400).json({ error: 'Не указана папка' })
		}

		if (!files || files.length === 0) {
			console.log(`❌ Нет файлов для загрузки`)
			return res.status(400).json({ error: 'Нет файлов для загрузки' })
		}

		const folderPath = path.join(__dirname, 'public', 'watch', folderName)
		console.log(`📁 Целевая папка: ${folderPath}`)

		if (!fs.existsSync(folderPath)) {
			console.log(`❌ Папка не найдена: ${folderName}`)
			return res.status(404).json({ error: 'Папка не найдена' })
		}

		let uploadedCount = 0
		const uploadedFiles = []

		files.forEach(file => {
			try {
				const originalName = file.originalname
				const targetPath = path.join(folderPath, originalName)

				console.log(`📤 Загрузка файла: ${originalName}`)

				if (fs.existsSync(targetPath)) {
					const timestamp = Date.now()
					const nameWithoutExt = path.parse(originalName).name
					const ext = path.parse(originalName).ext
					const newFileName = `${nameWithoutExt}_${timestamp}${ext}`
					const newTargetPath = path.join(folderPath, newFileName)

					fs.renameSync(file.path, newTargetPath)
					uploadedFiles.push(newFileName)
					console.log(`✅ Файл переименован: ${newFileName}`)
				} else {
					fs.renameSync(file.path, targetPath)
					uploadedFiles.push(originalName)
					console.log(`✅ Файл загружен: ${originalName}`)
				}

				uploadedCount++
			} catch (fileError) {
				console.error(
					`❌ Ошибка обработки файла ${file.originalname}:`,
					fileError
				)
			}
		})

		console.log(`✅ Загружено файлов: ${uploadedCount}`)

		res.json({
			success: true,
			message: 'Файлы успешно загружены',
			uploadedFiles: uploadedCount,
			files: uploadedFiles,
		})
	} catch (error) {
		console.error('❌ Ошибка загрузки файлов:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для переименования папки
app.post('/api/rename-folder', (req, res) => {
	console.log(`\n🔄 ==== API: /api/rename-folder ====`)
	console.log(`📦 Тело запроса:`, req.body)

	try {
		const { oldName, newName } = req.body

		if (!oldName || !newName) {
			console.log(`❌ Не указаны имена папок`)
			return res.status(400).json({ error: 'Не указаны имена папок' })
		}

		if (!/^[a-zA-Z0-9_\-]+$/.test(newName)) {
			console.log(`❌ Недопустимые символы в названии: ${newName}`)
			return res.status(400).json({
				error:
					'Недопустимые символы в названии папки. Можно использовать только буквы, цифры, дефис и подчеркивание.',
			})
		}

		const oldPath = path.join(__dirname, 'public', 'watch', oldName)
		const newPath = path.join(__dirname, 'public', 'watch', newName)

		console.log(`📁 Старый путь: ${oldPath}`)
		console.log(`📁 Новый путь: ${newPath}`)

		if (!fs.existsSync(oldPath)) {
			console.log(`❌ Исходная папка не найдена: ${oldName}`)
			return res.status(404).json({ error: 'Исходная папка не найдена' })
		}

		if (fs.existsSync(newPath)) {
			console.log(`❌ Папка с таким именем уже существует: ${newName}`)
			return res
				.status(400)
				.json({ error: 'Папка с таким именем уже существует' })
		}

		fs.renameSync(oldPath, newPath)
		console.log(`✅ Папка переименована: ${oldName} -> ${newName}`)

		res.json({
			success: true,
			message: 'Папка успешно переименована',
			oldName: oldName,
			newName: newName,
		})
	} catch (error) {
		console.error('❌ Ошибка переименования:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для удаления папки
app.post('/api/delete-folder', (req, res) => {
	console.log(`\n🗑️ ==== API: /api/delete-folder ====`)
	console.log(`📦 Тело запроса:`, req.body)

	try {
		const { folderName } = req.body

		if (!folderName) {
			console.log(`❌ Не указано имя папки`)
			return res.status(400).json({ error: 'Не указано имя папки' })
		}

		const folderPath = path.join(__dirname, 'public', 'watch', folderName)
		console.log(`📁 Путь для удаления: ${folderPath}`)

		if (!fs.existsSync(folderPath)) {
			console.log(`❌ Папка не найдена: ${folderName}`)
			return res.status(404).json({ error: 'Папка не найдена' })
		}

		fs.rmSync(folderPath, { recursive: true, force: true })
		console.log(`✅ Папка удалена: ${folderName}`)

		res.json({
			success: true,
			message: 'Папка успешно удалена',
			folderName: folderName,
		})
	} catch (error) {
		console.error('❌ Ошибка удаления:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для удаления файла
app.post('/api/delete-file', (req, res) => {
	console.log(`\n🗑️ ==== API: /api/delete-file ====`)
	console.log(`📦 Тело запроса:`, req.body)

	try {
		const { folderName, fileName } = req.body

		if (!folderName || !fileName) {
			console.log(`❌ Не указаны папка или файл`)
			return res.status(400).json({ error: 'Не указаны папка или файл' })
		}

		const filePath = path.join(
			__dirname,
			'public',
			'watch',
			folderName,
			fileName
		)

		console.log(`📁 Путь к файлу: ${filePath}`)

		if (!fs.existsSync(filePath)) {
			console.log(`❌ Файл не найден: ${fileName}`)
			return res.status(404).json({ error: 'Файл не найден' })
		}

		fs.unlinkSync(filePath)
		console.log(`✅ Файл удален: ${fileName}`)

		res.json({
			success: true,
			message: 'Файл успешно удален',
			folderName: folderName,
			fileName: fileName,
		})
	} catch (error) {
		console.error('❌ Ошибка удаления файла:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для просмотра файла с оптимизацией кеширования
app.get('/api/view-file', (req, res) => {
	console.log(`\n👁️ ==== API: /api/view-file ====`)
	console.log(`📦 Query параметры:`, req.query)

	try {
		const { folder, file, type } = req.query

		if (!file) {
			console.log(`❌ Не указан файл`)
			return res.status(400).json({ error: 'Не указан файл' })
		}

		let filePath

		// Если type === 'guide' - ищем в папке guide (для обратной совместимости)
		if (type === 'guide' && folder) {
			filePath = path.join(__dirname, 'public', 'guide', folder, file)
			console.log(`📁 Поиск в guide: ${filePath}`)
		}
		// Иначе ищем в папке watch (старый способ для изображений часов)
		else if (folder) {
			filePath = path.join(__dirname, 'public', 'watch', folder, file)
			console.log(`📁 Поиск в watch: ${filePath}`)
		}
		// Если нет folder, возможно это файл из guide
		else {
			// Пробуем найти в guide
			filePath = path.join(__dirname, 'public', 'guide', file)
			console.log(`📁 Поиск в корне guide: ${filePath}`)
		}

		if (!fs.existsSync(filePath)) {
			console.log(
				`❌ Файл не найден по основному пути, пробуем альтернативные...`
			)
			// Пробуем альтернативные пути для обратной совместимости
			if (folder) {
				// Пробуем с префиксом public/
				const altPath = path.join(__dirname, 'public', folder, file)
				console.log(`🔄 Пробуем альтернативный путь: ${altPath}`)
				if (fs.existsSync(altPath)) {
					filePath = altPath
					console.log(`✅ Файл найден по альтернативному пути`)
				} else {
					// Пробуем в guide/WearLoad
					const guidePath = path.join(
						__dirname,
						'public',
						'guide',
						'WearLoad',
						file
					)
					console.log(`🔄 Пробуем путь guide/WearLoad: ${guidePath}`)
					if (fs.existsSync(guidePath)) {
						filePath = guidePath
						console.log(`✅ Файл найден в guide/WearLoad`)
					} else {
						console.log(`❌ Файл не найден ни по одному из путей`)
						return res.status(404).json({ error: 'Файл не найден' })
					}
				}
			} else {
				console.log(`❌ Файл не найден`)
				return res.status(404).json({ error: 'Файл не найден' })
			}
		}

		const fileExt = path.extname(file).toLowerCase().replace('.', '')
		console.log(`📄 Расширение файла: ${fileExt}`)

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
		console.log(`📋 Content-Type: ${contentType}`)

		// Оптимизация кеширования для изображений
		if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
			// Кешируем изображения на 7 дней
			res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
			res.setHeader('Expires', new Date(Date.now() + 604800000).toUTCString())
			console.log(`⏰ Установлено кеширование на 7 дней`)
		}

		// Включаем сжатие для всех типов файлов
		res.setHeader('Content-Type', contentType)
		console.log(`✅ Отправляем файл: ${file}`)

		const fileStream = fs.createReadStream(filePath)
		fileStream.pipe(res)
	} catch (error) {
		console.error('❌ Ошибка просмотра файла:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для скачивания файла
app.get('/api/download-file', (req, res) => {
	console.log(`\n⬇️ ==== API: /api/download-file ====`)
	console.log(`📦 Query параметры:`, req.query)

	try {
		const { folder, file } = req.query

		if (!folder || !file) {
			console.log(`❌ Не указаны папка или файл`)
			return res.status(400).json({ error: 'Не указаны папка или файл' })
		}

		const filePath = path.join(__dirname, 'public', 'watch', folder, file)
		console.log(`📁 Путь к файлу: ${filePath}`)

		if (!fs.existsSync(filePath)) {
			console.log(`❌ Файл не найден`)
			return res.status(404).json({ error: 'Файл не найден' })
		}

		console.log(`✅ Файл найден, начинаем скачивание`)

		res.download(filePath, file, err => {
			if (err) {
				console.error('❌ Ошибка скачивания файла:', err)
				res.status(500).json({ error: err.message })
			} else {
				console.log(`✅ Файл скачан успешно`)
			}
		})
	} catch (error) {
		console.error('❌ Ошибка скачивания файла:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для сканирования папки
app.post('/api/scan-watch', (req, res) => {
	console.log(`\n🔍 ==== API: /api/scan-watch ====`)

	try {
		const watchPath = path.join(__dirname, 'public', 'watch')
		console.log(`📁 Сканирование папки: ${watchPath}`)

		if (!fs.existsSync(watchPath)) {
			console.log(`⚠️ Папка watch не существует, создаем...`)
			fs.mkdirSync(watchPath, { recursive: true })
			console.log(`✅ Папка создана`)
		} else {
			console.log(`✅ Папка уже существует`)
		}

		res.json({
			success: true,
			message: 'Папка watch успешно отсканирована',
			path: watchPath,
		})
	} catch (error) {
		console.error('❌ Ошибка сканирования:', error)
		res.status(500).json({ error: error.message })
	}
})

// ==================== МАРШРУТЫ ДЛЯ СТРАНИЦЫ ПОКУПКИ ====================

app.get('/purchase/:id', (req, res) => {
	console.log(`\n🛒 ==== Страница покупки: /purchase/${req.params.id} ====`)
	console.log(`🌐 IP клиента: ${req.ip}`)

	res.sendFile(path.join(__dirname, 'public', 'html', 'purchase.html'))
})

app.get('/public/css/purchase.css', (req, res) => {
	console.log(`📁 Запрос CSS покупки`)
	res.sendFile(path.join(__dirname, 'public', 'css', 'purchase.css'))
})

app.get('/public/js/purchase.js', (req, res) => {
	console.log(`📁 Запрос JS покупки`)
	res.sendFile(path.join(__dirname, 'public', 'js', 'purchase.js'))
})

app.get('/purchase.html', (req, res) => {
	console.log(`📁 Запрос purchase.html напрямую`)
	res.sendFile(path.join(__dirname, 'public', 'html', 'purchase.html'))
})

// ==================== МАРШРУТЫ ДЛЯ ГАЙДОВ ====================

// API для проверки существования гайдов
app.get('/api/guides/check', (req, res) => {
	console.log(`\n📚 ==== API: /api/guides/check ====`)

	try {
		const guidePath = path.join(__dirname, 'public', 'guide')
		const wearLoadPath = path.join(guidePath, 'WearLoad')

		console.log(`📁 Путь к гайдам: ${guidePath}`)
		console.log(`📁 Путь к WearLoad: ${wearLoadPath}`)

		const guides = {
			wearload: {
				exists: fs.existsSync(wearLoadPath),
				files: fs.existsSync(wearLoadPath) ? fs.readdirSync(wearLoadPath) : [],
				path: wearLoadPath,
			},
		}

		console.log(`✅ WearLoad существует: ${guides.wearload.exists}`)
		console.log(`📄 Файлов в WearLoad: ${guides.wearload.files.length}`)

		res.json({
			success: true,
			guides: guides,
			totalGuides: Object.keys(guides).length,
		})
	} catch (error) {
		console.error('❌ Ошибка проверки гайдов:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для получения списка изображений гайда
app.get('/api/guides/:guideName/images', (req, res) => {
	console.log(`\n🖼️ ==== API: /api/guides/${req.params.guideName}/images ====`)

	try {
		const guideName = req.params.guideName
		const guidePath = path.join(__dirname, 'public', 'guide', guideName)

		console.log(`📁 Путь к гайду: ${guidePath}`)

		if (!fs.existsSync(guidePath)) {
			console.log(`❌ Гайд не найден: ${guideName}`)
			return res.status(404).json({ error: 'Гайд не найден' })
		}

		const files = fs
			.readdirSync(guidePath)
			.filter(file => {
				const ext = path.extname(file).toLowerCase().replace('.', '')
				return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
			})
			.sort((a, b) => {
				// Сортируем по номеру в названии
				const numA = parseInt(a.match(/\d+/)?.[0]) || 0
				const numB = parseInt(b.match(/\d+/)?.[0]) || 0
				return numA - numB
			})
			.map(file => ({
				name: file,
				url: `/guide/${guideName}/${file}`,
				apiUrl: `/api/view-file?type=guide&folder=${encodeURIComponent(
					guideName
				)}&file=${encodeURIComponent(file)}`,
			}))

		console.log(`🖼️ Найдено изображений: ${files.length}`)

		res.json({
			success: true,
			guideName: guideName,
			images: files,
			totalImages: files.length,
		})
	} catch (error) {
		console.error('❌ Ошибка получения изображений гайда:', error)
		res.status(500).json({ error: error.message })
	}
})

// ==================== ОСНОВНЫЕ МАРШРУТЫ ====================

app.get('/admin', (req, res) => {
	console.log(`\n👑 ==== Админ панель запрошена ====`)
	console.log(`🌐 IP клиента: ${req.ip}`)

	res.sendFile(path.join(__dirname, 'public', 'html', 'admin.html'))
})

app.get('/modals', (req, res) => {
	console.log(`📁 Запрос modals.html`)
	res.sendFile(path.join(__dirname, 'public', 'html', 'modals.html'))
})

app.get('/', (req, res) => {
	console.log(`\n🏠 ==== Главная страница запрошена ====`)
	console.log(`🌐 IP клиента: ${req.ip}`)
	console.log(`👤 User-Agent: ${req.headers['user-agent']}`)

	res.sendFile(path.join(__dirname, 'public', 'html', 'index.html'))
})

app.get('/public/html/:filename', (req, res) => {
	const filePath = path.join(__dirname, 'public', 'html', req.params.filename)
	console.log(`📁 Запрос HTML файла: ${req.params.filename}`)

	if (fs.existsSync(filePath)) {
		console.log(`✅ Файл найден`)
		res.sendFile(filePath)
	} else {
		console.log(`❌ Файл не найден: ${filePath}`)
		res.status(404).send('Файл не найден')
	}
})

app.get('/public/:folder/:filename', (req, res) => {
	const filePath = path.join(
		__dirname,
		'public',
		req.params.folder,
		req.params.filename
	)
	console.log(
		`📁 Запрос статического файла: ${req.params.folder}/${req.params.filename}`
	)

	if (fs.existsSync(filePath)) {
		console.log(`✅ Файл найден`)
		res.sendFile(filePath)
	} else {
		console.log(`❌ Файл не найден: ${filePath}`)
		res.status(404).send('Файл не найден')
	}
})

// Статические маршруты для гайдов (дублируем для надежности)
app.get('/guide/:guideName/:fileName', (req, res) => {
	const filePath = path.join(
		__dirname,
		'public',
		'guide',
		req.params.guideName,
		req.params.fileName
	)
	console.log(
		`📁 Запрос файла гайда: ${req.params.guideName}/${req.params.fileName}`
	)

	if (fs.existsSync(filePath)) {
		// Определяем Content-Type
		const ext = path.extname(req.params.fileName).toLowerCase().replace('.', '')
		console.log(`📄 Расширение файла: ${ext}`)

		const contentTypes = {
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
			gif: 'image/gif',
			webp: 'image/webp',
			txt: 'text/plain',
		}

		const contentType = contentTypes[ext] || 'application/octet-stream'
		console.log(`📋 Content-Type: ${contentType}`)

		res.setHeader('Content-Type', contentType)

		// Кеширование
		if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
			res.setHeader('Cache-Control', 'public, max-age=604800')
			console.log(`⏰ Установлено кеширование на 7 дней`)
		}

		console.log(`✅ Отправляем файл`)
		res.sendFile(filePath)
	} else {
		console.log(`❌ Файл гайда не найден: ${filePath}`)
		res.status(404).send('Файл гайда не найден')
	}
})

// Обработка ошибок 404
app.use((req, res, next) => {
	console.log(`\n❓ ==== 404 Not Found ====`)
	console.log(`🌐 IP: ${req.ip}`)
	console.log(`📡 Метод: ${req.method}`)
	console.log(`🔗 URL: ${req.url}`)
	console.log(`👤 User-Agent: ${req.headers['user-agent']}`)

	res.status(404).send('Страница не найдена')
})

// Обработка ошибок сервера
app.use((err, req, res, next) => {
	console.error('\n🔥 ==== ОШИБКА СЕРВЕРА ====')
	console.error(`🌐 IP: ${req.ip}`)
	console.error(`📡 Метод: ${req.method}`)
	console.error(`🔗 URL: ${req.url}`)
	console.error(`💥 Ошибка:`, err)
	console.error(`📜 Stack:`, err.stack)

	res.status(500).send('Внутренняя ошибка сервера')
})

app.listen(PORT, async () => {
	console.log(`
██████╗ ███████╗ █████╗ ████████╗███████╗███████╗██████╗ 
██╔══██╗██╔════╝██╔══██╗╚══██╔══╝██╔════╝██╔════╝██╔══██╗
██║  ██║█████╗  ███████║   ██║   ███████╗█████╗  ██████╔╝
██║  ██║██╔══╝  ██╔══██║   ██║   ╚════██║██╔══╝  ██╔══██╗
██████╔╝███████╗██║  ██║   ██║   ███████║███████╗██║  ██║
╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚══════╝╚═╝  ╚═╝
    `)
	console.log(`🚀 Сервер запущен на порту: ${PORT}`)
	console.log(`📁 Админ панель: http://localhost:${PORT}/admin`)
	console.log(`🛒 Страница покупки: http://localhost:${PORT}/purchase/1`)
	console.log(`👁️ Папка watch: ${path.join(__dirname, 'public', 'watch')}`)
	console.log(`📚 Папка guide: ${path.join(__dirname, 'public', 'guide')}`)
	console.log(`📁 Папка uploads: ${path.join(__dirname, 'uploads')}`)
	console.log(`💰 Интеграция с Robokassa: активирована`)
	console.log(`⚡ Используется сжатие GZIP для ускорения загрузки`)
	console.log(`🔗 API для платежей:`)
	console.log(`   • GET  /api/test-python - тест Python`)
	console.log(`   • POST /api/payment/create - создание платежа`)
	console.log(
		`   • POST /api/robokassa/create-payment-link - создание ссылки Robokassa`
	)
	console.log(
		`   • POST /api/robokassa/result - обработка уведомлений от Robokassa`
	)
	console.log(`   • GET  /api/robokassa/success - успешная оплата`)
	console.log(`   • GET  /api/robokassa/fail - неудачная оплата`)
	console.log(`   • GET  /payment-success - страница успешной оплаты`)
	console.log(`   • GET  /payment-failed - страница неудачной оплаты`)
	console.log(`\n🔍 Проверяем подключение к Python...`)

	// Тестируем Python при запуске
	try {
		const pythonTest = await testPythonConnection()
		if (pythonTest.success) {
			console.log(`✅ Python подключен успешно!`)
		} else {
			console.log(`⚠️  Python не подключен: ${pythonTest.error}`)
			console.log(
				`ℹ️  Для работы Robokassa установите Python 3 с https://python.org`
			)
		}
	} catch (error) {
		console.error(`❌ Ошибка проверки Python: ${error.message}`)
	}

	console.log(`\n📊 Готов к работе! Время запуска: ${new Date().toISOString()}`)
})

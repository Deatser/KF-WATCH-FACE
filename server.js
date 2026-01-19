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

// Создаем необходимые папки
const requiredFolders = [
	'uploads',
	path.join('public', 'guide', 'WearLoad'),
	'orders',
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
			},
		})
		let stdout = ''
		let stderr = ''

		pythonProcess.stdout.on('data', data => {
			stdout += data.toString()
		})

		pythonProcess.stderr.on('data', data => {
			stderr += data.toString()
		})

		pythonProcess.on('close', code => {
			if (code === 0 && stdout.trim()) {
				try {
					const result = JSON.parse(stdout)
					resolve(result)
				} catch (parseError) {
					reject(new Error(`Ошибка парсинга JSON: ${parseError.message}`))
				}
			} else {
				reject(new Error(`Python ошибка: ${stderr || 'Неизвестная ошибка'}`))
			}
		})

		pythonProcess.on('error', error => {
			reject(new Error(`Ошибка запуска Python: ${error.message}`))
		})

		// И при записи данных:
		pythonProcess.stdin.write(JSON.stringify(data, null, 2), 'utf8')
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
			// База: текущий timestamp в секундах (10-11 цифр)
			const timestampPart = Math.floor(Date.now() / 1000)

			// Случайная часть: 4 случайные цифры
			const randomPart = Math.floor(Math.random() * 10000)

			// Объединяем: получаем 14-15 уникальных цифр
			const uniqueId = parseInt(
				timestampPart.toString() + randomPart.toString().padStart(4, '0')
			)

			// Берем последние 9 цифр (чтобы не превышать разумные пределы)
			return uniqueId % 1000000000 // 9 цифр максимум
		}

		const invId = generateInvoiceId()

		const pythonData = {
			action: 'generate_short_link',
			out_sum: parseFloat(price), // Сумма (обязательно)
			inv_id: invId, // ID заказа (обязательно)
			description: encodeURIComponent(`Watchface ${productName || productId}`),
			email: customerEmail, // Email покупателя (обязательно для отправки чека)
			shp_product_id: productId, // ID товара (важно для отслеживания)
			Culture: 'ru', // или 'en'
			IncCurr: '',
			is_test: true, // Тестовый/продакшн режим
		}

		console.log(`💰 ==== API: /api/robokassa/create-payment-link ====`)
		console.log(`🌐 IP клиента: ${req.ip}`)
		console.log(`🛒 Создаем платеж для товара: ${productId}`)
		console.log(`📧 Email покупателя: ${customerEmail}`)
		console.log(`💰 Цена: ${price} руб.`)
		console.log(`🆔 ID заказа: ${invId}`)

		const result = await callPythonScript('robokassa_handler.py', pythonData)

		if (!result.success) {
			throw new Error(result.error || 'Ошибка создания ссылки оплаты')
		}

		// Сохраняем заказ
		const orderData = {
			orderId: invId,
			productId,
			customerEmail,
			price,
			productName,
			paymentUrl: result.payment_url,
			createdAt: new Date().toISOString(),
			status: 'pending',
		}

		const orderFile = path.join(__dirname, 'orders', `order_${invId}.json`)
		fs.writeFileSync(orderFile, JSON.stringify(orderData, null, 2))

		console.log(`✅ Python успешно создал ссылку`)
		console.log(`🔗 Ссылка оплаты: ${result.payment_url}`)
		console.log(`💾 Заказ сохранен в: ${orderFile}`)

		res.json({
			success: true,
			paymentUrl: result.payment_url,
			orderId: invId,
			message: 'Ссылка для оплаты успешно создана',
			test_mode: result.is_test || true,
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
		const params = req.body

		const pythonData = {
			action: 'check_signature',
			out_sum: parseFloat(params.OutSum),
			inv_id: parseInt(params.InvId),
			signature: params.SignatureValue,
		}

		Object.keys(params).forEach(key => {
			if (key.startsWith('shp_')) {
				pythonData[key] = params[key]
			}
		})

		const result = await callPythonScript('robokassa_handler.py', pythonData)

		if (!result.success || !result.is_valid) {
			throw new Error('Неверная подпись платежа')
		}

		// Обновляем статус заказа
		const orderId = parseInt(params.InvId)
		const orderFile = path.join(__dirname, 'orders', `order_${orderId}.json`)

		if (fs.existsSync(orderFile)) {
			const orderData = JSON.parse(fs.readFileSync(orderFile, 'utf8'))
			orderData.status = 'paid'
			orderData.paidAt = new Date().toISOString()
			orderData.robokassaParams = params
			fs.writeFileSync(orderFile, JSON.stringify(orderData, null, 2))
		}

		res.send('OK')
	} catch (error) {
		res.status(500).send('ERROR')
	}
})

app.get('/api/robokassa/success', async (req, res) => {
	try {
		const params = req.query
		const orderId = parseInt(params.InvId)

		// Перенаправляем на страницу успешной оплаты
		res.redirect(`/payment-success?orderId=${orderId}`)
	} catch (error) {
		res.redirect('/payment-error')
	}
})

app.get('/api/robokassa/fail', async (req, res) => {
	try {
		const params = req.query
		const orderId = parseInt(params.InvId)

		// Обновляем статус заказа
		const orderFile = path.join(__dirname, 'orders', `order_${orderId}.json`)
		if (fs.existsSync(orderFile)) {
			const orderData = JSON.parse(fs.readFileSync(orderFile, 'utf8'))
			orderData.status = 'failed'
			orderData.failedAt = new Date().toISOString()
			fs.writeFileSync(orderFile, JSON.stringify(orderData, null, 2))
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
			}
		)

		const result = await response.json()

		if (!result.success) {
			throw new Error(result.error || 'Ошибка создания платежа')
		}

		res.json({
			success: true,
			paymentUrl: result.paymentUrl,
			orderId: result.orderId,
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

// ==================== ОСНОВНЫЕ API ====================

app.get('/api/product/:productId', (req, res) => {
	try {
		const productId = parseInt(req.params.productId)
		const watchPath = path.join(__dirname, 'public', 'watch')

		console.log(`📦 ==== API: /api/product/${productId} ====`)
		console.log(`🌐 IP клиента: ${req.ip}`)
		console.log(`🔍 Поиск товара ID: ${productId}`)

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
				`✅ Найден по индексу: ${folderName} (индекс ${productId - 1})`
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
					folderName
				)}&file=${encodeURIComponent(file.name)}`,
				size: file.size,
			}))

		// Описание
		let description = ''
		const descFile = files.find(
			f =>
				f.name.toLowerCase() === 'описание.txt' ||
				f.name.toLowerCase() === 'description.txt'
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
					latestFolder
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
			return res.status(400).json({ error: 'Не указаны имена папок' })
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
			fileName
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

app.get('/success', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'success.html'))
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
					guideName
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
		req.params.filename
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
		req.params.fileName
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

// Страница успешной оплаты
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
                <p>Номер вашего заказа: <strong>${
									orderId || 'неизвестен'
								}</strong></p>
                <p>Ссылка на скачивание будет отправлена на ваш email.</p>
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
                <p>Номер вашего заказа: <strong>${
									orderId || 'неизвестен'
								}</strong></p>
                <p>Пожалуйста, попробуйте еще раз.</p>
                <a href="/" class="btn-return">Вернуться в магазин</a>
            </div>
        </body>
        </html>
    `)
})

// Запуск сервера
app.listen(PORT, async () => {
	// ASCII-арт
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
	console.log(`🛒 Магазин: http://localhost:${PORT}/`)
	console.log(`💰 Интеграция с Robokassa: активирована`)
	console.log(`⚡ Сжатие GZIP: включено`)

	// Тестируем Python
	console.log(`\n🔍 Проверяем подключение к Python...`)
	try {
		const pythonTest = await testPythonConnection()
		if (pythonTest.success) {
			console.log(`✅ Python подключен успешно!`)
			console.log(`📦 Библиотека: ${pythonTest.result.library_version}`)
			console.log(`🏪 Мерчант: ${pythonTest.result.merchant_login}`)
			console.log(
				`🧪 Режим: ${pythonTest.result.is_test ? 'Тестовый' : 'Продакшн'}`
			)
		} else {
			console.log(`⚠️ Python не подключен: ${pythonTest.error}`)
		}
	} catch (error) {
		console.error(`❌ Ошибка проверки Python: ${error.message}`)
	}

	console.log(
		`\n📊 Готов к работе! Время запуска: ${new Date().toLocaleString()}`
	)
})

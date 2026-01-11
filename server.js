const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const compression = require('compression') // Добавляем сжатие
const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(compression()) // Включаем сжатие GZIP
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))

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

// ==================== НОВЫЕ ОПТИМИЗИРОВАННЫЕ API ====================

// API для получения конкретного товара (все данные сразу)
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
				return numB - numA // Сортируем по убыванию (новые первыми)
			})

		if (folders.length === 0) {
			return res.status(404).json({ error: 'Товары не найдены' })
		}

		// Логика поиска товара
		let folderName = null

		// Вариант 1: По номеру в URL (индексу)
		if (productId > 0 && productId <= folders.length) {
			folderName = folders[productId - 1]
		}

		// Вариант 2: По KFXXX номеру
		if (!folderName) {
			for (const folder of folders) {
				const folderNumber = extractFolderNumber(folder)
				if (folderNumber === productId) {
					folderName = folder
					break
				}
			}
		}

		// Если не нашли, берем первый товар
		if (!folderName) {
			folderName = folders[0]
		}

		const folderPath = path.join(watchPath, folderName)
		const files = getFolderFiles(folderPath)

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
		}

		// Получаем цену
		let price = 150
		const priceFile = files.find(f => f.name.toLowerCase() === 'price.txt')
		if (priceFile) {
			const pricePath = path.join(folderPath, priceFile.name)
			const priceContent = fs.readFileSync(pricePath, 'utf-8').trim()
			price = parseInt(priceContent) || 150
		}

		// Определяем новинку
		const isNew = isProductNew(folderName, folders)

		res.json({
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
		})
	} catch (error) {
		console.error('Ошибка загрузки товара:', error)
		res
			.status(500)
			.json({ error: 'Ошибка загрузки товара', details: error.message })
	}
})

// API для получения всех товаров с оптимизацией (для главной страницы)
app.get('/api/products', async (req, res) => {
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
				return numB - numA // Сортируем по убыванию (новые первыми)
			})

		if (folders.length === 0) {
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

		// Получаем изображения для новинки
		const latestImages = latestFiles
			.filter(file => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.type))
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, 5) // Ограничиваем 5 изображениями для превью
			.map(file => ({
				name: file.name,
				url: `/api/view-file?folder=${encodeURIComponent(
					latestFolder
				)}&file=${encodeURIComponent(file.name)}`,
			}))

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

		// Формируем остальные товары (без детальной загрузки изображений для скорости)
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

		res.json({
			products: otherProducts,
			latestProduct: latestProduct,
			stats: {
				total: folders.length,
				latestFolder: latestFolder,
			},
		})
	} catch (error) {
		console.error('Ошибка загрузки товаров:', error)
		res.status(500).json({
			error: 'Ошибка загрузки товаров',
			products: [],
			latestProduct: null,
		})
	}
})

// Оригинальный API для обратной совместимости
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
		console.error('Ошибка чтения папки watch:', error)
		res.status(500).json({
			error: 'Ошибка чтения папки',
			message: error.message,
		})
	}
})

// API для создания папки
app.post('/api/create-folder', (req, res) => {
	try {
		const { folderName, description } = req.body

		if (!folderName) {
			return res.status(400).json({ error: 'Не указано название папки' })
		}

		if (!/^[a-zA-Z0-9_\-]+$/.test(folderName)) {
			return res.status(400).json({
				error:
					'Недопустимые символы в названии папки. Можно использовать только буквы, цифры, дефис и подчеркивание.',
			})
		}

		const folderPath = path.join(__dirname, 'public', 'watch', folderName)

		if (fs.existsSync(folderPath)) {
			return res
				.status(400)
				.json({ error: 'Папка с таким именем уже существует' })
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
				console.error(`Ошибка обработки файла ${file.originalname}:`, fileError)
			}
		})

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
	try {
		const { oldName, newName } = req.body

		if (!oldName || !newName) {
			return res.status(400).json({ error: 'Не указаны имена папок' })
		}

		if (!/^[a-zA-Z0-9_\-]+$/.test(newName)) {
			return res.status(400).json({
				error:
					'Недопустимые символы в названии папки. Можно использовать только буквы, цифры, дефис и подчеркивание.',
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
		console.error('❌ Ошибка переименования:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для удаления папки
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
		console.error('❌ Ошибка удаления:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для удаления файла
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
		console.error('❌ Ошибка удаления файла:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для просмотра файла с оптимизацией кеширования
app.get('/api/view-file', (req, res) => {
	try {
		const { folder, file } = req.query

		if (!folder || !file) {
			return res.status(400).json({ error: 'Не указаны папка или файл' })
		}

		const filePath = path.join(__dirname, 'public', 'watch', folder, file)

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

		// Оптимизация кеширования для изображений
		if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
			// Кешируем изображения на 7 дней
			res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
			res.setHeader('Expires', new Date(Date.now() + 604800000).toUTCString())
		}

		// Включаем сжатие для всех типов файлов
		res.setHeader('Content-Type', contentType)

		const fileStream = fs.createReadStream(filePath)
		fileStream.pipe(res)
	} catch (error) {
		console.error('❌ Ошибка просмотра файла:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для скачивания файла
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
				console.error('❌ Ошибка скачивания файла:', err)
				res.status(500).json({ error: err.message })
			}
		})
	} catch (error) {
		console.error('❌ Ошибка скачивания файла:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для сканирования папки
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
		console.error('❌ Ошибка сканирования:', error)
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

// ==================== ОСНОВНЫЕ МАРШРУТЫ ====================

app.get('/admin', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'admin.html'))
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

// Обработка ошибок 404
app.use((req, res, next) => {
	res.status(404).send('Страница не найдена')
})

// Обработка ошибок сервера
app.use((err, req, res, next) => {
	console.error('Ошибка сервера:', err)
	res.status(500).send('Внутренняя ошибка сервера')
})

// Запуск сервера
app.listen(PORT, () => {
	console.log(`🚀 Сервер запущен на порту: ${PORT}`)
	console.log(`📁 Админ панель: /admin`)
	console.log(`🛒 Страница покупки: /purchase/1`)
	console.log(`👁️ Папка watch: ${path.join(__dirname, 'public', 'watch')}`)
	console.log(`📁 Папка uploads: ${path.join(__dirname, 'uploads')}`)
	console.log(`⚡ Используется сжатие GZIP для ускорения загрузки`)
})

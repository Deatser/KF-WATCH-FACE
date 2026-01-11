const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const app = express()
const PORT = process.env.PORT || 3000 // Render сам назначает порт

// Middleware
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

// API для получения содержимого папки watch
app.get('/api/watch-content', (req, res) => {
	try {
		const watchPath = path.join(__dirname, 'public', 'watch')

		// Проверяем существует ли папка
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

		// Читаем содержимое папки
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

		// Подсчитываем статистику
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

// API для создания папки
app.post('/api/create-folder', (req, res) => {
	try {
		const { folderName, description } = req.body

		if (!folderName) {
			return res.status(400).json({ error: 'Не указано название папки' })
		}

		// Проверка имени на безопасность
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

		// Создаем папку
		fs.mkdirSync(folderPath, { recursive: true })

		// Создаем файл описания если указано
		if (description) {
			const descPath = path.join(folderPath, 'description.txt')
			fs.writeFileSync(descPath, description)
		}

		// Создаем файл цены по умолчанию
		const pricePath = path.join(folderPath, 'price.txt')
		fs.writeFileSync(pricePath, '0')

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

		// Перемещаем файлы из временной папки в целевую
		files.forEach(file => {
			try {
				const originalName = file.originalname
				const targetPath = path.join(folderPath, originalName)

				// Проверяем, не существует ли уже файл с таким именем
				if (fs.existsSync(targetPath)) {
					// Добавляем timestamp к имени файла
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

		// Рекурсивное удаление папки со всеми файлами
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

		// Удаляем файл
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

// API для просмотра файла - УБРАЛИ console.log
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

		// Определяем Content-Type в зависимости от расширения файла
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

		// Читаем файл и отправляем
		const fileStream = fs.createReadStream(filePath)

		res.setHeader('Content-Type', contentType)

		// Для текстовых файлов добавляем заголовки для правильного отображения
		if (
			contentType.includes('text/') ||
			contentType.includes('application/json')
		) {
			res.setHeader('Content-Disposition', 'inline')
		} else {
			res.setHeader(
				'Content-Disposition',
				`inline; filename="${encodeURIComponent(file)}"`
			)
		}

		fileStream.pipe(res)

		// УБРАЛИ: console.log(`👁️ Просмотр файла: ${folder}/${file}`)
	} catch (error) {
		console.error('❌ Ошибка просмотра файла:', error)
		res.status(500).json({ error: error.message })
	}
})

// API для скачивания файла - УБРАЛИ console.log
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

		// Отправляем файл для скачивания
		res.download(filePath, file, err => {
			if (err) {
				console.error('❌ Ошибка скачивания файла:', err)
				res.status(500).json({ error: err.message })
			}
		})

		// УБРАЛИ: console.log(`📥 Скачивание файла: ${folder}/${file}`)
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

// Роут для страницы покупки
app.get('/purchase/:id', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'purchase.html'))
})

// Маршрут для статики страницы покупки
app.get('/public/css/purchase.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'css', 'purchase.css'))
})

app.get('/public/js/purchase.js', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'js', 'purchase.js'))
})

// Альтернативный маршрут для purchase.html (если открывается напрямую)
app.get('/purchase.html', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'purchase.html'))
})

// ==================== ОСНОВНЫЕ МАРШРУТЫ ====================

// Роут для админ панели
app.get('/admin', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'admin.html'))
})

// Главная страница
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'html', 'index.html'))
})

// Если запрашивают файлы напрямую из html папки
app.get('/public/html/:filename', (req, res) => {
	const filePath = path.join(__dirname, 'public', 'html', req.params.filename)
	if (fs.existsSync(filePath)) {
		res.sendFile(filePath)
	} else {
		res.status(404).send('Файл не найден')
	}
})

// Если запрашивают css/js файлы напрямую
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
})

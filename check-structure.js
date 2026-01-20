// check-structure.js
const fs = require('fs')
const path = require('path')

console.log('🔍 Проверяем структуру APK файлов...\n')

// Путь к папке с APK
const apkBasePath = path.join(__dirname, 'apk')

if (!fs.existsSync(apkBasePath)) {
	console.log('❌ Папка "apk" не существует!')
	console.log('Создайте папку "apk" в корне проекта')
	process.exit(1)
}

const folders = fs
	.readdirSync(apkBasePath, { withFileTypes: true })
	.filter(dirent => dirent.isDirectory())
	.map(dirent => dirent.name)

console.log(`📁 Найдено папок: ${folders.length}\n`)

let validFolders = 0

folders.forEach(folder => {
	const folderPath = path.join(apkBasePath, folder)
	const files = fs.readdirSync(folderPath)

	// Проверяем формат KFXXX
	const isKF = /^KF\d{3}$/i.test(folder)

	// Ищем .apk файлы
	const apkFiles = files.filter(file => file.toLowerCase().endsWith('.apk'))

	console.log(`${isKF ? '✅' : '⚠️ '} ${folder}:`)
	console.log(`   Путь: ${folderPath}`)
	console.log(`   Формат KFXXX: ${isKF ? 'ДА' : 'НЕТ'}`)
	console.log(`   APK файлов: ${apkFiles.length}`)

	if (apkFiles.length > 0) {
		apkFiles.forEach(apk => {
			const filePath = path.join(folderPath, apk)
			const stats = fs.statSync(filePath)
			console.log(`   - ${apk} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)
		})
	} else {
		console.log(`   ❌ Нет APK файлов!`)
	}
	console.log('')

	if (isKF && apkFiles.length > 0) {
		validFolders++
	}
})

console.log('='.repeat(50))
console.log(`Итого: ${validFolders} корректных папок с APK файлами`)
console.log('='.repeat(50))

if (validFolders === 0) {
	console.log('\n❌ Не найдено корректных папок!')
	console.log('Требования:')
	console.log('1. Название папки: KF001, KF002, KF123 и т.д.')
	console.log('2. Внутри папки должен быть минимум 1 .apk файл')
	console.log('Пример структуры:')
	console.log('apk/')
	console.log('├── KF001/')
	console.log('│   └── watchface.apk')
	console.log('├── KF002/')
	console.log('│   └── my_watch.apk')
}

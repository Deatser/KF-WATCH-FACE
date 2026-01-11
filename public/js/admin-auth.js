// public/js/admin-auth.js

document.addEventListener('DOMContentLoaded', async () => {
	// Проверяем аутентификацию
	const auth = window.firebaseAuth
	const database = window.firebaseDatabase

	if (!auth || !database) {
		console.error('Firebase не инициализирован')
		return
	}

	auth.onAuthStateChanged(async user => {
		if (user) {
			// Проверяем, является ли пользователь админом
			const userRef = database.ref('users/' + user.uid)
			const snapshot = await userRef.once('value')
			const userData = snapshot.val()

			if (userData && userData.role === 'admin') {
				// Пользователь админ - показываем контент
				showAdminContent(user)
			} else {
				// Пользователь не админ - показываем ошибку доступа
				showAccessDenied()
			}
		} else {
			// Пользователь не авторизован - показываем ошибку доступа
			showAccessDenied()
		}
	})

	// Настройка кнопки выхода
	setupLogoutButton()
})

function showAdminContent(user) {
	document.getElementById('accessCheck').style.display = 'none'
	document.getElementById('adminContent').style.display = 'block'
	document.getElementById('currentUserEmail').textContent = user.email

	// Загружаем содержимое папки при загрузке
	loadWatchFolderContent()
}

function showAccessDenied() {
	document.getElementById('accessCheck').style.display = 'none'
	document.getElementById('accessDenied').style.display = 'block'
}

function setupLogoutButton() {
	const logoutBtn = document.getElementById('logoutBtn')
	const logoutFooterBtn = document.getElementById('logoutFooterBtn')

	if (logoutBtn) {
		logoutBtn.addEventListener('click', () => {
			window.firebaseAuth.signOut().then(() => {
				window.location.href = '/'
			})
		})
	}

	if (logoutFooterBtn) {
		logoutFooterBtn.addEventListener('click', () => {
			window.firebaseAuth.signOut().then(() => {
				window.location.href = '/'
			})
		})
	}
}

// Функция для загрузки содержимого папки watch
async function loadWatchFolderContent() {
	try {
		// Отправляем запрос на сервер для получения содержимого папки
		const response = await fetch('/admin/watch-content')

		if (response.ok) {
			const data = await response.json()
			displayFolderContent(data)
		} else {
			// Если прямой запрос не работает, пробуем другой метод
			await fetchWatchFolderAlternative()
		}
	} catch (error) {
		console.error('Ошибка загрузки папки:', error)
		document.getElementById('foldersList').innerHTML = `
            <div class="no-data">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Ошибка загрузки</h3>
                <p>Не удалось загрузить содержимое папки watch</p>
                <p style="font-size: 0.9rem; margin-top: 10px;">${error.message}</p>
            </div>
        `
	}
}

async function fetchWatchFolderAlternative() {
	try {
		// Альтернативный endpoint
		const response = await fetch('/api/watch')

		if (response.ok) {
			const data = await response.json()
			displayFolderContent(data)
		}
	} catch (error) {
		console.error('Альтернативный метод тоже не сработал:', error)
	}
}

function displayFolderContent(data) {
	const foldersList = document.getElementById('foldersList')
	const loadingFolders = document.getElementById('loadingFolders')
	const noFolders = document.getElementById('noFolders')

	// Скрываем индикатор загрузки
	if (loadingFolders) {
		loadingFolders.style.display = 'none'
	}

	if (!data.folders || data.folders.length === 0) {
		if (noFolders) {
			noFolders.style.display = 'block'
		}
		return
	}

	// Скрываем сообщение об отсутствии папок
	if (noFolders) {
		noFolders.style.display = 'none'
	}

	// Обновляем статистику
	updateStats(data.stats)

	// Отображаем папки
	displayFolders(data.folders)
}

function updateStats(stats) {
	if (stats) {
		document.getElementById('totalFolders').textContent =
			stats.totalFolders || 0
		document.getElementById('totalImages').textContent = stats.totalImages || 0
		document.getElementById('totalFiles').textContent = stats.totalFiles || 0
		document.getElementById('lastUpdate').textContent =
			new Date().toLocaleTimeString()
	}
}

function displayFolders(folders) {
	const foldersList = document.getElementById('foldersList')
	foldersList.innerHTML = ''

	folders.forEach(folder => {
		const folderItem = createFolderItem(folder)
		foldersList.appendChild(folderItem)
	})
}

function createFolderItem(folder) {
	const div = document.createElement('div')
	div.className = 'folder-item'

	const fileCount = folder.files ? folder.files.length : 0
	const imageCount = folder.files
		? folder.files.filter(
				f =>
					f.type === 'jpg' ||
					f.type === 'jpeg' ||
					f.type === 'png' ||
					f.type === 'gif'
		  ).length
		: 0

	div.innerHTML = `
        <div class="folder-header">
            <div class="folder-icon">
                <i class="fas fa-folder"></i>
            </div>
            <div class="folder-name">${folder.name}</div>
            <div class="folder-badge">${fileCount} файлов</div>
        </div>
        
        <div class="files-list">
            ${
							folder.files && folder.files.length > 0
								? folder.files
										.map(
											file => `
                    <div class="file-item">
                        <div class="file-icon">
                            <i class="${getFileIcon(file.type)}"></i>
                        </div>
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${file.size || 'N/A'}</div>
                    </div>
                `
										)
										.join('')
								: '<div style="padding: 10px; text-align: center; color: #999;">Нет файлов</div>'
						}
        </div>
    `

	return div
}

function getFileIcon(fileType) {
	const icons = {
		jpg: 'fas fa-image',
		jpeg: 'fas fa-image',
		png: 'fas fa-image',
		gif: 'fas fa-image',
		txt: 'fas fa-file-alt',
		pdf: 'fas fa-file-pdf',
		doc: 'fas fa-file-word',
		docx: 'fas fa-file-word',
		xls: 'fas fa-file-excel',
		xlsx: 'fas fa-file-excel',
		zip: 'fas fa-file-archive',
		rar: 'fas fa-file-archive',
	}

	return icons[fileType] || 'fas fa-file'
}

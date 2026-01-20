// receiving.js - JavaScript для страницы получения заказа

// Получаем receivingId из URL с поддержкой UUID
function getReceivingIdFromURL() {
	const path = window.location.pathname
	// Поддержка UUID формата (с дефисами)
	const match = path.match(/\/purchase\/receiving\/([a-zA-Z0-9-]+)/)
	return match ? match[1] : null
}

// Загрузка данных заказа
async function loadOrderData() {
	const receivingId = getReceivingIdFromURL()

	if (!receivingId) {
		showError('Неверная ссылка получения')
		return null
	}

	console.log(`🔍 Загружаем данные для receivingId: ${receivingId}`)

	try {
		const response = await fetch(`/api/order/receiving/${receivingId}`)

		console.log(`📊 Статус ответа API: ${response.status}`)

		if (!response.ok) {
			const errorText = await response.text()
			console.error(`❌ Ошибка API: ${errorText}`)
			throw new Error(`API вернул статус ${response.status}`)
		}

		const order = await response.json()
		console.log(`✅ Данные заказа получены:`, order)

		return order
	} catch (error) {
		console.error('❌ Ошибка загрузки заказа:', error)
		showError('Не удалось загрузить информацию о заказе')
		return null
	}
}

// Отображение деталей заказа
function displayOrderDetails(order) {
	const container = document.getElementById('orderDetails')

	const html = `
        <div class="detail-item">
            <span class="detail-label">Номер заказа:</span>
            <span class="detail-value">#${order.orderId}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Циферблат:</span>
            <span class="detail-value">${
							order.productName || order.productId || 'Не указан'
						}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Email покупателя:</span>
            <span class="detail-value">${
							order.customerEmail || 'Не указан'
						}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Сумма оплаты:</span>
            <span class="detail-value">${order.price || 0} ₽</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Статус:</span>
            <span class="detail-value">
                <span class="status-badge status-paid">${
									order.status === 'paid' ? 'Оплачено ✓' : order.status
								}</span>
            </span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Дата оплаты:</span>
            <span class="detail-value">${
							order.paidAt
								? new Date(order.paidAt).toLocaleString('ru-RU')
								: 'Не указана'
						}</span>
        </div>
        ${
					order.isDaily
						? `
        <div class="detail-item">
            <span class="detail-label">Специальное предложение:</span>
            <span class="detail-value" style="color: #ff6b6b;">
                <i class="fas fa-fire"></i> Daily циферблат со скидкой 20%
            </span>
        </div>
        `
						: ''
				}
    `

	container.innerHTML = html
}

// Настройка кнопки скачивания
async function setupDownloadButton(receivingId, productId) {
	const downloadBtn = document.getElementById('downloadBtn')
	const fileSizeElement = document.getElementById('fileSize')

	if (!downloadBtn) {
		console.error('❌ Кнопка downloadBtn не найдена')
		return
	}

	// Сначала проверяем доступ
	try {
		console.log(`🔍 Проверяем доступ для receivingId: ${receivingId}`)

		const response = await fetch(`/api/check-access/${receivingId}`)
		const data = await response.json()

		console.log('📊 Результат проверки:', data)

		if (data.success && data.accessible) {
			// Проверяем количество файлов
			const apkCheck = await fetch(
				`/api/check-apk-files/${data.productId || productId}`
			)
			const apkData = await apkCheck.json()

			let downloadText = '<i class="fas fa-download"></i> Скачать файл'
			let fileInfo = ''

			if (apkData.success && apkData.fileCount > 1) {
				downloadText = `<i class="fas fa-download"></i> Скачать ${apkData.fileCount} файла`
				const totalSize = apkData.files.reduce((sum, f) => sum + f.size, 0)
				const totalMB = (totalSize / 1024 / 1024).toFixed(1)
				fileInfo = `~${totalMB} MB | ${apkData.fileCount} файла`
			}

			if (apkData.success && apkData.fileCount == 1) {
				const totalSize = apkData.files.reduce((sum, f) => sum + f.size, 0)
				const totalMB = (totalSize / 1024 / 1024).toFixed(1)
				fileInfo = `~${totalMB} MB | 1 файл`
			}

			// Доступ разрешен
			downloadBtn.innerHTML = downloadText
			downloadBtn.disabled = false
			downloadBtn.style.opacity = '1'
			downloadBtn.style.cursor = 'pointer'

			// Обновляем информацию о размере файла
			if (fileSizeElement) {
				fileSizeElement.textContent = fileInfo
			}

			// Обработчик скачивания
			downloadBtn.onclick = () => {
				console.log(`🖱️ Нажата кнопка скачивания для: ${receivingId}`)

				// Открываем защищенный маршрут в том же окне
				window.location.href = `/api/secure-download/${receivingId}`

				// Логируем в Google Analytics
				if (typeof gtag !== 'undefined') {
					gtag('event', 'download_started', {
						event_category: 'Order',
						event_label: receivingId,
						file_count: apkData.fileCount || 1,
						value: 1,
					})
				}
			}
		} else {
			// Доступ запрещен
			downloadBtn.innerHTML = '<i class="fas fa-lock"></i> Доступ запрещен'
			downloadBtn.disabled = true
			downloadBtn.style.opacity = '0.5'
			downloadBtn.style.cursor = 'not-allowed'

			// Показываем сообщение об ошибке
			const orderDetails = document.getElementById('orderDetails')
			if (orderDetails) {
				orderDetails.innerHTML += `
                    <div class="error-message" style="
                        background: #fff3cd;
                        border: 1px solid #ffc107;
                        color: #856404;
                        padding: 15px;
                        border-radius: 8px;
                        margin-top: 20px;
                    ">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Внимание:</strong> ${
													data.message || 'Доступ к файлу запрещен.'
												}
                    </div>
                `
			}
		}
	} catch (error) {
		console.error('❌ Ошибка проверки доступа:', error)

		downloadBtn.innerHTML =
			'<i class="fas fa-exclamation-triangle"></i> Ошибка проверки'
		downloadBtn.disabled = true
		downloadBtn.style.opacity = '0.5'
	}
}

// Показать ошибку
function showError(message) {
	const container = document.getElementById('orderDetails')
	container.innerHTML = `
        <div class="error-message" style="text-align: center; padding: 40px; color: #ff6b6b;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px;"></i>
            <h3>Ошибка</h3>
            <p>${message}</p>
            <p>ReceivingId: ${getReceivingIdFromURL() || 'не определен'}</p>
            <p style="margin-top: 20px;">
                <a href="/" style="color: #8b7355; text-decoration: underline;">Вернуться в магазин</a>
            </p>
        </div>
    `

	const downloadBtn = document.getElementById('downloadBtn')
	if (downloadBtn) {
		downloadBtn.style.display = 'none'
	}
}

// Отслеживание скачивания
function trackDownload(receivingId) {
	console.log(`📥 Скачивание начато: ${receivingId}`)

	// Отправляем событие в Google Analytics если есть
	if (typeof gtag !== 'undefined') {
		gtag('event', 'download_started', {
			event_category: 'Order',
			event_label: receivingId,
		})
	}
}

// Инициализация аккордеона FAQ
function initFaqAccordion() {
	const faqQuestions = document.querySelectorAll('#faqModal .faq-question')

	faqQuestions.forEach(question => {
		// Удаляем старые обработчики
		question.removeEventListener('click', handleFaqClick)
		// Добавляем новый обработчик
		question.addEventListener('click', handleFaqClick)
	})
}

function handleFaqClick() {
	const answer = this.nextElementSibling
	const toggleIcon = this.querySelector('.faq-toggle i')

	// Переключаем класс active
	answer.classList.toggle('active')

	// Меняем иконку
	if (answer.classList.contains('active')) {
		toggleIcon.className = 'fas fa-chevron-up'
	} else {
		toggleIcon.className = 'fas fa-chevron-down'
	}
}

// Инициализация кнопок выбора метода установки
function initInstallMethodButtons() {
	const methodButtons = document.querySelectorAll(
		'#installMethodModal .install-method-btn'
	)

	methodButtons.forEach(button => {
		// Удаляем старые обработчики
		button.removeEventListener('click', handleMethodButtonClick)
		// Добавляем новый обработчик
		button.addEventListener('click', handleMethodButtonClick)
	})
}

function handleMethodButtonClick() {
	const method = this.dataset.method

	// Закрываем текущее окно
	const installModal = document.getElementById('installMethodModal')
	if (installModal) {
		installModal.classList.remove('show')
		document.body.style.overflow = 'auto'
	}

	// Открываем соответствующее руководство БЕЗ задержки
	if (method === 'wearload') {
		const wearloadModal = document.getElementById('wearloadGuideModal')
		if (wearloadModal) {
			wearloadModal.classList.add('show')
			document.body.style.overflow = 'hidden'
		}
	} else if (method === 'adb') {
		const adbModal = document.getElementById('adbGuideModal')
		if (adbModal) {
			adbModal.classList.add('show')
			document.body.style.overflow = 'hidden'
		}
	} else if (method === 'bugjaeger') {
		const bugjaegerModal = document.getElementById('bugjaegerGuideModal')
		if (bugjaegerModal) {
			bugjaegerModal.classList.add('show')
			document.body.style.overflow = 'hidden'
		}
	}
}

// Функция для открытия модального окна с дополнительной инициализацией
function openModalWithInit(modalId) {
	const modal = document.getElementById(modalId)
	if (modal) {
		modal.classList.add('show')
		document.body.style.overflow = 'hidden'

		// Инициализируем контент в зависимости от типа модального окна
		if (modalId === 'faqModal') {
			// Инициализируем аккордеон FAQ
			initFaqAccordion()
		} else if (modalId === 'installMethodModal') {
			// Инициализируем кнопки выбора метода установки
			initInstallMethodButtons()
		}
	}
}

// Инициализация всех модальных окон
function initAllModals() {
	// Инициализируем кнопки инструкций на странице
	const wearloadBtn = document.getElementById('wearloadBtn')
	const adbBtn = document.getElementById('adbBtn')
	const bugjaegerBtn = document.getElementById('bugjaegerBtn')

	if (wearloadBtn) {
		wearloadBtn.addEventListener('click', function (e) {
			e.preventDefault()
			// Открываем модальное окно WearLoad
			const modal = document.getElementById('wearloadGuideModal')
			if (modal) {
				modal.classList.add('show')
				document.body.style.overflow = 'hidden'
			}
		})
	}

	if (adbBtn) {
		adbBtn.addEventListener('click', function (e) {
			e.preventDefault()
			// Открываем модальное окно ADB
			const modal = document.getElementById('adbGuideModal')
			if (modal) {
				modal.classList.add('show')
				document.body.style.overflow = 'hidden'
			}
		})
	}

	if (bugjaegerBtn) {
		bugjaegerBtn.addEventListener('click', function (e) {
			e.preventDefault()
			// Открываем модальное окно Bugjaeger
			const modal = document.getElementById('bugjaegerGuideModal')
			if (modal) {
				modal.classList.add('show')
				document.body.style.overflow = 'hidden'
			}
		})
	}

	// Инициализация модальных окон для ссылок в хедере и футере
	// Контакты
	document
		.querySelectorAll('#contactsLink, #burgerContactsLink, #contactsLinkFooter')
		.forEach(link => {
			link.addEventListener('click', function (e) {
				e.preventDefault()
				openModalWithInit('contactsModal')
			})
		})

	// FAQ
	document
		.querySelectorAll('#faqLink, #burgerFaqLink, #faqLinkFooter')
		.forEach(link => {
			link.addEventListener('click', function (e) {
				e.preventDefault()
				openModalWithInit('faqModal')
			})
		})

	// О нас
	document
		.querySelectorAll('#aboutLink, #burgerAboutLink, #aboutLinkFooter')
		.forEach(link => {
			link.addEventListener('click', function (e) {
				e.preventDefault()
				openModalWithInit('aboutModal')
			})
		})

	// Инструкция по установке
	document
		.querySelectorAll(
			'#installGuideLink, #burgerInstallGuideLink, #installGuideLinkFooter'
		)
		.forEach(link => {
			link.addEventListener('click', function (e) {
				e.preventDefault()
				openModalWithInit('installMethodModal')
			})
		})

	// Добавляем обработчики закрытия для всех модальных окон
	document.querySelectorAll('.about-modal-close').forEach(closeBtn => {
		closeBtn.addEventListener('click', function () {
			const modal = this.closest('.about-modal')
			if (modal) {
				modal.classList.remove('show')
				document.body.style.overflow = 'auto'
			}
		})
	})

	// Закрытие по клику вне окна
	document.querySelectorAll('.about-modal').forEach(modal => {
		modal.addEventListener('click', function (e) {
			if (e.target === this) {
				this.classList.remove('show')
				document.body.style.overflow = 'auto'
			}
		})
	})

	// Обработка клавиши Escape
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') {
			document.querySelectorAll('.about-modal.show').forEach(modal => {
				modal.classList.remove('show')
				document.body.style.overflow = 'auto'
			})
		}
	})

	// Бургер-меню
	const burgerMenuBtn = document.getElementById('burgerMenuBtn')
	const burgerDropdown = document.getElementById('burgerDropdown')

	if (burgerMenuBtn && burgerDropdown) {
		burgerMenuBtn.addEventListener('click', function (e) {
			e.stopPropagation()
			burgerDropdown.classList.toggle('show')
		})

		// Закрытие при клике вне меню
		document.addEventListener('click', function (e) {
			if (
				!burgerDropdown.contains(e.target) &&
				!burgerMenuBtn.contains(e.target)
			) {
				burgerDropdown.classList.remove('show')
			}
		})
	}
}

// Обновить initReceivingPage
async function initReceivingPage() {
	console.log('🚀 Инициализация страницы получения заказа...')

	const order = await loadOrderData()

	if (order) {
		displayOrderDetails(order)
		await setupDownloadButton(
			order.receivingId || getReceivingIdFromURL(),
			order.productId
		)
	}

	// Инициализируем все модальные окна
	initAllModals()
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
	// Добавляем CSS анимации
	const style = document.createElement('style')
	style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `
	document.head.appendChild(style)

	// Инициализируем страницу
	initReceivingPage()
})

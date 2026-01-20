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
function setupDownloadButton(receivingId) {
	const downloadBtn = document.getElementById('downloadBtn')

	downloadBtn.innerHTML = '<i class="fas fa-download"></i> Скачать файл (*.apk)'
	downloadBtn.disabled = false
	downloadBtn.onclick = () => {
		window.location.href = `/api/download/watchface/${receivingId}`
		trackDownload(receivingId)
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
	downloadBtn.style.display = 'none'
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

// Основная функция инициализации
async function initReceivingPage() {
	console.log('🚀 Инициализация страницы получения заказа...')

	const order = await loadOrderData()

	if (order) {
		displayOrderDetails(order)
		setupDownloadButton(order.receivingId || getReceivingIdFromURL())

		// Показываем размер файла если есть
		const fileSizeElement = document.getElementById('fileSize')
		if (fileSizeElement && order.productId) {
			fileSizeElement.textContent = '~5-10 MB'
		}
	}

	// Инициализируем все модальные окна
	initAllModals()

	// Проверяем доступность модальных окон
	setTimeout(() => {
		const modal = document.getElementById('contactsModal')
		console.log(
			'Модальные окна на странице получения:',
			modal ? '✅ Загружены' : '❌ Не загружены'
		)

		// Также проверяем наличие кнопок в модальном окне
		const methodButtons = document.querySelectorAll('.install-method-btn')
		console.log('Кнопки методов установки найдены:', methodButtons.length)
	}, 100)
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

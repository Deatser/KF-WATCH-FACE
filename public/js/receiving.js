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
			// Здесь можно получить реальный размер файла через API
			fileSizeElement.textContent = '~5-10 MB'
		}
	}
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
	// Добавляем CSS анимацию
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

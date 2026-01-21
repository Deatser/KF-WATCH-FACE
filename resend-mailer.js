// resend-mailer.js - отправка почты через Resend API
const { Resend } = require('resend')

// Получаем API ключ из переменных окружения
const RESEND_API_KEY = process.env.RESEND_API_KEY
const SITE_URL = process.env.SITE_URL || 'https://www.kf-watchface.ru'

if (!RESEND_API_KEY) {
	console.error('❌ CRITICAL: RESEND_API_KEY not configured!')
	console.error(
		'❌ Please set RESEND_API_KEY in Render.com Environment Variables'
	)
	console.error('❌ Get your API key from: https://resend.com/api-keys')
}

// Инициализируем Resend
const resend = new Resend(RESEND_API_KEY)

// Функция отправки письма
async function sendOrderEmail(order) {
	try {
		console.log(`📧 ====== RESEND: START SENDING EMAIL ======`)
		console.log(`📧 Order: ${order.orderId}`)
		console.log(`📧 To: ${order.customerEmail}`)
		console.log(`📧 Product: ${order.productName}`)
		console.log(`📧 ReceivingId: ${order.receivingId}`)

		// Проверяем наличие receivingId
		if (!order.receivingId) {
			console.error('❌ ERROR: No receivingId provided for email')
			return { success: false, error: 'No receivingId provided' }
		}

		// Исправляем URL (убираем лишний слэш)
		const cleanSiteUrl = SITE_URL.replace(/\/$/, '')
		const downloadUrl = `${cleanSiteUrl}/purchase/receiving/${order.receivingId}`

		console.log(`🔗 Download URL: ${downloadUrl}`)

		// Отправляем через Resend API

		const { data, error } = await resend.emails.send({
			from: 'KF WatchFace <support@kf-watchface.ru>',
			to: order.customerEmail,
			subject: `Заказ #${order.orderId} оплачен - KF WATCH FACE`,
			text: generatePlainTextEmail(order, downloadUrl),
		})

		if (error) {
			console.error('❌ RESEND API ERROR:')
			console.error('❌ Error:', error)
			return {
				success: false,
				error: error.message,
				details: error,
			}
		}

		console.log(`✅ ====== EMAIL SENT ======`)

		return {
			success: true,
			messageId: data.id,
			data: data,
		}
	} catch (error) {
		console.error('❌ RESEND UNEXPECTED ERROR:')
		console.error('❌ Error message:', error.message)
		console.error('❌ Stack trace:', error.stack)

		return {
			success: false,
			error: error.message,
			details: error,
		}
	}
}

// Генерация текстовой версии письма
function generatePlainTextEmail(order, downloadUrl) {
	// Используем часовой пояс Москвы (UTC+3)
	const formattedDate = new Date(order.paidAt).toLocaleString('ru-RU', {
		timeZone: 'Europe/Moscow',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	})

	const productDisplayName = order.productName || order.productId

	return `
Заказ #${order.orderId} оплачен
Спасибо за покупку! Ваш циферблат готов к скачиванию

Скачайте его по следующей ссылке - ${downloadUrl}


ДЕТАЛИ ЗАКАЗА:
━━━━━━━━━━━━━━━━━━━━━━━━
• Номер заказа: #${order.orderId}
• Циферблат: ${productDisplayName}
• Email покупателя: ${order.customerEmail}
• Сумма оплаты: ${order.price} ₽
• Статус: Оплачено ✓
• Дата оплаты: ${formattedDate}


Нужна помощь с установкой? Напишите в Telegram: https://t.me/krek_free
    `.trim()
}

// Тестовая функция
async function sendTestEmail() {
	console.log('📧 ====== TESTING RESEND EMAIL ======')
	console.log('📅 Time:', new Date().toISOString())
	console.log(
		`📧 RESEND_API_KEY configured: ${RESEND_API_KEY ? 'YES (hidden)' : 'NO'}`
	)
	console.log(`📧 SITE_URL: ${SITE_URL}`)

	if (!RESEND_API_KEY) {
		console.error('❌ Cannot test: RESEND_API_KEY not configured')
		return { success: false, error: 'API key not configured' }
	}

	const testOrder = {
		orderId: 999999,
		productId: 'KF159',
		productName: 'Циферблат KF159',
		customerEmail: 'koranitplay@gmail.com',
		price: 150,
		paidAt: new Date().toISOString(),
		receivingId: 'test-123',
	}

	console.log('📧 Test order data:', testOrder)

	const result = await sendOrderEmail(testOrder)

	console.log('📧 Test result:', result)
	console.log('📧 ====== RESEND EMAIL TEST COMPLETE ======')

	return result
}

module.exports = { sendOrderEmail, sendTestEmail }

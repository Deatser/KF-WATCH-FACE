// emailjs-mailer.js - отправка через EmailJS
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY
const SITE_URL = process.env.SITE_URL || 'https://kf-watch-face.onrender.com'

console.log('📧 ====== EMAILJS CONFIGURATION ======')
console.log(`📧 EMAILJS_SERVICE_ID: ${EMAILJS_SERVICE_ID ? 'SET' : 'NOT SET'}`)
console.log(
	`📧 EMAILJS_TEMPLATE_ID: ${EMAILJS_TEMPLATE_ID ? 'SET' : 'NOT SET'}`
)
console.log(
	`📧 EMAILJS_PUBLIC_KEY: ${EMAILJS_PUBLIC_KEY ? 'SET (hidden)' : 'NOT SET'}`
)
console.log(`📧 SITE_URL: ${SITE_URL}`)

if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
	console.error('❌ CRITICAL: EmailJS configuration missing!')
	console.error('❌ Please set in Render.com Environment Variables:')
	console.error(
		'❌ EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY'
	)
}

// Функция отправки письма через EmailJS
async function sendOrderEmail(order) {
	try {
		console.log(`📧 ====== EMAILJS: START SENDING EMAIL ======`)
		console.log(`📧 Order: ${order.orderId}`)
		console.log(`📧 To: ${order.customerEmail}`)
		console.log(`📧 Product: ${order.productName}`)
		console.log(`📧 ReceivingId: ${order.receivingId}`)

		if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
			console.error('❌ ERROR: EmailJS not configured properly')
			return { success: false, error: 'EmailJS configuration missing' }
		}

		if (!order.receivingId) {
			console.error('❌ ERROR: No receivingId provided for email')
			return { success: false, error: 'No receivingId provided' }
		}

		// Ссылка для скачивания
		const downloadUrl = `${SITE_URL}/purchase/receiving/${order.receivingId}`
		console.log(`🔗 Download URL: ${downloadUrl}`)

		// Данные для шаблона
		const templateParams = {
			orderId: order.orderId,
			productId: order.productId,
			productName: order.productName || `Циферблат ${order.productId}`,
			customerEmail: order.customerEmail,
			customer_name: order.customerEmail.split('@')[0], // Имя из email
			price: order.price,
			paidAt: order.paidAt
				? new Date(order.paidAt).toLocaleString('ru-RU')
				: new Date().toLocaleString('ru-RU'),
			downloadUrl: downloadUrl,
			siteUrl: SITE_URL,
			supportUrl: 'https://t.me/krek_free',
			year: new Date().getFullYear(),
		}

		console.log(`📧 Sending via EmailJS API...`)
		console.log(`📧 Template params:`, templateParams)

		// Используем fetch для отправки через EmailJS API
		const response = await fetch(
			'https://api.emailjs.com/api/v1.0/email/send',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					service_id: EMAILJS_SERVICE_ID,
					template_id: EMAILJS_TEMPLATE_ID,
					user_id: EMAILJS_PUBLIC_KEY, // В новых версиях user_id = public key
					accessToken: EMAILJS_PUBLIC_KEY, // Иногда нужен accessToken
					template_params: templateParams,
				}),
			}
		)

		console.log(`📧 EmailJS response status: ${response.status}`)

		const responseText = await response.text()
		console.log(`📧 EmailJS response: ${responseText}`)

		if (response.ok) {
			console.log(`✅ EMAILJS EMAIL SENT SUCCESSFULLY!`)
			console.log(`📧 To: ${order.customerEmail}`)
			console.log(`📧 ====== EMAIL SENT ======`)

			return {
				success: true,
				messageId: `emailjs-${Date.now()}`,
				data: { status: response.status, text: responseText },
			}
		} else {
			console.error(`❌ EMAILJS API ERROR: Status ${response.status}`)
			console.error('❌ Error response:', responseText)

			return {
				success: false,
				error: `API error: ${response.status} - ${responseText}`,
				details: responseText,
			}
		}
	} catch (error) {
		console.error('❌ EMAILJS UNEXPECTED ERROR:')
		console.error('❌ Error message:', error.message)
		console.error('❌ Stack trace:', error.stack)

		return {
			success: false,
			error: error.message,
			details: error,
		}
	}
}

// Тестовая функция
async function sendTestEmail() {
	console.log('📧 ====== TESTING EMAILJS EMAIL ======')
	console.log('📅 Time:', new Date().toISOString())

	if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
		console.error('❌ Cannot test: EmailJS not configured')
		return { success: false, error: 'EmailJS not configured' }
	}

	const testOrder = {
		orderId: 999999,
		productId: 'KF159',
		productName: 'Циферблат KF159',
		customerEmail: 'koranitplay@gmail.com', // Твоя почта для теста
		price: 150,
		paidAt: new Date().toISOString(),
		receivingId: 'test-123',
	}

	console.log('📧 Test order data:', testOrder)
	const result = await sendOrderEmail(testOrder)

	console.log('📧 Test result:', result)
	console.log('📧 ====== EMAILJS EMAIL TEST COMPLETE ======')

	return result
}

module.exports = { sendOrderEmail, sendTestEmail }

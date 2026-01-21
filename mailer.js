// mailer.js - без dotenv
const nodemailer = require('nodemailer')

// Настройка Gmail - замени на свои данные
const EMAIL_USER = process.env.MAIL_USER
const EMAIL_PASS = process.env.MAIL_PASS
// Добавлена возможность задать через переменные окружения
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000'

const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: EMAIL_USER,
		pass: EMAIL_PASS,
	},
})

// Функция отправки письма
// Функция отправки письма
async function sendOrderEmail(order) {
	try {
		console.log(`📧 ====== START SENDING EMAIL ======`)
		console.log(`📧 Order: ${order.orderId}`)
		console.log(`📧 To: ${order.customerEmail}`)
		console.log(`📧 Product: ${order.productName}`)
		console.log(`📧 ReceivingId: ${order.receivingId}`)
		console.log(`📧 SITE_URL: ${SITE_URL}`)
		console.log(`📧 EMAIL_USER configured: ${!!EMAIL_USER}`)

		if (!EMAIL_USER || !EMAIL_PASS) {
			console.error(
				'❌ ERROR: Email credentials not configured in environment variables'
			)
			console.error('❌ MAIL_USER:', EMAIL_USER ? 'SET' : 'NOT SET')
			console.error('❌ MAIL_PASS:', EMAIL_PASS ? 'SET' : 'NOT SET')
			return { success: false, error: 'Email credentials not configured' }
		}

		// Проверяем наличие receivingId
		if (!order.receivingId) {
			console.error('❌ ERROR: No receivingId provided for email')
			return { success: false, error: 'No receivingId provided' }
		}

		// Ссылка для скачивания
		const downloadUrl = `${SITE_URL}/purchase/receiving/${order.receivingId}`
		console.log(`🔗 Download URL: ${downloadUrl}`)

		// Простое текстовое письмо
		const mailOptions = {
			from: `"KF WATCH FACE" <${EMAIL_USER}>`,
			to: order.customerEmail,
			subject: `✅ Заказ #${order.orderId} оплачен - KF WATCH FACE`,
			text: `
Заказ #${order.orderId} успешно оплачен!

Циферблат: ${order.productName || order.productId}
Сумма: ${order.price} руб.
Дата: ${new Date(order.paidAt).toLocaleString('ru-RU')}

Ссылка для скачивания:
${downloadUrl}

Ссылка активна 30 дней.

Поддержка: https://t.me/krek_free

KF WATCH FACE
            `,
			html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #8b7355; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .btn { display: inline-block; background: #8b7355; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Заказ #${order.orderId} оплачен</h1>
        </div>
        <div class="content">
            <h2>KF WATCH FACE</h2>
            <p><strong>Циферблат:</strong> ${
							order.productName || order.productId
						}</p>
            <p><strong>Сумма:</strong> ${order.price} руб.</p>
            <p><strong>Дата оплаты:</strong> ${new Date(
							order.paidAt
						).toLocaleString('ru-RU')}</p>
            
            <p style="margin: 25px 0;">Ссылка для скачивания файла:</p>
            <a href="${downloadUrl}" class="btn">📥 Скачать циферблат</a>
            
            <p>Или скопируйте ссылку:</p>
            <p style="background: #eee; padding: 10px; border-radius: 5px; word-break: break-all;">
                ${downloadUrl}
            </p>
            
            <div class="footer">
                <p>Ссылка активна 30 дней.</p>
                <p>Поддержка: <a href="https://t.me/krek_free">https://t.me/krek_free</a></p>
            </div>
        </div>
    </div>
</body>
</html>
            `,
		}

		console.log(`📧 Connecting to Gmail...`)

		// Проверяем подключение
		await transporter.verify()
		console.log(`✅ SMTP connection verified successfully`)

		// Отправляем
		console.log(`📧 Sending email...`)
		const info = await transporter.sendMail(mailOptions)

		console.log(`✅ EMAIL SENT SUCCESSFULLY!`)
		console.log(`📧 Message ID: ${info.messageId}`)
		console.log(`📧 Response: ${info.response}`)
		console.log(`📧 ====== EMAIL SENT ======`)

		return {
			success: true,
			messageId: info.messageId,
			response: info.response,
		}
	} catch (error) {
		console.error('❌ EMAIL ERROR DETAILS:')
		console.error('❌ Error message:', error.message)
		console.error('❌ Error code:', error.code)
		console.error('❌ Error command:', error.command)
		console.error('❌ Stack trace:', error.stack)

		if (error.response) {
			console.error('❌ SMTP Response:', error.response)
			console.error('❌ SMTP Response Code:', error.responseCode)
		}

		return {
			success: false,
			error: error.message,
			details: {
				code: error.code,
				command: error.command,
				response: error.response,
			},
		}
	}
}

// Тестовая функция
// Тестовая функция
async function sendTestEmail() {
	console.log('📧 ====== TESTING EMAIL FUNCTION ======')
	console.log('📅 Time:', new Date().toISOString())
	console.log(`📧 EMAIL_USER: ${EMAIL_USER}`)
	console.log(`📧 SITE_URL: ${SITE_URL}`)

	const testOrder = {
		orderId: 999999,
		productId: 'KF159',
		productName: 'Циферблат KF159',
		customerEmail: 'koranitplay@gmail.com', // твоя почта
		price: 150,
		paidAt: new Date().toISOString(),
		receivingId: 'test-123',
	}

	console.log('📧 Test order data:', testOrder)

	const result = await sendOrderEmail(testOrder)

	console.log('📧 Test result:', result)
	console.log('📧 ====== EMAIL TEST COMPLETE ======')

	return result
}

module.exports = { sendOrderEmail, sendTestEmail }

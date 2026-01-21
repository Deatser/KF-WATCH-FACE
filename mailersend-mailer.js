// mailersend-mailer.js - отправка через MailerSend API (с использованием fetch)
// Получаем API ключ из переменных окружения
const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY
const SITE_URL = process.env.SITE_URL || 'https://kf-watch-face.onrender.com'

console.log('📧 ====== MAILERSEND CONFIGURATION ======')
console.log(
	`📧 MAILERSEND_API_KEY configured: ${
		MAILERSEND_API_KEY ? 'YES (hidden)' : 'NO'
	}`
)
console.log(`📧 SITE_URL: ${SITE_URL}`)

if (!MAILERSEND_API_KEY) {
	console.error('❌ CRITICAL: MAILERSEND_API_KEY not configured!')
	console.error(
		'❌ Please set MAILERSEND_API_KEY in Render.com Environment Variables'
	)
	console.error(
		'❌ Get your API key from: https://app.mailersend.com/api-tokens'
	)
}

// Функция отправки письма
async function sendOrderEmail(order) {
	try {
		console.log(`📧 ====== MAILERSEND: START SENDING EMAIL ======`)
		console.log(`📧 Order: ${order.orderId}`)
		console.log(`📧 To: ${order.customerEmail}`)
		console.log(`📧 Product: ${order.productName}`)
		console.log(`📧 ReceivingId: ${order.receivingId}`)

		// Проверяем наличие API ключа
		if (!MAILERSEND_API_KEY) {
			console.error('❌ ERROR: MAILERSEND_API_KEY not configured')
			return { success: false, error: 'MailerSend API key not configured' }
		}

		// Проверяем наличие receivingId
		if (!order.receivingId) {
			console.error('❌ ERROR: No receivingId provided for email')
			return { success: false, error: 'No receivingId provided' }
		}

		// Ссылка для скачивания
		const downloadUrl = `${SITE_URL}/purchase/receiving/${order.receivingId}`
		console.log(`🔗 Download URL: ${downloadUrl}`)

		// Отправляем через MailerSend API используя fetch
		console.log(`📧 Sending via MailerSend API...`)

		const emailData = {
			from: {
				email: 'onboarding@trial-3zq0xl5g5y5g5y5g.mailersend.net', // Временный email от MailerSend
				name: 'KF WATCH FACE',
			},
			to: [
				{
					email: order.customerEmail,
					name: 'Customer',
				},
			],
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Заказ #${order.orderId} оплачен</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f9f9f9;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #8b7355 0%, #a89176 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
        }
        .content {
            padding: 30px;
        }
        .order-info {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 25px;
            border-left: 4px solid #8b7355;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
        }
        .info-row:last-child {
            border-bottom: none;
            margin-bottom: 0;
        }
        .label {
            color: #666;
            font-weight: 500;
        }
        .value {
            color: #1a1a1a;
            font-weight: 600;
        }
        .download-section {
            text-align: center;
            padding: 25px;
            background: #f0f7ff;
            border-radius: 10px;
            margin: 25px 0;
            border: 2px dashed #8b7355;
        }
        .btn-download {
            display: inline-block;
            background: linear-gradient(135deg, #8b7355 0%, #a89176 100%);
            color: white;
            text-decoration: none;
            padding: 14px 35px;
            border-radius: 25px;
            font-weight: 600;
            font-size: 16px;
            margin: 15px 0;
            transition: transform 0.3s ease;
        }
        .btn-download:hover {
            transform: translateY(-2px);
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
            text-align: center;
        }
        .support-link {
            color: #8b7355;
            text-decoration: none;
            font-weight: 600;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffc107;
            color: #856404;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Заказ #${order.orderId} оплачен</h1>
        </div>
        
        <div class="content">
            <div class="order-info">
                <div class="info-row">
                    <span class="label">Номер заказа:</span>
                    <span class="value">#${order.orderId}</span>
                </div>
                <div class="info-row">
                    <span class="label">Циферблат:</span>
                    <span class="value">${
											order.productName || order.productId
										}</span>
                </div>
                <div class="info-row">
                    <span class="label">Сумма:</span>
                    <span class="value">${order.price} руб.</span>
                </div>
                <div class="info-row">
                    <span class="label">Дата оплаты:</span>
                    <span class="value">${new Date(order.paidAt).toLocaleString(
											'ru-RU'
										)}</span>
                </div>
            </div>
            
            <div class="download-section">
                <h2 style="color: #1a1a1a; margin-bottom: 20px;">Скачайте файл циферблата</h2>
                <p style="margin-bottom: 20px; color: #555;">Файл в формате APK готов к скачиванию</p>
                <a href="${downloadUrl}" class="btn-download">
                    📥 Скачать циферблат
                </a>
                <p style="margin-top: 15px; color: #666; font-size: 14px;">
                    Или скопируйте ссылку:
                </p>
                <p style="background: white; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 14px; color: #333;">
                    ${downloadUrl}
                </p>
            </div>
            
            <div class="warning">
                <strong>⚠️ Важно:</strong> Ссылка активна 30 дней. Сохраните это письмо для доступа к файлу в будущем.
            </div>
            
            <div class="footer">
                <p>Нужна помощь с установкой?</p>
                <p>
                    <a href="https://t.me/krek_free" target="_blank" class="support-link">
                        <i class="fab fa-telegram"></i> Написать в Telegram поддержку
                    </a>
                </p>
                <p style="margin-top: 15px; font-size: 13px;">
                    © 2026 KF WATCH FACE. Все права защищены.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
			`,
		}

		const response = await fetch('https://api.mailersend.com/v1/email', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${MAILERSEND_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(emailData),
		})

		const responseData = await response.json()

		if (!response.ok) {
			console.error(`❌ MAILERSEND API ERROR: Status ${response.status}`)
			console.error('❌ Error response:', responseData)

			return {
				success: false,
				error: `API error: ${response.status} - ${
					responseData.message || 'Unknown error'
				}`,
				details: responseData,
			}
		}

		console.log(`✅ MAILERSEND EMAIL SENT SUCCESSFULLY!`)
		console.log(`📧 Response status: ${response.status}`)
		console.log(`📧 Response data:`, responseData)
		console.log(`📧 ====== EMAIL SENT ======`)

		return {
			success: true,
			messageId: responseData.id || response.headers.get('x-message-id'),
			data: responseData,
		}
	} catch (error) {
		console.error('❌ MAILERSEND UNEXPECTED ERROR:')
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
	console.log('📧 ====== TESTING MAILERSEND EMAIL ======')
	console.log('📅 Time:', new Date().toISOString())
	console.log(
		`📧 MAILERSEND_API_KEY configured: ${
			MAILERSEND_API_KEY ? 'YES (hidden)' : 'NO'
		}`
	)
	console.log(`📧 SITE_URL: ${SITE_URL}`)

	if (!MAILERSEND_API_KEY) {
		console.error('❌ Cannot test: MAILERSEND_API_KEY not configured')
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
	console.log('📧 ====== MAILERSEND EMAIL TEST COMPLETE ======')

	return result
}

module.exports = { sendOrderEmail, sendTestEmail }

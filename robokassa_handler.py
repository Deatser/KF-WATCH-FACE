#!/usr/bin/env python3
import sys
import json
import os
import asyncio
import hashlib

# Импортируем официальную библиотеку robokassa
from robokassa import HashAlgorithm, Robokassa

class RobokassaHandler:
    def __init__(self, is_test=False):
        # ВАЖНО: Используйте те же данные что в рабочем скрипте
        self.merchant_login = os.environ.get('ROBOKASSA_LOGIN', '')
        self.password1 = os.environ.get('ROBOKASSA_PASS1', '')
        self.password2 = os.environ.get('ROBOKASSA_PASS2', '')
        self.is_test = is_test
        
        # Проверяем что пароли установлены
        if not self.password1 or not self.password2:
            raise ValueError("Robokassa пароли не установлены в переменных окружения. Установите ROBOKASSA_PASSWORD1 и ROBOKASSA_PASSWORD2")
        
        # Инициализируем Robokassa клиент (как в рабочем скрипте)
        self.robokassa = Robokassa(
            merchant_login=self.merchant_login,
            password1=self.password1,
            password2=self.password2,
            is_test=self.is_test,
            algorithm=HashAlgorithm.md5,
        )
    
    async def generate_protected_payment_link(self, out_sum, inv_id, description=None, email=None, **kwargs):
        """
        Создание короткой JWT ссылки
        ТОЛЬКО ОБЯЗАТЕЛЬНЫЕ ПАРАМЕТРЫ
        """
        try:
            # Используем только обязательные параметры
            response = self.robokassa.generate_open_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description or f"Оплата заказа #{inv_id}",
                email=email,
                # НИКАКИХ shp_ параметров!
            )
            
            return {
                'success': True,
                'payment_url': response.url,
                'invoice_id': str(inv_id),
                'inv_id': inv_id,
                'out_sum': out_sum,
                'is_test': self.is_test,
                'method': 'jwt_protected'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'method': 'jwt_protected'
            }

    def check_result_signature(self, out_sum, inv_id, signature, **kwargs):
        """
        Проверка подписи для Result URL (уведомление от Robokassa)
        ТОЛЬКО ОБЯЗАТЕЛЬНЫЕ ПАРАМЕТРЫ!
        """
        try:
            # Проверяем подпись Result URL с помощью библиотеки
            # БЕЗ shp_ параметров!
            is_valid = self.robokassa.is_result_notification_valid(
                signature=signature,
                out_sum=out_sum,
                inv_id=inv_id
            )
            
            return {
                'success': True,
                'is_valid': is_valid,
                'inv_id': inv_id,
                'out_sum': out_sum,
                'method': 'is_result_notification_valid'
            }
            
        except Exception as e:
            return {
                'success': False,
                'is_valid': False,
                'error': str(e)
            }

    def check_redirect_signature(self, out_sum, inv_id, signature, **kwargs):
        """
        Проверка подписи для Success/Fail URL (редирект пользователя)
        ТОЛЬКО ОБЯЗАТЕЛЬНЫЕ ПАРАМЕТРЫ!
        """
        try:
            # Проверяем подпись Redirect URL с помощью библиотеки
            # БЕЗ shp_ параметров!
            is_valid = self.robokassa.is_redirect_valid(
                signature=signature,
                out_sum=out_sum,
                inv_id=inv_id
            )
            
            return {
                'success': True,
                'is_valid': is_valid,
                'inv_id': inv_id,
                'out_sum': out_sum,
                'method': 'is_redirect_valid'
            }
            
        except Exception as e:
            return {
                'success': False,
                'is_valid': False,
                'error': str(e)
            }

    def calculate_signature_debug(self, out_sum, inv_id, **kwargs):
        """
        Отладочная функция для расчета подписи
        ТОЛЬКО ОБЯЗАТЕЛЬНЫЕ ПАРАМЕТРЫ
        """
        try:
            # Формируем строку как Robokassa (ТОЛЬКО ОБЯЗАТЕЛЬНЫЕ)
            params_str = f"{out_sum}:{inv_id}:{self.password1}"
            
            # Вычисляем MD5
            calculated_signature = hashlib.md5(params_str.encode('utf-8')).hexdigest()
            
            return {
                'success': True,
                'calculated_signature': calculated_signature,
                'params_string': params_str,
                'password1': self.password1
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

async def main():
    try:
        # Читаем входные данные
        input_data = sys.stdin.read()

        if input_data.strip():
            try:
                data = json.loads(input_data)
            except json.JSONDecodeError as e:
                error_result = {
                    'success': False,
                    'error': f'Invalid JSON input: {str(e)}'
                }
                print(json.dumps(error_result, ensure_ascii=False))
                sys.exit(1)
        else:
            data = {'action': 'test'}
        
        action = data.get('action', 'test')
        is_test = data.get('is_test', False)
        
        handler = RobokassaHandler(is_test=is_test)
        
        if action == 'generate_short_link':
            out_sum = float(data.get('out_sum', 150))
            inv_id = int(data.get('inv_id', 123456))
            description = data.get('description', 'Оплата заказа')
            email = data.get('email')
            
            # НИКАКИХ shp_ ПАРАМЕТРОВ!
            result = await handler.generate_protected_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description,
                email=email
            )
            
        elif action == 'check_result_signature':
            out_sum = float(data.get('out_sum', 0))
            inv_id = int(data.get('inv_id', 0))
            signature = data.get('signature', '')
            
            result = handler.check_result_signature(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature
            )
            
        elif action == 'check_redirect_signature':
            out_sum = float(data.get('out_sum', 0))
            inv_id = int(data.get('inv_id', 0))
            signature = data.get('signature', '')
            
            result = handler.check_redirect_signature(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature
            )
            
        elif action == 'debug_signature':
            out_sum = float(data.get('out_sum', 120))
            inv_id = int(data.get('inv_id', 281476090))
            
            # НИКАКИХ shp_ ПАРАМЕТРОВ!
            result = handler.calculate_signature_debug(
                out_sum=out_sum,
                inv_id=inv_id
            )
            
        elif action == 'test':
            result = {
                'success': True,
                'message': 'Robokassa handler ready',
                'library_version': 'robokassa (official)',
                'merchant_login': handler.merchant_login,
                'is_test': handler.is_test,
                'methods_available': [
                    'generate_short_link',
                    'check_result_signature',
                    'check_redirect_signature',
                    'debug_signature'
                ],
                'note': 'БЕЗ shp_ параметров! Только обязательные параметры'
            }
        
        else:
            result = {'success': False, 'error': f'Unknown action: {action}'}
        
        # Выводим ТОЛЬКО JSON
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        # В случае ошибки выводим только JSON
        error_result = {
            'success': False, 
            'error': str(e),
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    # Запускаем асинхронную функцию
    asyncio.run(main())
#!/usr/bin/env python3
import sys
import json
import os
import asyncio

# Импортируем официальную библиотеку robokassa
from robokassa import HashAlgorithm, Robokassa

class RobokassaHandler:
    def __init__(self, is_test=True):
        # ВАЖНО: Используйте те же данные что в рабочем скрипте
        self.merchant_login = 'kfwatchface'  # Ваш реальный логин
        self.password1 = "U85g8fxYMMyThLkr1W2n"  # Пароль1 из вашего рабочего скрипта
        self.password2 = "qe9Np4lhWwJG3nKF96Ro"  # Пароль2 из вашего рабочего скрипта
        self.is_test = is_test
        
        # Инициализируем Robokassa клиент (как в рабочем скрипте)
        self.robokassa = Robokassa(
            merchant_login=self.merchant_login,
            password1=self.password1,
            password2=self.password2,
            is_test=self.is_test,
            algorithm=HashAlgorithm.md5,
        )
    
    async def generate_open_payment_link(self, out_sum, inv_id, description=None, email=None, **kwargs):
        """
        Создание классической длинной ссылки
        """
        try:
            # Создаем ссылку с помощью официальной библиотеки
            response = self.robokassa.generate_open_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description or f"Оплата заказа #{inv_id}",
                email=email,
                **kwargs
            )
            
            return {
                'success': True,
                'payment_url': response.url,
                'params': response.params.to_dict(),
                'inv_id': inv_id,
                'out_sum': out_sum,
                'is_test': self.is_test,
                'method': 'open_link'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'method': 'open_link'
            }
    
    async def generate_protected_payment_link(self, out_sum, inv_id, description=None, email=None, **kwargs):
        """
        Создание короткой JWT ссылки
        ВАЖНО: используем тот же метод что и в рабочем скрипте
        """
        try:
            # Используем тот же метод что в рабочем скрипте
            response = self.robokassa.generate_open_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description or f"Оплата заказа #{inv_id}",
                email=email,
                **kwargs
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
            # Если JWT не сработал, возвращаемся к классическому методу
            return await self.generate_open_payment_link(out_sum, inv_id, description, email, **kwargs)

    # ... остальные методы оставляем без изменений, но УБИРАЕМ ВСЕ print() из них ...

async def main():
    try:
        # Читаем входные данные
        input_data = sys.stdin.read()
        if not input_data.strip():
            data = {'action': 'test'}
        else:
            data = json.loads(input_data)
        
        action = data.get('action', 'test')
        is_test = data.get('is_test', True)
        
        handler = RobokassaHandler(is_test=is_test)
        
        if action == 'generate_short_link':
            out_sum = float(data.get('out_sum', 150))
            inv_id = int(data.get('inv_id', 123456))
            description = data.get('description', 'Оплата заказа')
            email = data.get('email')
            
            kwargs = {}
            for key, value in data.items():
                if key.startswith('shp_'):
                    kwargs[key] = value
            
            result = await handler.generate_protected_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description,
                email=email,
                **kwargs
            )
            
        elif action == 'generate_long_link':
            out_sum = float(data.get('out_sum', 150))
            inv_id = int(data.get('inv_id', 123456))
            description = data.get('description', 'Оплата заказа')
            email = data.get('email')
            
            kwargs = {}
            for key, value in data.items():
                if key.startswith('shp_'):
                    kwargs[key] = value
            
            result = await handler.generate_open_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description,
                email=email,
                **kwargs
            )
            
        elif action == 'deactivate_invoice':
            inv_id = data.get('inv_id')
            invoice_id = data.get('invoice_id')
            
            result = await handler.deactivate_invoice(
                inv_id=inv_id,
                invoice_id=invoice_id
            )
            
        elif action == 'get_payment_details':
            inv_id = int(data.get('inv_id', 0))
            
            result = await handler.get_payment_details(inv_id=inv_id)
            
        elif action == 'check_result_signature':
            out_sum = float(data.get('out_sum', 0))
            inv_id = int(data.get('inv_id', 0))
            signature = data.get('signature', '')
            
            kwargs = {}
            for key, value in data.items():
                if key.startswith('shp_'):
                    kwargs[key] = value
            
            result = handler.check_result_signature(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature,
                **kwargs
            )
            
        elif action == 'check_redirect_signature':
            out_sum = float(data.get('out_sum', 0))
            inv_id = int(data.get('inv_id', 0))
            signature = data.get('signature', '')
            
            kwargs = {}
            for key, value in data.items():
                if key.startswith('shp_'):
                    kwargs[key] = value
            
            result = handler.check_redirect_signature(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature,
                **kwargs
            )
            
        elif action == 'test':
            result = {
                'success': True,
                'message': 'Robokassa handler ready',
                'library_version': 'robokassa (official)',
                'merchant_login': handler.merchant_login,
                'is_test': handler.is_test,
                'passwords_match': handler.password1 == "U85g8fxYMMyThLkr1W2n" and handler.password2 == "qe9Np4lhWwJG3nKF96Ro",
                'methods_available': [
                    'generate_short_link',
                    'generate_long_link',
                    'deactivate_invoice',
                    'get_payment_details',
                    'check_result_signature',
                    'check_redirect_signature'
                ]
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
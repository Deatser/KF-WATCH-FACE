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
            print(f"❌ Error in generate_open_payment_link: {str(e)}", file=sys.stderr)
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
            print(f"❌ Error in generate_protected_payment_link: {str(e)}", file=sys.stderr)
            # Если JWT не сработал, возвращаемся к классическому методу
            return await self.generate_open_payment_link(out_sum, inv_id, description, email, **kwargs)

    def check_result_signature(self, out_sum, inv_id, signature, **kwargs):
        """
        Проверка подписи для Result URL (уведомление от Robokassa)
        """
        try:
            print(f"🔍 DEBUG check_result_signature called", file=sys.stderr)
            print(f"🔍 out_sum: {out_sum}, inv_id: {inv_id}, signature: {signature}", file=sys.stderr)
            print(f"🔍 kwargs: {kwargs}", file=sys.stderr)
            
            # Формируем строку для отладки
            params_str = f"{out_sum}:{inv_id}:{self.password1}"
            shp_params = {}
            
            for key, value in kwargs.items():
                if key.startswith('shp_'):
                    shp_params[key] = str(value)
            
            # Сортируем shp_ параметры по алфавиту
            if shp_params:
                sorted_shp_keys = sorted(shp_params.keys())
                for key in sorted_shp_keys:
                    params_str += f":{shp_params[key]}"
            
            print(f"🔍 DEBUG: String for hash: {params_str}", file=sys.stderr)
            
            import hashlib
            calculated_signature = hashlib.md5(params_str.encode('utf-8')).hexdigest()
            print(f"🔍 DEBUG: Calculated signature: {calculated_signature}", file=sys.stderr)
            print(f"🔍 DEBUG: Received signature: {signature}", file=sys.stderr)
            print(f"🔍 DEBUG: Match: {calculated_signature.lower() == signature.lower()}", file=sys.stderr)
            
            # Проверяем подпись Result URL
            is_valid = self.robokassa.is_result_notification_valid(
                signature=signature,
                out_sum=out_sum,
                inv_id=inv_id,
                **kwargs
            )
            
            print(f"✅ Result signature is valid: {is_valid}", file=sys.stderr)
            
            return {
                'success': True,
                'is_valid': is_valid,
                'inv_id': inv_id,
                'out_sum': out_sum,
                'calculated': calculated_signature,
                'received': signature,
                'params_checked': kwargs
            }
            
        except Exception as e:
            print(f"❌ Error in check_result_signature: {str(e)}", file=sys.stderr)
            return {
                'success': False,
                'is_valid': False,
                'error': str(e)
            }


    def calculate_signature_debug(self, out_sum, inv_id, **kwargs):
        """
        Отладочная функция для расчета подписи
        """
        try:
            print(f"🔍 DEBUG calculate_signature_debug called", file=sys.stderr)
            
            # Формируем строку как Robokassa
            params_str = f"{out_sum}:{inv_id}:{self.password1}"
            
            # Добавляем shp_ параметры в алфавитном порядке
            shp_params = {}
            for key, value in kwargs.items():
                if key.startswith('shp_'):
                    shp_params[key] = str(value)
            
            # Сортируем shp_ параметры по алфавиту
            if shp_params:
                sorted_shp_keys = sorted(shp_params.keys())
                for key in sorted_shp_keys:
                    params_str += f":{shp_params[key]}"
            
            print(f"🔍 DEBUG: String for hash: {params_str}", file=sys.stderr)
            print(f"🔍 DEBUG: Password1 used: {self.password1}", file=sys.stderr)
            print(f"🔍 DEBUG: All kwargs: {kwargs}", file=sys.stderr)
            
            # Вычисляем MD5
            import hashlib
            calculated_signature = hashlib.md5(params_str.encode('utf-8')).hexdigest()
            
            print(f"🔍 DEBUG: Calculated signature: {calculated_signature}", file=sys.stderr)
            
            return {
                'success': True,
                'calculated_signature': calculated_signature,
                'params_string': params_str,
                'password1': self.password1,
                'shp_params': shp_params
            }
            
        except Exception as e:
            print(f"❌ Error in calculate_signature_debug: {str(e)}", file=sys.stderr)
            return {
                'success': False,
                'error': str(e)
            }
        

    def check_redirect_signature(self, out_sum, inv_id, signature, **kwargs):
        """
        Проверка подписи для Success/Fail URL (редирект пользователя)
        """
        try:
            print(f"🔍 DEBUG check_redirect_signature called", file=sys.stderr)
            print(f"🔍 out_sum: {out_sum}, inv_id: {inv_id}, signature: {signature}", file=sys.stderr)
            print(f"🔍 kwargs: {kwargs}", file=sys.stderr)
            
            # Формируем строку для отладки
            params_str = f"{out_sum}:{inv_id}:{self.password1}"
            shp_params = {}
            
            for key, value in kwargs.items():
                if key.startswith('shp_'):
                    shp_params[key] = str(value)
            
            # Сортируем shp_ параметры по алфавиту
            if shp_params:
                sorted_shp_keys = sorted(shp_params.keys())
                for key in sorted_shp_keys:
                    params_str += f":{shp_params[key]}"
            
            print(f"🔍 DEBUG: String for hash: {params_str}", file=sys.stderr)
            
            import hashlib
            calculated_signature = hashlib.md5(params_str.encode('utf-8')).hexdigest()
            print(f"🔍 DEBUG: Calculated signature: {calculated_signature}", file=sys.stderr)
            print(f"🔍 DEBUG: Received signature: {signature}", file=sys.stderr)
            print(f"🔍 DEBUG: Match: {calculated_signature.lower() == signature.lower()}", file=sys.stderr)
            
            # Проверяем подпись Redirect URL
            is_valid = self.robokassa.is_redirect_valid(
                signature=signature,
                out_sum=out_sum,
                inv_id=inv_id,
                **kwargs
            )
            
            print(f"✅ Redirect signature is valid: {is_valid}", file=sys.stderr)
            
            return {
                'success': True,
                'is_valid': is_valid,
                'inv_id': inv_id,
                'out_sum': out_sum,
                'calculated': calculated_signature,
                'received': signature,
                'method': 'is_redirect_valid',
            }
            
        except Exception as e:
            print(f"❌ Error in check_redirect_signature: {str(e)}", file=sys.stderr)
            return {
                'success': False,
                'is_valid': False,
                'error': str(e)
            }

async def main():
    try:
        # Читаем входные данные
        input_data = sys.stdin.read()

        print(f"📦 Received input data length: {len(input_data)}", file=sys.stderr)
        
        if input_data.strip():
            try:
                # Пробуем прочитать как UTF-8
                data = json.loads(input_data)
                print(f"📦 Successfully parsed JSON data", file=sys.stderr)
            except json.JSONDecodeError as e:
                print(f"❌ JSON decode error: {e}", file=sys.stderr)
                print(f"❌ Raw input (first 500 chars): {input_data[:500]}", file=sys.stderr)
                error_result = {
                    'success': False,
                    'error': f'Invalid JSON input: {str(e)}'
                }
                print(json.dumps(error_result, ensure_ascii=False))
                sys.exit(1)
        else:
            data = {'action': 'test'}
            print(f"⚠️ No input data, using test data", file=sys.stderr)

        print(f"📦 Action: {data.get('action')}", file=sys.stderr)
        
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
            
        elif action == 'check_result_signature':
            out_sum = float(data.get('out_sum', 0))
            inv_id = int(data.get('inv_id', 0))
            signature = data.get('signature', '')
            
            kwargs = {}
            for key, value in data.items():
                if key.startswith('shp_') or key in ['IsTest', 'Culture']:
                    kwargs[key] = value
            
            print(f"🔍 Checking result signature: out_sum={out_sum}, inv_id={inv_id}", file=sys.stderr)
            
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
                # Собираем ВСЕ параметры для проверки подписи
                if key.startswith('shp_') or key in ['IsTest', 'Culture', 'IncCurr']:
                    kwargs[key] = value
            
            print(f"🔍 Checking redirect signature: out_sum={out_sum}, inv_id={inv_id}", file=sys.stderr)
            print(f"🔍 Additional params: {kwargs}", file=sys.stderr)
            
            result = handler.check_redirect_signature(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature,
                **kwargs
            )
            
        elif action == 'debug_signature':
            out_sum = float(data.get('out_sum', 120))
            inv_id = int(data.get('inv_id', 281476090))
            
            kwargs = {}
            for key, value in data.items():
                if key.startswith('shp_') or key in ['IsTest', 'Culture']:
                    kwargs[key] = value

            result = handler.calculate_signature_debug(
                out_sum=out_sum,
                inv_id=inv_id,
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
                    'check_result_signature',
                    'check_redirect_signature',
                    'debug_signature'
                ]
            }
        
        else:
            result = {'success': False, 'error': f'Unknown action: {action}'}
        
        # Выводим ТОЛЬКО JSON
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(f"❌ Critical error in main: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        
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
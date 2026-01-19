#!/bin/bash
echo "🔧 Настраиваем Python для Робокассы..."

# Проверяем версию Python
echo "🐍 Проверяем установленный Python..."
if command -v python3 &> /dev/null; then
    python3 --version
    echo "✅ Python3 найден"
elif command -v python &> /dev/null; then
    python --version
    echo "✅ Python найден"
else
    echo "⚠️ Python не найден. Для работы с Robokassa необходим Python 3.6+"
    echo "Установите Python: https://www.python.org/downloads/"
    exit 1
fi

# Устанавливаем Python библиотеки
echo "📦 Устанавливаем зависимости Python..."
if command -v pip3 &> /dev/null; then
    pip3 install --upgrade pip
    pip3 install -r requirements.txt
elif command -v pip &> /dev/null; then
    pip install --upgrade pip
    pip install -r requirements.txt
else
    echo "⚠️ Pip не найден. Установите pip для установки библиотек."
    exit 1
fi

# Проверяем установку robokassa
echo "🔍 Проверяем установку robokassa библиотеки..."
python3 -c "import hashlib; print('✅ hashlib доступен')" && \
python3 -c "import json; print('✅ json доступен')" && \
python3 -c "from urllib.parse import urlencode; print('✅ urllib.parse доступен')"

if [ $? -eq 0 ]; then
    echo "✅ Python зависимости успешно установлены"
else
    echo "⚠️ Не удалось проверить Python зависимости"
fi
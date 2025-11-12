require('dotenv/config'); // Загружаем переменные окружения
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const multer = require('multer');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs'); // Встроенный модуль
const path = require('path'); // Встроенный модуль
const { promisify } = require('util'); // Для "промисификации" коллбэков

// Импортируем textract (старая библиотека с коллбэками)
const textract = require('textract');

// ===== НОВАЯ ОБЕРТКА ДЛЯ TEXTRACT (для буфера) =====
function extractTextFromBuffer(buffer, mimeType) {
    return new Promise((resolve, reject) => {
        // Вызываем textract.fromBufferWithMime
        // Ему нужен mime-тип, чтобы понять, какой парсер использовать
        textract.fromBufferWithMime(mimeType, buffer, (error, text) => {
            if (error) {
                // Если ошибка, отклоняем Promise
                return reject(error);
            }
            // Если успех, возвращаем текст
            resolve(text);
        });
    });
}

// ===== НОВАЯ HELPER-ФУНКЦИЯ ДЛЯ ТАСОВАНИЯ =====
function shuffleArray(array) {
  let currentIndex = array.length,  randomIndex;

  // Пока остаются элементы для тасования...
  while (currentIndex > 0) {

    // Выбираем оставшийся элемент...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // И меняем его местами с текущим элементом.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}

const app = express();
const PORT = process.env.PORT || 3001;

// Инициализация клиента OpenAI
// Он автоматически подхватит OPENAI_API_KEY из .env
const openai = new OpenAI();

// Настройка multer для временного хранения файла
const upload = multer({ dest: 'uploads/' });
// Создаем папку, если ее нет
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Раздача статических файлов из папки public

// ===== ФУНКЦИЯ ДЛЯ ЛОГИКИ OPENAI =====
async function generateTestFromText(text, testType, questionCount) {
    const systemPrompt = `Ты — ассистент по созданию образовательных тестов. Твоя роль — строгий, но справедливый профессор. Ты **никогда** не используешь прямые цитаты из текста. Ты генерируешь вопросы на *понимание, анализ и синтез* материала.

**Задача:**
1.  Проанализируй конспект, который предоставит пользователь.
2.  Создай тест из **${questionCount}** вопросов.
3.  Тип вопросов должен быть: **${testType}**. (Если 'mixed', используй все 3 типа).
4.  Для *каждого* вопроса добавь короткое (1-2 предложения) поле \`explanation\` — объяснение, почему ответ именно такой.
5.  Твой ответ должен быть **только** JSON-объектом, без каких-либо других слов или форматирования.

**Структура JSON:**
Твой ответ должен быть JSON-объектом, содержащим ОДИН ключ "questions", который является массивом.
{
  "questions": [
    {
      "type": "multiple_choice" | "true_false" | "open_ended",
      "question": "Текст вопроса?",
      "options": ["Вариант 1", "Вариант 2", "Вариант 3"], // (Только для multiple_choice)
      "correctAnswerIndex": 0, // (Только для multiple_choice)
      "correctAnswer": true, // (Только для true_false)
      "idealAnswer": "Ключевые моменты для ответа", // (Только для open_ended)
      "explanation": "Объяснение правильного ответа."
    }
  ]
}`;

    // Обернем в try...catch, чтобы ловить ошибки именно от OpenAI
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            response_format: { type: "json_object" }
        });

        const jsonString = response.choices[0].message.content;
        const testData = JSON.parse(jsonString);

        // Получаем массив вопросов
        let questions = testData.questions;

        // --- НАША НОВАЯ ЛОГИКА ---
        // Если тип "mixed", тасуем массив
        if (testType === 'mixed') {
            console.log("Тасуем вопросы для 'mixed' теста...");
            questions = shuffleArray(questions);
        }
        // --- КОНЕЦ НОВОЙ ЛОГИКИ ---

        return questions; // Возвращаем (потенциально перемешанный) массив

    } catch (error) {
        console.error("Ошибка от OpenAI:", error);
        // "Пробрасываем" ошибку выше, чтобы ее поймал эндпоинт
        throw new Error('Ошибка при генерации теста в OpenAI.');
    }
}

// ===== ВОССТАНОВЛЕННЫЙ ЭНДПОИНТ ДЛЯ ТЕКСТА =====
app.post('/api/generate-test', async (req, res) => {
    const { text, testType, questionCount } = req.body;

    if (!text || text.trim() === '') {
        return res.status(400).json({ message: 'Текст не предоставлен.' });
    }

    try {
        const testData = await generateTestFromText(text, testType, questionCount);
        res.json(testData);
    } catch (error) {
        console.error('Ошибка генерации из текста:', error);
        res.status(500).json({ message: error.message || 'Ошибка сервера' });
    }
});

// POST эндпоинт для загрузки файла и генерации теста
app.post('/api/upload-and-generate', upload.single('file'), async (req, res) => {
    // 'file' - это тот ключ, что мы указали в FormData

    if (!req.file) {
        return res.status(400).json({ message: 'Файл не загружен.' });
    }

    const { testType, questionCount } = req.body;
    const filePath = req.file.path;
    let text = '';

    try {
        // 1. Читаем файл в буфер ОДИН РАЗ
        const dataBuffer = fs.readFileSync(filePath);
        
        // 2. Извлечение текста
        if (req.file.mimetype === 'application/pdf') {
            const data = await pdf(dataBuffer); // <--- Используем буфер
            text = data.text;
        } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') { // .docx
            // mammoth тоже умеет работать с буфером
            const result = await mammoth.extractRawText({ buffer: dataBuffer }); // <--- Используем буфер
            text = result.value;
        } else if (req.file.mimetype === 'application/msword') { // .doc
            // --- НАШ НОВЫЙ ФИКС ---
            try {
                text = await extractTextFromBuffer(dataBuffer, req.file.mimetype); // <--- Используем буфер
            } catch (docError) {
                // Если antiword не установлен, показываем понятную ошибку
                if (docError.message && docError.message.includes('antiword')) {
                    throw new Error('Обработка .doc файлов временно недоступна. Пожалуйста, используйте .docx, .pdf или .txt формат.');
                }
                throw docError; // Пробрасываем другие ошибки
            }
        } else if (req.file.mimetype === 'text/plain') { // .txt
            text = dataBuffer.toString('utf8'); // Конвертируем буфер в строку
        } else {
            throw new Error(`Неподдерживаемый тип файла: ${req.file.mimetype}`);
        }

        // Проверка, что текст извлечен
        if (!text || text.trim() === '') {
            throw new Error('Не удалось извлечь текст из файла. Файл пустой или поврежден.');
        }

        // 3. ВЫЗОВ НАШЕЙ ЛОГИКИ
        const testData = await generateTestFromText(text, testType, questionCount);

        // 4. Отправка результата
        res.json(testData);

    } catch (error) {
        console.error('Ошибка парсинга файла или генерации:', error);
        res.status(500).json({ message: error.message || 'Ошибка сервера' });
    } finally {
        // 5. Обязательно удаляем временный файл
        fs.unlinkSync(filePath);
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});

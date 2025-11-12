// Глобальные переменные для теста
let currentTest = [];
let currentQuestionIndex = 0;
let userAnswers = [];

// Новая функция для поиска следующего вопроса
function findNextQuestion(startIndex) {
    // 1. Сначала ищем *вперед* от текущей позиции
    let nextIndex = userAnswers.indexOf(null, startIndex);
    
    if (nextIndex !== -1) {
        return nextIndex; // Нашли неотвеченный вопрос впереди
    }

    // 2. Если впереди нет, ищем *с самого начала* (пропущенные)
    nextIndex = userAnswers.indexOf(null, 0);
    
    if (nextIndex !== -1) {
        return nextIndex; // Нашли пропущенный вопрос
    }

    // 3. Если вообще нет null, значит, все отвечено
    return -1; // Тест окончен
}

// Ждем загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    // Получаем ссылки на все 4 экрана
    const setupContainer = document.getElementById('setup-container');
    const loadingContainer = document.getElementById('loading-container');
    const testContainer = document.getElementById('test-container');
    const resultsContainer = document.getElementById('results-container');

    // Получаем элементы управления из setup-container
    const fileInput = document.getElementById('file-input');
    const testTypeSelect = document.getElementById('test-type');
    const questionCountInput = document.getElementById('question-count');
    const generateBtn = document.getElementById('generate-btn');

    // --- 1. ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ВКЛАДОК ---
    const tabFileBtn = document.getElementById('tab-file-btn');
    const tabTextBtn = document.getElementById('tab-text-btn');
    const fileTab = document.getElementById('file-tab');
    const textTab = document.getElementById('text-tab');

    tabFileBtn.addEventListener('click', () => {
        tabFileBtn.classList.add('active');
        tabTextBtn.classList.remove('active');
        fileTab.classList.add('active');
        textTab.classList.remove('active');
    });

    tabTextBtn.addEventListener('click', () => {
        tabFileBtn.classList.remove('active');
        tabTextBtn.classList.add('active');
        fileTab.classList.remove('active');
        textTab.classList.add('active');
    });

    // Функция для переключения экранов
    function toggleScreen(screenId) {
        // Скрываем все экраны
        setupContainer.classList.add('hidden');
        loadingContainer.classList.add('hidden');
        testContainer.classList.add('hidden');
        resultsContainer.classList.add('hidden');

        // Показываем нужный экран
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.remove('hidden');
        }
    }

    // Добавляем click listener на кнопку генерации
    generateBtn.addEventListener('click', async () => {
        // Проверяем, что количество вопросов валидно
        const questionCount = parseInt(questionCountInput.value, 10);
        if (isNaN(questionCount) || questionCount < 1 || questionCount > 20) {
            alert('Пожалуйста, введите корректное количество вопросов (от 1 до 20)');
            return;
        }

        // Переключаемся на экран загрузки
        toggleScreen('loading-container');

        // Вызываем функцию для получения теста (она сама проверит активную вкладку)
        await fetchTest();
    });

    // Делаем функции доступными глобально для использования в других частях кода
    window.toggleScreen = toggleScreen;
    window.renderCurrentQuestion = renderCurrentQuestion;
    window.renderResults = renderResults;
    window.resetTest = resetTest;

    // Делегирование событий для кнопок (создаются динамически)
    testContainer.addEventListener('click', (event) => {
        
        // --- ШАГ 1: Сохранение ответа (только если нажали "Далее") ---
        
        if (event.target.id === 'next-btn') {
            // --- Сохраняем ответ ---
            const question = currentTest[currentQuestionIndex];
            let answer = null;

            if (question.type === 'multiple_choice') {
                const selected = document.querySelector('input[name="answer"]:checked');
                if (selected) {
                    answer = selected.value;
                }
            } else if (question.type === 'true_false') {
                const selected = document.querySelector('input[name="answer"]:checked');
                if (selected) {
                    answer = selected.value;
                }
            } else if (question.type === 'open_ended') {
                const textarea = document.getElementById('open-answer');
                if (textarea) {
                    answer = textarea.value;
                }
            }

            // Валидация: не даем нажать "Далее" без ответа
            if (answer === null || (typeof answer === 'string' && answer.trim() === '')) {
                alert('Пожалуйста, дайте ответ или нажмите "Пропустить".');
                return; // Прерываем выполнение
            }
            
            // Для multiple_choice нужно конвертировать в число
            if (question.type === 'multiple_choice') {
                answer = parseInt(answer, 10);
            } else if (question.type === 'true_false') {
                // Конвертируем строку в boolean
                answer = answer === 'true';
            } else if (question.type === 'open_ended') {
                answer = answer.trim();
            }
            
            userAnswers[currentQuestionIndex] = answer;
            console.log(`Ответ на вопрос ${currentQuestionIndex} сохранен:`, answer);

        } else if (event.target.id === 'skip-btn') {
            // --- Вопрос пропущен ---
            // Ничего не сохраняем, userAnswers[currentQuestionIndex] остается null
            console.log(`Вопрос ${currentQuestionIndex} пропущен.`);
        } else {
            // Кликнули не на кнопку (например, на radio), ничего не делаем
            return; 
        }

        // --- ШАГ 2: Поиск следующего вопроса ---
        
        // Ищем следующий неотвеченный вопрос, НАЧИНАЯ СО СЛЕДУЮЩЕГО ИНДЕКСА
        const nextIndex = findNextQuestion(currentQuestionIndex + 1);

        if (nextIndex !== -1) {
            // --- Переходим к следующему вопросу ---
            currentQuestionIndex = nextIndex;
            renderCurrentQuestion();
        } else {
            // --- Тест окончен ---
            console.log('Тест завершен, все вопросы отвечены.');
            renderResults();
        }
    });
});

// Async функция для получения теста с сервера
// ЗАМЕНИТЬ СТАРУЮ ФУНКЦИЮ fetchTest()
async function fetchTest() {
    // 1. Собираем общие данные
    const testType = document.getElementById('test-type').value;
    const questionCount = document.getElementById('question-count').value;

    let endpoint = '';
    let requestOptions = {};
    let error = null;

    // 2. Проверяем, какая вкладка активна
    if (document.getElementById('file-tab').classList.contains('active')) {
        // --- Логика для ФАЙЛА ---
        const fileInput = document.getElementById('file-input');
        if (fileInput.files.length === 0) {
            error = 'Пожалуйста, выберите файл.';
        } else {
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);
            formData.append('testType', testType);
            formData.append('questionCount', questionCount);

            endpoint = '/api/upload-and-generate';
            requestOptions = {
                method: 'POST',
                body: formData
            };
        }
    } else {
        // --- Логика для ТЕКСТА ---
        const text = document.getElementById('text-input').value;
        if (!text || text.trim() === '') {
            error = 'Пожалуйста, вставьте текст.';
        } else {
            endpoint = '/api/generate-test';
            requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, testType, questionCount })
            };
        }
    }

    // 3. Проверка на ошибку (файл не выбран / текст не вставлен)
    if (error) {
        alert(error);
        window.toggleScreen('setup-container');
        return;
    }

    // 4. Единый блок fetch
    try {
        const response = await fetch(endpoint, requestOptions);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Ошибка на сервере');
        }

        const testData = await response.json();
        
        // Эта часть не меняется
        currentTest = testData;
        currentQuestionIndex = 0;
        userAnswers = new Array(testData.length).fill(null);
        renderCurrentQuestion();
        window.toggleScreen('test-container');

    } catch (err) {
        console.error('Ошибка при генерации теста:', err);
        alert(`Не удалось сгенерировать тест: ${err.message}`);
        window.toggleScreen('setup-container');
    }
}

// Функция для рендеринга текущего вопроса
function renderCurrentQuestion() {
    const question = currentTest[currentQuestionIndex];
    const testContainer = document.getElementById('test-container');
    
    // Очищаем контейнер
    testContainer.innerHTML = '';
    
    // Создаем заголовок с номером вопроса
    const questionNumber = document.createElement('h2');
    questionNumber.textContent = `Вопрос ${currentQuestionIndex + 1} из ${currentTest.length}`;
    testContainer.appendChild(questionNumber);
    
    // Создаем вопрос
    const questionText = document.createElement('h3');
    questionText.textContent = question.question;
    questionText.style.marginBottom = '20px';
    testContainer.appendChild(questionText);
    
    // Создаем контейнер для ответов
    const answersContainer = document.createElement('div');
    answersContainer.className = 'answers-container';
    answersContainer.style.marginBottom = '20px';
    
    // Обрабатываем разные типы вопросов
    if (question.type === 'multiple_choice') {
        // Создаем radio-кнопки для вариантов ответа
        question.options.forEach((option, index) => {
            const label = document.createElement('label');
            label.style.display = 'block';
            label.style.marginBottom = '10px';
            label.style.padding = '10px';
            label.style.border = '2px solid #e0e0e0';
            label.style.borderRadius = '8px';
            label.style.cursor = 'pointer';
            label.style.transition = 'all 0.3s ease';
            
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'answer';
            radio.value = index;
            radio.style.marginRight = '10px';
            
            label.appendChild(radio);
            label.appendChild(document.createTextNode(option));
            
            // Hover эффект
            label.addEventListener('mouseenter', () => {
                if (!radio.checked) {
                    label.style.borderColor = '#667eea';
                    label.style.backgroundColor = '#f5f7ff';
                }
            });
            label.addEventListener('mouseleave', () => {
                if (!radio.checked) {
                    label.style.borderColor = '#e0e0e0';
                    label.style.backgroundColor = 'transparent';
                }
            });
            
            // Выделение выбранного варианта
            radio.addEventListener('change', () => {
                answersContainer.querySelectorAll('label').forEach(l => {
                    const radioInput = l.querySelector('input[type="radio"]');
                    if (radioInput && radioInput.checked) {
                        l.style.borderColor = '#667eea';
                        l.style.backgroundColor = '#f5f7ff';
                    } else {
                        l.style.borderColor = '#e0e0e0';
                        l.style.backgroundColor = 'transparent';
                    }
                });
            });
            
            answersContainer.appendChild(label);
        });
    } else if (question.type === 'true_false') {
        // Создаем radio-кнопки для "Верно" и "Неверно"
        const options = [
            { value: true, text: 'Верно' },
            { value: false, text: 'Неверно' }
        ];
        
        options.forEach(option => {
            const label = document.createElement('label');
            label.style.display = 'block';
            label.style.marginBottom = '10px';
            label.style.padding = '10px';
            label.style.border = '2px solid #e0e0e0';
            label.style.borderRadius = '8px';
            label.style.cursor = 'pointer';
            label.style.transition = 'all 0.3s ease';
            
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'answer';
            radio.value = option.value;
            radio.style.marginRight = '10px';
            
            label.appendChild(radio);
            label.appendChild(document.createTextNode(option.text));
            
            // Hover эффект
            label.addEventListener('mouseenter', () => {
                if (!radio.checked) {
                    label.style.borderColor = '#667eea';
                    label.style.backgroundColor = '#f5f7ff';
                }
            });
            label.addEventListener('mouseleave', () => {
                if (!radio.checked) {
                    label.style.borderColor = '#e0e0e0';
                    label.style.backgroundColor = 'transparent';
                }
            });
            
            radio.addEventListener('change', () => {
                answersContainer.querySelectorAll('label').forEach(l => {
                    const radioInput = l.querySelector('input[type="radio"]');
                    if (radioInput && radioInput.checked) {
                        l.style.borderColor = '#667eea';
                        l.style.backgroundColor = '#f5f7ff';
                    } else {
                        l.style.borderColor = '#e0e0e0';
                        l.style.backgroundColor = 'transparent';
                    }
                });
            });
            
            answersContainer.appendChild(label);
        });
    } else if (question.type === 'open_ended') {
        // Создаем textarea для открытого вопроса
        const textarea = document.createElement('textarea');
        textarea.id = 'open-answer';
        textarea.placeholder = 'Введите ваш ответ...';
        textarea.style.width = '100%';
        textarea.style.minHeight = '150px';
        textarea.style.padding = '15px';
        textarea.style.border = '2px solid #e0e0e0';
        textarea.style.borderRadius = '8px';
        textarea.style.fontSize = '16px';
        textarea.style.fontFamily = 'inherit';
        textarea.style.resize = 'vertical';
        
        textarea.addEventListener('focus', () => {
            textarea.style.borderColor = '#667eea';
            textarea.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
        });
        
        textarea.addEventListener('blur', () => {
            textarea.style.borderColor = '#e0e0e0';
            textarea.style.boxShadow = 'none';
        });
        
        answersContainer.appendChild(textarea);
    }
    
    testContainer.appendChild(answersContainer);
    
    // Создаем контейнер для кнопок
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.gap = '10px';
    buttonsContainer.style.marginTop = '25px';
    
    // Создаем кнопку "Далее"
    const nextBtn = document.createElement('button');
    nextBtn.id = 'next-btn';
    nextBtn.textContent = currentQuestionIndex === currentTest.length - 1 ? 'Завершить тест' : 'Далее';
    nextBtn.style.flex = '1';
    nextBtn.style.padding = '15px 30px';
    nextBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    nextBtn.style.color = 'white';
    nextBtn.style.border = 'none';
    nextBtn.style.borderRadius = '8px';
    nextBtn.style.fontSize = '18px';
    nextBtn.style.fontWeight = '600';
    nextBtn.style.cursor = 'pointer';
    nextBtn.style.transition = 'transform 0.2s ease, box-shadow 0.3s ease';
    nextBtn.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
    
    nextBtn.addEventListener('mouseenter', () => {
        nextBtn.style.transform = 'translateY(-2px)';
        nextBtn.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.4)';
    });
    
    nextBtn.addEventListener('mouseleave', () => {
        nextBtn.style.transform = 'translateY(0)';
        nextBtn.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
    });
    
    buttonsContainer.appendChild(nextBtn);
    
    // Создаем кнопку "Пропустить"
    const skipButton = document.createElement('button');
    skipButton.id = 'skip-btn';
    skipButton.textContent = 'Пропустить';
    skipButton.className = 'skip-button';
    skipButton.style.flex = '1';
    skipButton.style.padding = '15px 30px';
    skipButton.style.background = '#f0f0f0';
    skipButton.style.color = '#333';
    skipButton.style.border = '1px solid #ccc';
    skipButton.style.borderRadius = '8px';
    skipButton.style.fontSize = '18px';
    skipButton.style.fontWeight = '600';
    skipButton.style.cursor = 'pointer';
    skipButton.style.transition = 'all 0.3s ease';
    
    skipButton.addEventListener('mouseenter', () => {
        skipButton.style.background = '#e0e0e0';
        skipButton.style.borderColor = '#999';
    });
    
    skipButton.addEventListener('mouseleave', () => {
        skipButton.style.background = '#f0f0f0';
        skipButton.style.borderColor = '#ccc';
    });
    
    buttonsContainer.appendChild(skipButton);
    testContainer.appendChild(buttonsContainer);
}


// Функция для отображения результатов
function renderResults() {
    console.log("Рендеринг результатов...");
    window.toggleScreen('results-container');
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '<h1>Результаты теста</h1>'; // Очистка и заголовок

    let correctCount = 0; // Счетчик правильных

    currentTest.forEach((question, index) => {
        const userAnswer = userAnswers[index];

        // Создаем контейнер для каждого вопроса
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';

        // 1. Вопрос
        resultItem.innerHTML = `<h3>Вопрос ${index + 1}: ${question.question}</h3>`;

        // 2. Логика проверки и отображения (САМОЕ ВАЖНОЕ)
        if (question.type === 'multiple_choice') {
            const userAnswerText = question.options[userAnswer];
            const correctAnswerText = question.options[question.correctAnswerIndex];
            
            resultItem.innerHTML += `<p class="user-answer">Ваш ответ: ${userAnswerText}</p>`;
            
            if (parseInt(userAnswer) === question.correctAnswerIndex) {
                resultItem.querySelector('.user-answer').classList.add('correct');
                correctCount++;
            } else {
                resultItem.querySelector('.user-answer').classList.add('incorrect');
                resultItem.innerHTML += `<p><span class="correct-answer-label">Правильный ответ:</span> ${correctAnswerText}</p>`;
            }

        } else if (question.type === 'true_false') {
            // userAnswer уже boolean (из saveAnswerAndProceed)
            const userAnswerBool = userAnswer;
            
            resultItem.innerHTML += `<p class="user-answer">Ваш ответ: ${userAnswerBool ? 'Верно' : 'Неверно'}</p>`;
            
            if (userAnswerBool === question.correctAnswer) {
                resultItem.querySelector('.user-answer').classList.add('correct');
                correctCount++;
            } else {
                resultItem.querySelector('.user-answer').classList.add('incorrect');
                resultItem.innerHTML += `<p><span class="correct-answer-label">Правильный ответ:</span> ${question.correctAnswer ? 'Верно' : 'Неверно'}</p>`;
            }

        } else if (question.type === 'open_ended') {
            // ЭТО ТВОЙ СЛУЧАЙ (ekfjbgrjhf)
            resultItem.innerHTML += `<p class="user-answer self-check">Ваш ответ: ${userAnswer || '(нет ответа)'}</p>`;
            resultItem.innerHTML += `<p><span class="ideal-answer-label">Идеальный ответ:</span> ${question.idealAnswer}</p>`;
            resultItem.innerHTML += `<p><i>(Это вопрос для самопроверки и не учитывается в общем счете.)</i></p>`;
        }

        // 3. Объяснение (Оно есть у всех)
        if (question.explanation) {
            resultItem.innerHTML += `<div class="explanation"><b>Объяснение:</b> ${question.explanation}</div>`;
        }

        resultsContainer.appendChild(resultItem);
    });

    // 4. Показываем общий счет
    // Считаем только те, что можно оценить
    const gradedQuestions = currentTest.filter(q => q.type !== 'open_ended').length;
    resultsContainer.insertAdjacentHTML('afterbegin', `<h2>Ваш счет: ${correctCount} / ${gradedQuestions}</h2>`);
    
    // 5. Кнопка "Начать заново"
    const restartButton = document.createElement('button');
    restartButton.id = 'restart-btn';
    restartButton.textContent = 'Пройти заново';
    restartButton.onclick = () => {
        // Сброс
        currentTest = [];
        currentQuestionIndex = 0;
        userAnswers = [];
        document.getElementById('file-input').value = null; // Сброс файла
        window.toggleScreen('setup-container');
    };
    resultsContainer.appendChild(restartButton);
}

// Функция для сброса теста
function resetTest() {
    currentTest = [];
    currentQuestionIndex = 0;
    userAnswers = [];
    
    // Очищаем поля ввода
    document.getElementById('file-input').value = '';
    document.getElementById('test-type').value = 'mixed';
    document.getElementById('question-count').value = '10';
    
    // Переключаемся на экран настройки
    window.toggleScreen('setup-container');
}


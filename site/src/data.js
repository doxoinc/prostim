export const demoProjects = [
  {
    id: 'forest-light', title: 'Лесной свет', category: 'games', author: 'Марк Ветров', handle: 'markv', initials: 'МВ', color: '#c2dbad',
    summary: 'Исследуйте лес, который помнит ваши истории.',
    description: 'Небольшое приключение о путешествии через забытый лес. Собирайте истории, находите скрытые тропы и возвращайте свет в старый маяк. Проект независимой команды, которая делает мир без спешки.',
    tags: ['Приключение', 'PC', 'В разработке'], votes: 128, scene: 'forest', slides: 3,
    comments: [{ name: 'Алина', text: 'Очень нравится атмосфера. Будет демо?', time: '2 часа назад' }, { name: 'Марк Ветров', text: 'Да, готовим небольшую главу для первого знакомства.', time: 'час назад' }]
  },
  {
    id: 'contour', title: 'Контур', category: 'apps', author: 'Алина Русу', handle: 'alinar', initials: 'АР', color: '#e7c7ab',
    summary: 'Задачи и идеи в одном спокойном пространстве.',
    description: 'Рабочая доска для личных проектов. Добавляйте задачи, собирайте идеи и отмечайте, что уже готово. В мини-демо можно попробовать доску без регистрации.',
    tags: ['Продуктивность', 'Web', 'Прототип'], votes: 86, scene: 'board', slides: 3,
    comments: [{ name: 'Дан', text: 'Минимализм — то, что нужно для личных проектов.', time: 'вчера' }]
  },
  {
    id: 'pulse', title: 'Pulse', category: 'tools', author: 'Дан Мирон', handle: 'danm', initials: 'ДМ', color: '#a9bfdc',
    summary: 'Понятная аналитика для небольшого сайта.',
    description: 'Панель для наблюдения за посещениями и событиями. Чистый интерфейс, основные метрики и простой взгляд на то, как люди используют ваш продукт.',
    tags: ['Аналитика', 'Open source', 'Web'], votes: 64, scene: 'analytics', slides: 2,
    comments: []
  },
  {
    id: 'between-shores', title: 'Между берегами', category: 'games', author: 'Марк Ветров', handle: 'markv', initials: 'МВ', color: '#c2dbad',
    summary: 'История о маленьком городе у большого моря.',
    description: 'Исследовательская игра о возвращении домой. Разговаривайте с жителями, собирайте воспоминания и наблюдайте, как меняется побережье.',
    tags: ['История', 'PC', 'Концепт'], votes: 47, scene: 'coast', slides: 2,
    comments: [{ name: 'Никита', text: 'Хочется больше таких тихих игр.', time: 'вчера' }]
  }
];

export const demoFiles = [
  { path: 'README.md', content: '# Мой проект\n\nНебольшое приложение, созданное с про.стим.\n\n## Запуск\n\nОткройте index.html в браузере.\n' },
  { path: 'index.html', content: '<!doctype html>\n<html lang="ru">\n  <head>\n    <meta charset="utf-8">\n    <title>Мой проект</title>\n    <link rel="stylesheet" href="styles.css">\n  </head>\n  <body>\n    <main>\n      <h1>Начнём с идеи</h1>\n      <p>Здесь будет ваш проект.</p>\n    </main>\n    <script src="app.js"></script>\n  </body>\n</html>\n' },
  { path: 'styles.css', content: 'body {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n  background: #f3f4ed;\n  color: #202921;\n}\n\nmain {\n  max-width: 720px;\n  margin: 80px auto;\n  padding: 24px;\n}\n' },
  { path: 'app.js', content: 'const project = {\n  name: "Мой проект",\n  status: "В разработке"\n};\n\nconsole.log(project.name);\n' }
];

export const initialTopics = [
  { id: 'store-page', title: 'Что подготовить для страницы игры в Steam?', author: 'про.стим', category: 'Инструкции', replies: ['Начните с описания, графики, трейлера и системных требований. Все материалы должны соответствовать содержимому игры.'], pinned: true },
  { id: 'demo-release', title: 'Когда лучше показывать первую демоверсию?', author: 'Алина', category: 'Релизы', replies: ['Покажите короткий законченный фрагмент, когда основной игровой цикл уже понятен.'] },
  { id: 'steam-build', title: 'Обсуждаем подготовку первой сборки', author: 'Дан', category: 'Разработка', replies: [] }
];

export const steamDocuments = [
  { id: 'publishing', icon: 'rocket', title: 'Как проходит публикация', subtitle: 'От заявки до релиза и сопровождения', content: 'Автор подаёт заявку с описанием игры и демонстрацией. Издатель оценивает готовность, согласует услуги и заключает договор. Затем готовятся сборка и страница Steam, проходят проверки Valve и согласуется дата выпуска. После релиза стороны работают с обновлениями и отчётностью.' },
  { id: 'materials', icon: 'image', title: 'Материалы для заявки', subtitle: 'Что рассказать о своей игре', content: 'Подготовьте название, жанр, краткое описание, стадию разработки, целевые платформы и ссылку на демонстрацию. Укажите правообладателя, состав команды и помощь, которая нужна для выпуска. Для страницы магазина понадобятся графика, трейлер, описание и системные требования.' },
  { id: 'payments', icon: 'coins', title: 'Доход и расчёты', subtitle: 'Отчётность и доля разработчика', content: 'Доход Valve поступает на счёт издателя. По отчёту и договору рассчитываются согласованные расходы, комиссия и доля автора. Способ перевода, валюта, налоговые удержания и сроки выплат определяются для конкретного договора и банка. Автор видит расчёт и подтверждение выплаты.' },
  { id: 'agreement', icon: 'pen', title: 'Условия сотрудничества', subtitle: 'Права, услуги и ответственность сторон', content: 'В договоре фиксируются игра, права на распространение, услуги издателя, комиссия и база её расчёта, оплата Steam Direct, дополнительные расходы, отчётные периоды и порядок выплат. Также согласуются обновления, скидки и завершение сотрудничества.' }
];

export const steamSteps = [
  { id: 'apply', icon: 'send', title: 'Заявка', text: 'Расскажи об игре и покажи демо.' },
  { id: 'deal', icon: 'pen', title: 'Договор', text: 'Согласуем услуги, долю и сроки.' },
  { id: 'release', icon: 'rocket', title: 'Релиз', text: 'Страница, сборка и проверки Steam.' },
  { id: 'payout', icon: 'coins', title: 'Выплаты', text: 'Отчёт по продажам и твоя доля.' }
];

export const readinessItems = [
  { id: 'build', icon: 'box', title: 'Билд' },
  { id: 'trailer', icon: 'film', title: 'Трейлер' },
  { id: 'shots', icon: 'image', title: 'Скриншоты' },
  { id: 'text', icon: 'text', title: 'Описание' },
  { id: 'art', icon: 'grid', title: 'Обложки' },
  { id: 'price', icon: 'tag', title: 'Цена' }
];

export const demoThreads = [
  { id: 'publisher', name: 'про.стим · Steam', initials: 'ПС', color: '#9fcaff', unread: 1, messages: [{ from: 'them', text: 'Привет! Готовы посмотреть твою игру. Пришли ссылку на билд или трейлер.', time: 'сегодня' }] },
  { id: 'markv', handle: 'markv', name: 'Марк Ветров', initials: 'МВ', color: '#c2dbad', unread: 1, messages: [{ from: 'them', text: 'Спасибо за интерес к «Лесному свету» 🌲', time: '12:40' }, { from: 'them', text: 'Демо-глава уже почти готова.', time: '12:41' }] },
  { id: 'alinar', handle: 'alinar', name: 'Алина Русу', initials: 'АР', color: '#e7c7ab', unread: 0, messages: [{ from: 'them', text: 'Попробуй мини-демо «Контура» — интересно твоё мнение.', time: 'пн' }] }
];

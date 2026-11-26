export const demoProjects = [
  {
    id: 'forest-light', title: 'Лесной свет', category: 'games', author: 'Марк Ветров', handle: 'markv', initials: 'МВ', color: '#c2dbad',
    summary: 'Исследуйте лес, который помнит ваши истории.',
    description: 'Небольшое приключение о путешествии через забытый лес. Собирайте истории, находите скрытые тропы и возвращайте свет в старый маяк. Проект независимой команды, которая делает мир без спешки.',
    tags: ['Приключение', 'PC', 'В разработке'], votes: 128, scene: 'forest', slides: 3,
    stage: 'prototype', platforms: ['windows', 'mac', 'steamdeck'], pricing: 'paid', seeking: ['testers', 'publisher'], madeWith: ['Godot', 'Blender'],
    theme: { bg: '#0f2a26', accent: '#c4f56f', font: 'serif' },
    page: [
      { type: 'heading', text: 'Лес, который помнит', size: 'xl' },
      { type: 'text', text: 'Небольшое приключение о путешествии через забытый лес. Собирайте **истории**, находите скрытые тропы и возвращайте свет в старый маяк.', size: 'l' },
      { type: 'list', items: ['Три места: туманная чаща, болота и берег маяка', 'Около двух часов спокойной игры', 'Без боёв и таймеров — только исследование'] },
      { type: 'quote', text: 'Хотелось сделать игру, после которой становится тише.', author: 'Марк Ветров, автор' },
      { type: 'divider' },
      { type: 'heading', text: 'Что дальше', size: 'm' },
      { type: 'text', text: 'Готовим короткую главу для первого знакомства и ищем тестеров. Напишите в личные сообщения, если хотите поиграть раньше всех.' }
    ],
    comments: [{ name: 'Алина', text: 'Очень нравится атмосфера. Будет демо?', time: '2 часа назад' }, { name: 'Марк Ветров', text: 'Да, готовим небольшую главу для первого знакомства.', time: 'час назад' }]
  },
  {
    id: 'contour', title: 'Контур', category: 'apps', author: 'Алина Русу', handle: 'alinar', initials: 'АР', color: '#e7c7ab',
    summary: 'Задачи и идеи в одном спокойном пространстве.',
    description: 'Рабочая доска для личных проектов. Добавляйте задачи, собирайте идеи и отмечайте, что уже готово. В мини-демо можно попробовать доску без регистрации.',
    tags: ['Продуктивность', 'Web', 'Прототип'], votes: 86, scene: 'board', slides: 3,
    stage: 'prototype', platforms: ['web'], pricing: 'free', seeking: ['feedback'], ai: true, madeWith: ['React', 'Claude Code'],
    theme: { bg: '#f5efe6', accent: '#ff8a3d', font: 'round' },
    page: [
      { type: 'heading', text: 'Спокойная доска для своих дел', size: 'l', weight: 800 },
      { type: 'text', text: 'Задачи, идеи и заметки в одном месте — без лишних кнопок и уведомлений.' },
      { type: 'list', items: ['Колонки «Идеи», «В работе», «Готово»', 'Работает в браузере, без установки', 'Мини-демо прямо в посте'] },
      { type: 'text', text: 'Нажмите **«Попробовать»**, чтобы открыть демо.', size: 's', color: '#ff8a3d', weight: 600 }
    ],
    comments: [{ name: 'Дан', text: 'Минимализм — то, что нужно для личных проектов.', time: 'вчера' }]
  },
  {
    id: 'pulse', title: 'Pulse', category: 'tools', author: 'Дан Мирон', handle: 'danm', initials: 'ДМ', color: '#a9bfdc',
    summary: 'Понятная аналитика для небольшого сайта.',
    description: 'Панель для наблюдения за посещениями и событиями. Чистый интерфейс, основные метрики и простой взгляд на то, как люди используют ваш продукт.',
    tags: ['Аналитика', 'Open source', 'Web'], votes: 64, scene: 'analytics', slides: 2,
    stage: 'beta', platforms: ['web', 'linux'], pricing: 'open', seeking: ['testers', 'team'], madeWith: ['Node.js', 'SQLite'],
    theme: { bg: '#161a2e', accent: '#6cb8ff', font: 'mono' },
    page: [
      { type: 'heading', text: 'Аналитика без лишнего', size: 'l' },
      { type: 'text', text: 'Посещения, источники и события на одном экране. Только то, что помогает понять, как люди пользуются продуктом.', font: 'sans' },
      { type: 'list', items: ['Установка одной строкой', 'Графики в реальном времени', 'Открытый код'], font: 'sans' }
    ],
    comments: []
  },
  {
    id: 'between-shores', title: 'Между берегами', category: 'games', author: 'Марк Ветров', handle: 'markv', initials: 'МВ', color: '#c2dbad',
    summary: 'История о маленьком городе у большого моря.',
    description: 'Исследовательская игра о возвращении домой. Разговаривайте с жителями, собирайте воспоминания и наблюдайте, как меняется побережье.',
    tags: ['История', 'PC', 'Концепт'], votes: 47, scene: 'coast', slides: 2,
    stage: 'idea', platforms: ['windows'], seeking: ['artist', 'team'], madeWith: ['Unity'],
    theme: { bg: '#dcefff', accent: '#1f5fa8', font: 'display' },
    page: [
      { type: 'heading', text: 'Возвращение домой', size: 'xl', weight: 900, color: '#1f5fa8' },
      { type: 'text', text: 'Исследовательская игра о маленьком городе у большого моря. Разговаривайте с жителями, собирайте воспоминания и наблюдайте, как меняется побережье.', font: 'sans' },
      { type: 'quote', text: 'Хочется больше таких тихих игр.', author: 'Никита, из комментариев', font: 'sans' }
    ],
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
  { id: 'payments', icon: 'coins', title: 'Доход и расчёты', subtitle: 'Отчётность и доля разработчика', content: 'Valve раз в месяц платит издателю за продажи игры — это уже после доли Steam. Первым делом из этой суммы удерживаются 2% издателя. Оставшиеся 98% принадлежат автору: из них по факту вычитаются банковские комиссии, конвертация валюты и налоговые удержания, если они есть, и затем деньги переводятся автору. В кабинете видно каждую строку расчёта и подтверждение перевода.' },
  { id: 'agreement', icon: 'pen', title: 'Условия сотрудничества', subtitle: 'Права, услуги и ответственность сторон', content: 'В договоре фиксируются игра, права на распространение, услуги издателя, доля издателя 2% от выплаты Steam за игру, оплата Steam Direct, дополнительные услуги по желанию автора, отчётные периоды и порядок выплат. Также согласуются обновления, скидки и завершение сотрудничества.' }
];

export const steamSteps = [
  { id: 'apply', icon: 'send', title: 'Заявка', text: 'Расскажи об игре и покажи демо.' },
  { id: 'deal', icon: 'pen', title: 'Договор', text: 'Фиксируем 2%, права и сроки — до старта.' },
  { id: 'release', icon: 'rocket', title: 'Релиз', text: 'Страница, сборка и проверки Steam.' },
  { id: 'payout', icon: 'coins', title: 'Выплаты', text: 'Отчёт по продажам и 98% выплаты Steam — тебе.' }
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

// Studio facts for the Steam tab. Fill steamUrl and team to show real people and the Steam page.
export const studio = {
  name: 'Warkuda Games',
  country: 'Молдова',
  tagline: 'Издаём игры независимых авторов в Steam и ведём расчёты за них',
  steamUrl: 'https://store.steampowered.com/curator/45969311-Warkuda-Games/',
  links: [
    ['Куратор в Steam', 'https://store.steampowered.com/curator/45969311-Warkuda-Games/'],
    ['Разработчик на SteamDB', 'https://steamdb.info/developer/Warkuda/']
  ],
  contact: 'Чат «про.стим · Steam» во «Входящих»',
  team: [
    { name: 'Eduard Ivanov', role: 'Основатель, владелец студии', initials: 'EI', color: '#9fcaff', link: 'https://store.steampowered.com/curator/45969311-Warkuda-Games/' }
  ]
};

export const publisherServices = [
  { icon: 'pen', title: 'Договор', text: 'Фиксируем 2%, сроки, права и как выйти из сотрудничества — до начала работы.' },
  { icon: 'image', title: 'Страница в Steam', text: 'Капсулы, описание, теги, скриншоты и трейлер по требованиям Valve.' },
  { icon: 'box', title: 'Билд и проверки', text: 'Загружаем сборку через Steamworks, проходим проверку страницы и билда.' },
  { icon: 'tag', title: 'Цена и регионы', text: 'Подбираем цену, региональные цены и скидки на запуск.' },
  { icon: 'rocket', title: 'Запуск и фестивали', text: 'Демо, Steam Next Fest, «Скоро выйдет», дата релиза и новости.' },
  { icon: 'coins', title: 'Отчёты и выплаты', text: 'Получаем доход от Valve, показываем отчёт и переводим долю автору.' }
];

export const payoutFlow = [
  { icon: 'users', title: 'Игрок покупает', text: 'Деньги приходят в Steam' },
  { icon: 'gamepad', title: 'Steam', text: 'Оставляет 30% и раз в месяц платит издателю' },
  { icon: 'percent', title: 'Издатель', text: 'Удерживает 2% первыми — до банка и налогов' },
  { icon: 'check', title: 'Автор', text: 'Получает остальные 98% и видит каждую строку' }
];

export const payoutFacts = [
  ['30%', 'комиссия Steam с продаж до $10 млн, дальше 25% и 20%'],
  ['$100', 'взнос Steam Direct за игру, возвращается после $1000 дохода'],
  ['раз в месяц', 'Valve платит за прошлый месяц примерно через 30 дней'],
  ['2%', 'доля издателя с выплаты Steam, удерживается первой'],
  ['98%', 'выплаты Steam — автору, до банковских комиссий и налогов']
];

export const roadmap = [
  { when: 'Ноябрь 2026', done: true, title: 'Запуск про.стим', items: ['Лента проектов и обсуждения', 'Аккаунты и рейтинг доверия', 'ИИ-мир: агент на компьютере'] },
  { when: 'Зима 2026–2027', title: 'Кабинет заявки', items: ['Подтверждение почты', 'Статусы заявки и чат с издателем', 'Шаблон договора и подпись онлайн'] },
  { when: 'Весна 2027', title: 'Первые релизы', items: ['Игры авторов на странице студии в Steam', 'Отчёты о продажах в кабинете', 'Участие в Steam Next Fest'] },
  { when: 'Лето 2027', title: 'Выплаты и рост', items: ['Регулярные выплаты авторам', 'Маркетинговые пакеты', 'Локализация и тестирование'] }
];

export const steamFaq = [
  ['Сколько берёт издатель?', 'Заявка бесплатная. Издатель берёт 2% от суммы, которую Steam выплачивает за игру. Эти 2% удерживаются первыми — до банковских комиссий, конвертации, налогов и перевода тебе. Всё остальное — твоё.'],
  ['Кому принадлежат права на игру?', 'Права остаются у автора. Издатель получает право распространять игру в Steam на срок и на условиях договора.'],
  ['Когда я получу деньги?', 'После того как Valve заплатит издателю за месяц продаж. Срок перевода автору указывается в договоре, расчёт видно в кабинете.'],
  ['Можно ли выйти из договора?', 'Да, порядок завершения сотрудничества и что происходит со страницей игры фиксируются заранее.'],
  ['Подходит ли незаконченная игра?', 'Да. Можно прийти с прототипом или демо — поможем подготовиться к «Скоро выйдет» и Next Fest.']
];

// Publisher advantages shown in accent on the Steam tab. The fee is taken from Valve's payout for the game, first.
export const PUBLISHER_FEE = 0.02;
export const publisherPerks = [
  { icon: 'shield', title: 'Права у тебя', text: 'Игра остаётся твоей' },
  { icon: 'send', title: 'Заявка бесплатно', text: 'Условия — в договоре до старта' },
  { icon: 'users', title: 'Без компании за границей', text: 'Steam, договор и выплаты берём на себя' },
  { icon: 'doc', title: 'Прозрачный отчёт', text: 'Видно каждую строку расчёта' }
];

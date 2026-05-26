// Quiz layer ported from Betrunken: generated German tasks, audio tasks,
// configurable learning settings, plus the original Mosty question bank as fallback.
(function () {
  const LEGACY_QUESTIONS = {
    geo: [
      { q: 'Столица Австралии?', a: ['Канберра', 'Сидней', 'Мельбурн', 'Перт'] },
      { q: 'Самая длинная река мира?', a: ['Нил', 'Амазонка', 'Янцзы', 'Миссисипи'] },
      { q: 'В какой стране находится Мачу-Пикчу?', a: ['Перу', 'Чили', 'Боливия', 'Эквадор'] },
      { q: 'Самое глубокое озеро мира?', a: ['Байкал', 'Танганьика', 'Каспий', 'Виктория'] },
      { q: 'Какое море самое солёное?', a: ['Мёртвое', 'Красное', 'Средиземное', 'Аральское'] },
      { q: 'Столица Канады?', a: ['Оттава', 'Торонто', 'Монреаль', 'Ванкувер'] },
      { q: 'Какой пролив отделяет Африку от Европы?', a: ['Гибралтарский', 'Босфор', 'Ла-Манш', 'Дарданеллы'] },
      { q: 'В какой стране Ангкор-Ват?', a: ['Камбоджа', 'Таиланд', 'Вьетнам', 'Лаос'] },
      { q: 'Самый большой остров мира?', a: ['Гренландия', 'Новая Гвинея', 'Борнео', 'Мадагаскар'] },
      { q: 'Какая пустыня самая большая?', a: ['Антарктическая', 'Сахара', 'Аравийская', 'Гоби'] },
    ],
    sci: [
      { q: 'Сколько костей у взрослого человека?', a: ['206', '180', '240', '300'] },
      { q: 'Какой газ преобладает в атмосфере Земли?', a: ['Азот', 'Кислород', 'Углекислый', 'Аргон'] },
      { q: 'Скорость света примерно (км/с)?', a: ['300 000', '150 000', '30 000', '3 000 000'] },
      { q: 'Кто сформулировал законы движения планет?', a: ['Кеплер', 'Ньютон', 'Галилей', 'Коперник'] },
      { q: 'Какой элемент обозначается Au?', a: ['Золото', 'Серебро', 'Алюминий', 'Аурум-серебро'] },
      { q: 'Сколько хромосом у человека?', a: ['46', '23', '48', '44'] },
      { q: 'Сила трения скольжения при 1 кг и μ=0.2?', a: ['≈2 Н', '≈1 Н', '≈10 Н', '≈0.2 Н'] },
      { q: 'Самая большая планета Солнечной системы?', a: ['Юпитер', 'Сатурн', 'Нептун', 'Уран'] },
      { q: 'Что измеряет амперметр?', a: ['Силу тока', 'Напряжение', 'Сопротивление', 'Мощность'] },
      { q: 'Какой витамин вырабатывается под солнцем?', a: ['D', 'C', 'B12', 'A'] },
    ],
    hist: [
      { q: 'Когда началась Вторая мировая война?', a: ['1939', '1941', '1938', '1945'] },
      { q: 'Кто открыл Америку для европейцев?', a: ['Колумб', 'Магеллан', 'Кук', 'Веспуччи'] },
      { q: 'Древняя столица инков?', a: ['Куско', 'Лима', 'Мачу-Пикчу', 'Кито'] },
      { q: 'Когда пал Константинополь?', a: ['1453', '1492', '1066', '1517'] },
      { q: 'Кто такой Хаммурапи?', a: ['Царь Вавилона', 'Фараон Египта', 'Греческий философ', 'Полководец Рима'] },
      { q: 'Какой век это 1700-1799?', a: ['XVIII', 'XVII', 'XIX', 'XX'] },
      { q: 'Где состоялась битва при Ватерлоо?', a: ['Бельгия', 'Франция', 'Германия', 'Нидерланды'] },
      { q: 'Кто был первым президентом США?', a: ['Вашингтон', 'Джефферсон', 'Адамс', 'Линкольн'] },
      { q: 'Год полёта Гагарина?', a: ['1961', '1957', '1969', '1965'] },
      { q: 'Какая стена защищала Китай?', a: ['Великая Китайская', 'Адриана', 'Берлинская', 'Длинная'] },
    ],
    lang: [
      { q: 'Слово «алгоритм» восходит к имени какого учёного?', a: ['аль-Хорезми', 'аль-Газали', 'Авиценна', 'Аверроэс'] },
      { q: 'Какой язык официальный в Бразилии?', a: ['Португальский', 'Испанский', 'Английский', 'Французский'] },
      { q: 'Что означает «алло» в исходном смысле?', a: ['Слушаю', 'Привет', 'Кто там', 'Здравствуй'] },
      { q: 'Сколько букв в русском алфавите?', a: ['33', '32', '34', '30'] },
      { q: 'Как называется слово, читаемое одинаково в обе стороны?', a: ['Палиндром', 'Анаграмма', 'Омоним', 'Синоним'] },
      { q: 'На каком языке говорят в Иране?', a: ['Фарси', 'Арабский', 'Урду', 'Курдский'] },
      { q: 'Что значит латинское «memento mori»?', a: ['Помни о смерти', 'Живи сейчас', 'Бойся бога', 'Лови момент'] },
      { q: 'Какое слово лишнее: кофе, какао, метро, пальто?', a: ['Все несклоняемые', 'Кофе', 'Метро', 'Пальто'] },
      { q: 'Сколько падежей в русском?', a: ['6', '5', '7', '8'] },
      { q: 'Какой язык не относится к славянским?', a: ['Венгерский', 'Словацкий', 'Болгарский', 'Сербский'] },
    ],
  };

  const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2'];
  const LEVEL_RANK = { A1: 1, A2: 2, B1: 3, B2: 4 };
  const LEXICAL_TOPICS = [
    'Familie', 'Freundschaft', 'Wohnen', 'Hausarbeit', 'Schule', 'Universität',
    'Arbeit', 'Bewerbung', 'Reisen', 'Hotel', 'Stadt', 'Landleben',
    'Essen und Trinken', 'Restaurant', 'Einkaufen', 'Kleidung', 'Gesundheit',
    'Körper', 'Sport', 'Freizeit', 'Musik', 'Filme und Serien', 'Natur',
    'Umwelt', 'Verkehr', 'Technik', 'Internet', 'Bücher', 'Wetter',
    'Feiertage', 'Notfälle', 'Berge', 'Camping', 'Tiere', 'Kunst', 'Medien',
    'Politik', 'Alltag', 'Zeitmanagement', 'Büroarbeit', 'Kundenservice',
    'Studium im Ausland', 'Migration', 'Wohnungssuche', 'Finanzen', 'Termine',
    'Kommunikation', 'Gefühle', 'Urlaub am Meer', 'Winterurlaub',
  ];
  const GRAMMAR_TOPICS = [
    'Präsens', 'Perfekt', 'Präteritum', 'Futur I', 'Imperativ', 'Modalverben',
    'Trennbare Verben', 'Untrennbare Verben', 'Reflexive Verben',
    'Verben mit Präpositionen', 'Lassen', 'Werden', 'Sein vs. haben',
    'Nominativ', 'Akkusativ', 'Dativ', 'Genitiv', 'Artikel',
    'Possessivartikel', 'Pronomen', 'Personalpronomen', 'Relativpronomen',
    'Fragewörter', 'Negation', 'Adjektivdeklination', 'Komparativ',
    'Superlativ', 'Zahlen und Datum', 'Temporale Präpositionen',
    'Lokale Präpositionen', 'Wechselpräpositionen', 'Präpositionen mit Dativ',
    'Präpositionen mit Akkusativ', 'Satzklammer', 'Wortstellung im Hauptsatz',
    'Wortstellung im Nebensatz', 'weil-Sätze', 'dass-Sätze', 'wenn-Sätze',
    'obwohl-Sätze', 'damit-Sätze', 'Relativsätze', 'Indirekte Fragen',
    'Infinitiv mit zu', 'Konjunktiv II', 'Passiv', 'Plusquamperfekt',
    'Doppelkonjunktionen', 'als vs. wenn', 'Partizip I und II',
    'Genitivpräpositionen',
  ];

  const GERMAN_QUESTION_POOL = [
    { level: 'A1', topic: 'Artikel', text: 'Выбери правильный артикль.', display: '___ Zug kommt um acht Uhr.', options: ['Der', 'Die', 'Das', 'Den'], correct: 0 },
    { level: 'A1', topic: 'Präsens', text: 'Выбери правильную форму глагола.', display: 'Maria ___ jeden Morgen Kaffee.', options: ['trinkt', 'trinken', 'trinke', 'trinkst'], correct: 0 },
    { level: 'A1', topic: 'Akkusativ', text: 'Выбери форму в Akkusativ.', display: 'Ich sehe ___ Hund im Park.', options: ['den', 'der', 'dem', 'das'], correct: 0 },
    { level: 'A1', topic: 'Wortstellung', text: 'Выбери правильный порядок слов.', display: 'morgen / ich / fahre / nach Berlin', options: ['Morgen fahre ich nach Berlin.', 'Morgen ich fahre nach Berlin.', 'Ich nach Berlin fahre morgen.', 'Fahre ich morgen nach Berlin.'], correct: 0 },
    { level: 'A1', topic: 'Negation', text: 'Выбери правильное отрицание.', display: 'Wir haben ___ Zeit.', options: ['keine', 'nicht', 'kein', 'keinen'], correct: 0 },
    { level: 'A2', topic: 'Perfekt', text: 'Выбери правильную форму Perfekt.', display: 'Gestern ___ wir ins Museum gegangen.', options: ['sind', 'haben', 'sein', 'hat'], correct: 0 },
    { level: 'A2', topic: 'Dativ', text: 'Выбери форму в Dativ.', display: 'Ich helfe ___ neuen Nachbarin.', options: ['der', 'die', 'den', 'dem'], correct: 0 },
    { level: 'A2', topic: 'Modalverben', text: 'Выбери правильную конструкцию.', display: 'Am Abend ___ Lukas noch lernen.', options: ['muss', 'musst', 'müssen', 'müsst'], correct: 0 },
    { level: 'A2', topic: 'Wechselpräpositionen', text: 'Выбери правильный падеж.', display: 'Das Buch liegt auf ___ Tisch.', options: ['dem', 'den', 'der', 'das'], correct: 0 },
    { level: 'A2', topic: 'Trennbare Verben', text: 'Выбери правильный вариант.', display: 'Der Zug ___ um 9 Uhr ___.', options: ['kommt ... an', 'ankommt ...', 'kommt ... auf', 'kommt ... mit'], correct: 0 },
    { level: 'A2', topic: 'Nebensatz', text: 'Выбери правильный порядок слов.', display: 'Ich bleibe zu Hause, weil ...', options: ['ich krank bin.', 'ich bin krank.', 'bin ich krank.', 'krank ich bin.'], correct: 0 },
    { level: 'A2', topic: 'Adjektivdeklination', text: 'Выбери правильное окончание.', display: 'Das ist ein ___ Platz.', options: ['ruhiger', 'ruhige', 'ruhigen', 'ruhiges'], correct: 0 },
    { level: 'B1', topic: 'Konjunktiv II', text: 'Выбери вежливую форму.', display: '___ Sie mir bitte helfen?', options: ['Könnten', 'Können', 'Konnten', 'Kann'], correct: 0 },
    { level: 'B1', topic: 'Infinitiv mit zu', text: 'Выбери правильную конструкцию.', display: 'Anna versucht, den Text ___ verstehen.', options: ['zu', 'zum', 'um zu', '-'], correct: 0 },
    { level: 'B1', topic: 'Passiv', text: 'Выбери правильную форму Passiv.', display: 'Die Tür ___ jeden Abend geschlossen.', options: ['wird', 'ist', 'hat', 'werden'], correct: 0 },
    { level: 'B1', topic: 'Relativsatz', text: 'Выбери правильное относительное местоимение.', display: 'Das ist der Mann, ___ ich gestern geholfen habe.', options: ['dem', 'den', 'der', 'dessen'], correct: 0 },
    { level: 'B1', topic: 'Präteritum', text: 'Выбери правильную форму Präteritum.', display: 'Als Kind ___ sie oft am Meer.', options: ['war', 'ist', 'sein', 'wäre'], correct: 0 },
    { level: 'B1', topic: 'Doppelkonjunktionen', text: 'Выбери правильную пару.', display: '___ der Film war spannend, ___ die Musik war gut.', options: ['Nicht nur ... sondern auch', 'Entweder ... aber', 'Sowohl ... oder', 'Je ... sondern'], correct: 0 },
    { level: 'B2', topic: 'Genitiv', text: 'Выбери форму Genitiv.', display: 'Während ___ Treffens blieb das Handy aus.', options: ['des', 'dem', 'den', 'der'], correct: 0 },
    { level: 'B2', topic: 'Plusquamperfekt', text: 'Выбери правильную форму.', display: 'Nachdem er gegessen ___, ging er los.', options: ['hatte', 'hat', 'war', 'wurde'], correct: 0 },
    { level: 'B2', topic: 'Indirekte Frage', text: 'Выбери правильный порядок слов.', display: 'Kannst du mir sagen, ...', options: ['wann der Kurs beginnt?', 'wann beginnt der Kurs?', 'wann der Kurs beginnt.', 'wann beginnt Kurs der?'], correct: 0 },
    { level: 'B2', topic: 'Konnektoren', text: 'Выбери подходящий союз.', display: '___ es stark regnet, gehen wir spazieren.', options: ['Obwohl', 'Weil', 'Damit', 'Sobald'], correct: 0 },
    { level: 'B2', topic: 'Nominalisierung', text: 'Выбери правильный вариант.', display: 'Nach ___ der Aufgabe durfte die Gruppe gehen.', options: ['der Lösung', 'die Lösung', 'dem Lösen', 'das Lösen'], correct: 0 },
    { level: 'B2', topic: 'Wortstellung', text: 'Выбери грамматически правильное предложение.', display: 'trotzdem / kommt / er / pünktlich', options: ['Trotzdem kommt er pünktlich.', 'Trotzdem er kommt pünktlich.', 'Er pünktlich kommt trotzdem.', 'Kommt trotzdem er pünktlich.'], correct: 0 },
  ];

  const AUDIO_QUESTION_POOL = [
    { level: 'A1', topic: 'Audio', audioText: 'Ich kaufe heute Brot und Käse.', options: ['Сегодня я покупаю хлеб и сыр.', 'Сегодня я продаю хлеб и сыр.', 'Сегодня я покупаю булочки и сыр.', 'Сегодня я покупаю хлеб и колбасу.'], correct: 0 },
    { level: 'A1', topic: 'Audio', audioText: 'Der Zug kommt um acht Uhr an.', options: ['Поезд прибывает в восемь часов.', 'Поезд отправляется в восемь часов.', 'Поезд прибывает на восьмой путь.', 'На поезд нужно пересесть в восемь часов.'], correct: 0 },
    { level: 'A2', topic: 'Audio', audioText: 'Wir müssen morgen früh zum Arzt gehen.', options: ['Завтра рано мы должны пойти к врачу.', 'Завтра рано мы хотим пойти к врачу.', 'Завтра рано мы должны пойти в аптеку.', 'Завтра рано нам разрешено пойти к врачу.'], correct: 0 },
    { level: 'A2', topic: 'Audio', audioText: 'Sie hat den Schlüssel auf dem Tisch gelassen.', options: ['Она оставила ключ на столе.', 'Она положила ключ на стул.', 'Она оставила ключ в столе.', 'Она забыла замок на столе.'], correct: 0 },
    { level: 'B1', topic: 'Audio', audioText: 'Obwohl es regnet, gehen die Kinder nach draußen.', options: ['Хотя идет дождь, дети выходят на улицу.', 'Пока идет дождь, дети выходят на улицу.', 'Потому что идет дождь, дети выходят на улицу.', 'Хотя идет дождь, дети идут внутрь.'], correct: 0 },
    { level: 'B1', topic: 'Audio', audioText: 'Ich freue mich darauf, dich wiederzusehen.', options: ['Я рад снова тебя увидеть.', 'Я боюсь снова тебя увидеть.', 'Я рад снова тебя проводить.', 'Я рад снова с тобой познакомиться.'], correct: 0 },
    { level: 'B2', topic: 'Audio', audioText: 'Nachdem der Vertrag unterschrieben worden war, begann die Lieferung.', options: ['После того как договор был подписан, началась поставка.', 'После того как договор подписали, поставка была отменена.', 'После того как договор был отправлен, началась поставка.', 'После того как заявка была подписана, началась поставка.'], correct: 0 },
    { level: 'B2', topic: 'Audio', audioText: 'Je länger wir warten, desto schwieriger wird die Entscheidung.', options: ['Чем дольше мы ждем, тем труднее становится решение.', 'Чем дольше мы ждем, тем труднее становится обсуждение.', 'Чем дольше мы советуемся, тем труднее становится решение.', 'Чем дольше мы ждем, тем надежнее становится решение.'], correct: 0 },
  ];

  const STORAGE_KEY = 'mosty.learning.v1';
  const DEFAULT_SLOTS = ['Präsens', 'Akkusativ', 'Perfekt', 'Dativ', 'Wortstellung im Nebensatz'];

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function pickLegacyQuestion(cat = 'mix') {
    const cats = cat === 'mix' ? Object.keys(LEGACY_QUESTIONS) : [cat];
    const c = cats[Math.floor(Math.random() * cats.length)] || 'geo';
    const bank = LEGACY_QUESTIONS[c] || LEGACY_QUESTIONS.geo;
    const item = bank[Math.floor(Math.random() * bank.length)];
    const correct = item.a[0];
    const choices = shuffle(item.a);
    return {
      q: item.q,
      choices,
      correctIndex: choices.indexOf(correct),
      correct,
      generated: false,
      source: 'legacy',
    };
  }

  function validRawQuestion(question) {
    return Boolean(
      question &&
      typeof question.text === 'string' &&
      typeof question.display === 'string' &&
      Array.isArray(question.options) &&
      question.options.length === 4 &&
      Number.isInteger(question.correct) &&
      question.correct >= 0 &&
      question.correct <= 3
    );
  }

  function normalizeTopic(topic) {
    const raw = String(topic || '').trim();
    const simplified = raw
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue');
    return GRAMMAR_TOPICS.find((item) => item === raw) ||
      GRAMMAR_TOPICS.find((item) => item.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss') === simplified) ||
      raw;
  }

  function isWortstellungTopic(topic) {
    return /Wortstellung/i.test(topic || '');
  }

  function loadSettings() {
    const defaults = {
      mode: 'grammar',
      level: 'A2',
      lexicalTopic: 'Alltag',
      grammarSlots: DEFAULT_SLOTS.slice(),
    };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (['classic', 'grammar', 'audio'].includes(saved.mode)) defaults.mode = saved.mode;
      if (LANGUAGE_LEVELS.includes(saved.level)) defaults.level = saved.level;
      if (LEXICAL_TOPICS.includes(saved.lexicalTopic)) defaults.lexicalTopic = saved.lexicalTopic;
      if (Array.isArray(saved.grammarSlots) && saved.grammarSlots.length) {
        defaults.grammarSlots = DEFAULT_SLOTS.map((slot, i) => normalizeTopic(saved.grammarSlots[i] || slot));
      }
    } catch (_) {
      // Corrupt localStorage should never block the game.
    }
    return defaults;
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (_) {
      // Private mode / quota errors are harmless here.
    }
  }

  class QuestionBank {
    constructor() {
      this.settings = loadSettings();
      this.fallbackPool = shuffle(GERMAN_QUESTION_POOL);
      this.audioFallbackPool = shuffle(AUDIO_QUESTION_POOL);
      this.fallbackCursor = 0;
      this.audioCursor = 0;
      this.generatedPools = Object.create(null);
      this.fetching = Object.create(null);
      this.usedDisplays = Object.create(null);
      this.generationAllowed = false;
      this.preparing = false;
      this.status = { generationConfigured: false, ttsConfigured: false, checked: false };
      this.statusPromise = this.checkStatus();
    }

    configure(next) {
      this.settings = { ...this.settings, ...next };
      this.settings.grammarSlots = (this.settings.grammarSlots || DEFAULT_SLOTS).map((topic, i) => normalizeTopic(topic || DEFAULT_SLOTS[i % DEFAULT_SLOTS.length]));
      saveSettings(this.settings);
      this.renderSettingsMenu();
    }

    async checkStatus() {
      try {
        const response = await fetch('/api/quiz/status');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        this.status = {
          checked: true,
          generationConfigured: Boolean(data.generationConfigured),
          ttsConfigured: Boolean(data.ttsConfigured),
        };
      } catch (_) {
        this.status = { checked: true, generationConfigured: false, ttsConfigured: false };
      }
      this.renderSettingsMenu();
    }

    pickQuestion(cat = 'mix', context = {}) {
      if (cat !== 'mix' || this.settings.mode === 'classic') return pickLegacyQuestion(cat);
      if (this.settings.mode === 'audio') return this.pickAudioQuestion(context);
      return this.pickGrammarQuestion(context);
    }

    pickGrammarQuestion(context) {
      const slot = this.slotForBridge(context.floor || 0);
      const generated = this.takeFromPool(this.slotKey(slot), slot);
      if (this.generationAllowed) this.ensurePool(slot);
      return generated || this.fallbackQuestion(slot);
    }

    pickAudioQuestion() {
      const key = this.audioKey();
      const generated = this.takeAudioFromPool(key);
      if (this.generationAllowed) this.ensureAudioPool();
      return generated || this.fallbackAudioQuestion();
    }

    prefetch() {
      if (!this.generationAllowed) return Promise.resolve([]);
      if (this.settings.mode === 'audio') this.ensureAudioPool();
      if (this.settings.mode === 'grammar') this.ensurePool(this.slotForBridge(0));
    }

    async prepareForGame(options = {}) {
      await this.statusPromise;
      this.generationAllowed = true;
      if (this.settings.mode === 'classic' || !this.status.generationConfigured) {
        this.renderSettingsMenu();
        return { ok: true, generated: false };
      }

      const floors = Math.max(1, Math.min(20, Number(options.floors) || 8));
      const startFloor = Math.max(1, Number(options.startFloor) || 1);
      this.preparing = true;
      this.renderSettingsMenu();
      try {
        if (this.settings.mode === 'audio') {
          const pool = await this.ensureAudioPool(floors, floors);
          if ((pool?.length || 0) < floors) throw new Error('AI audio questions are not ready');
        } else {
          const needs = new Map();
          for (let i = 0; i < floors; i++) {
            const slot = this.slotForBridge(startFloor + i);
            const key = this.slotKey(slot);
            const current = needs.get(key) || { slot, count: 0 };
            current.count += 1;
            needs.set(key, current);
          }
          await Promise.all([...needs.entries()].map(async ([key, { slot, count }]) => {
            const pool = await this.ensurePool(slot, count, count);
            if ((pool?.length || 0) < count) throw new Error(`AI questions are not ready for ${key}`);
          }));
        }
        return { ok: true, generated: true };
      } finally {
        this.preparing = false;
        this.renderSettingsMenu();
      }
    }

    slotForBridge(floor) {
      const slots = this.settings.grammarSlots && this.settings.grammarSlots.length ? this.settings.grammarSlots : DEFAULT_SLOTS;
      const index = Math.max(0, (Number(floor) || 1) - 1) % slots.length;
      const grammarTopic = normalizeTopic(slots[index]);
      return { grammarTopic, isWortstellung: isWortstellungTopic(grammarTopic), bridgeIndex: index };
    }

    slotKey(slot) {
      return `${this.settings.level}:${this.settings.lexicalTopic}:${slot.grammarTopic}:${slot.isWortstellung ? 'w' : 'g'}`;
    }

    audioKey() {
      return `audio:${this.settings.level}:${this.settings.lexicalTopic}`;
    }

    takeFromPool(key, slot) {
      const pool = this.generatedPools[key];
      if (!pool || !pool.length) return null;
      const raw = pool.shift();
      const used = this.usedDisplays[key] || new Set();
      used.add(raw.display);
      this.usedDisplays[key] = used;
      return this.formatGrammarQuestion(raw, slot, true, key);
    }

    takeAudioFromPool(key) {
      const pool = this.generatedPools[key];
      if (!pool || !pool.length) return null;
      const raw = pool.shift();
      const used = this.usedDisplays[key] || new Set();
      used.add(raw.audioText || raw.display);
      this.usedDisplays[key] = used;
      return this.formatAudioQuestion(raw, true, key);
    }

    releaseQuestion(question) {
      if (!question || !question.raw || !question.poolKey) return;
      const key = question.poolKey;
      if (!this.generatedPools[key]) this.generatedPools[key] = [];
      if (!this.generatedPools[key].includes(question.raw)) {
        this.generatedPools[key].unshift(question.raw);
      }
      const used = this.usedDisplays[key];
      if (used) {
        if (question.raw.display) used.delete(question.raw.display);
        if (question.raw.audioText) used.delete(question.raw.audioText);
      }
    }

    poolHasQuestion(context = {}) {
      if (!this.generationAllowed) return true;
      if (this.settings.mode === 'classic' || !this.status.generationConfigured) return true;
      const key = this.settings.mode === 'audio'
        ? this.audioKey()
        : this.slotKey(this.slotForBridge(context.floor || 0));
      return (this.generatedPools[key]?.length || 0) > 0;
    }

    async ensureQuestionAvailable(context = {}) {
      if (!this.generationAllowed) return;
      if (this.settings.mode === 'classic' || !this.status.generationConfigured) return;
      if (this.settings.mode === 'audio') {
        await this.ensureAudioPool(1, 10);
        return;
      }
      const slot = this.slotForBridge(context.floor || 0);
      await this.ensurePool(slot, 1, 10);
    }

    ensurePool(slot, minCount = 1, requestCount = 10) {
      if (!this.status.generationConfigured) return Promise.resolve([]);
      const key = this.slotKey(slot);
      if ((this.generatedPools[key]?.length || 0) >= minCount) return Promise.resolve(this.generatedPools[key]);
      if (this.fetching[key]) return this.fetching[key];
      const seen = Array.from(this.usedDisplays[key] || []).slice(-12);
      const count = Math.max(1, Math.min(20, Number(requestCount) || 10));
      this.fetching[key] = fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: this.settings.level,
          lexicalTopic: this.settings.lexicalTopic,
          grammarTopic: slot.grammarTopic,
          isWortstellung: slot.isWortstellung,
          count,
          exclude: seen,
        }),
      })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
        .then((data) => {
          const valid = (data.questions || []).filter(validRawQuestion);
          this.generatedPools[key] = [...(this.generatedPools[key] || []), ...shuffle(valid)];
          return this.generatedPools[key];
        })
        .catch((error) => {
          console.warn('Mosty quiz generation fallback:', error);
          return [];
        })
        .finally(() => {
          delete this.fetching[key];
          this.renderSettingsMenu();
        });
      this.renderSettingsMenu();
      return this.fetching[key];
    }

    ensureAudioPool(minCount = 1, requestCount = 10) {
      if (!this.status.generationConfigured) return Promise.resolve([]);
      const key = this.audioKey();
      if ((this.generatedPools[key]?.length || 0) >= minCount) return Promise.resolve(this.generatedPools[key]);
      if (this.fetching[key]) return this.fetching[key];
      const seen = Array.from(this.usedDisplays[key] || []).slice(-12);
      const count = Math.max(1, Math.min(20, Number(requestCount) || 10));
      this.fetching[key] = fetch('/api/generate-audio-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: this.settings.level,
          lexicalTopic: this.settings.lexicalTopic,
          count,
          exclude: seen,
        }),
      })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
        .then((data) => {
          const valid = (data.questions || []).filter((question) => validRawQuestion(question) && question.audioText);
          this.generatedPools[key] = [...(this.generatedPools[key] || []), ...shuffle(valid)];
          return this.generatedPools[key];
        })
        .catch((error) => {
          console.warn('Mosty audio quiz generation fallback:', error);
          return [];
        })
        .finally(() => {
          delete this.fetching[key];
          this.renderSettingsMenu();
        });
      this.renderSettingsMenu();
      return this.fetching[key];
    }

    fallbackQuestion(slot) {
      const maxRank = LEVEL_RANK[this.settings.level] || LEVEL_RANK.A2;
      const candidates = this.fallbackPool.filter((question) => (LEVEL_RANK[question.level] || 1) <= maxRank);
      const source = candidates.length ? candidates : this.fallbackPool;
      const raw = source[this.fallbackCursor % source.length];
      this.fallbackCursor += 1;
      return this.formatGrammarQuestion(raw, slot, false);
    }

    fallbackAudioQuestion() {
      const maxRank = LEVEL_RANK[this.settings.level] || LEVEL_RANK.A2;
      const candidates = this.audioFallbackPool.filter((question) => (LEVEL_RANK[question.level] || 1) <= maxRank);
      const source = candidates.length ? candidates : this.audioFallbackPool;
      const raw = source[this.audioCursor % source.length];
      this.audioCursor += 1;
      return this.formatAudioQuestion(raw, false);
    }

    formatGrammarQuestion(raw, slot, generated, poolKey = '') {
      const correctAnswer = raw.options[raw.correct];
      const choices = shuffle(raw.options);
      return {
        q: `${slot.grammarTopic} · ${raw.level || this.settings.level}. ${raw.text} ${raw.display}`,
        text: raw.text,
        display: raw.display,
        topic: slot.grammarTopic,
        level: raw.level || this.settings.level,
        choices,
        correctIndex: choices.indexOf(correctAnswer),
        correct: correctAnswer,
        generated,
        poolKey: generated ? poolKey : '',
        raw: generated ? raw : null,
        source: generated ? 'generated' : 'german-fallback',
      };
    }

    formatAudioQuestion(raw, generated, poolKey = '') {
      const correctAnswer = raw.options[raw.correct];
      const choices = shuffle(raw.options);
      return {
        q: `Аудио · ${raw.level || this.settings.level}. Прослушай немецкую фразу и выбери точный перевод.`,
        text: 'Прослушай немецкую фразу и выбери точный перевод.',
        display: 'Немецкая фраза звучит вслух.',
        topic: 'Audio',
        level: raw.level || this.settings.level,
        audioText: raw.audioText,
        choices,
        correctIndex: choices.indexOf(correctAnswer),
        correct: correctAnswer,
        generated,
        poolKey: generated ? poolKey : '',
        raw: generated ? raw : null,
        source: generated ? 'generated-audio' : 'audio-fallback',
      };
    }

    renderSettingsMenu() {
      const root = document.getElementById('learning-menu');
      if (!root) return;
      const fetchingNow = this.preparing || Object.keys(this.fetching).length > 0;
      const statusKind = this.status.generationConfigured
        ? (fetchingNow ? 'loading' : 'online')
        : 'fallback';
      const statusText = this.preparing
        ? 'AI готовит стартовые вопросы'
        : statusKind === 'loading'
        ? 'AI подгружает вопросы'
        : statusKind === 'online'
          ? 'AI подключен'
          : 'Fallback вопросы';

      root.querySelectorAll('[data-mode]').forEach((button) => {
        const selected = button.dataset.mode === this.settings.mode;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      root.querySelectorAll('[data-level]').forEach((button) => {
        const selected = button.dataset.level === this.settings.level;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      const lexical = root.querySelector('#learning-lexical');
      if (lexical) lexical.value = this.settings.lexicalTopic;
      root.querySelectorAll('[data-slot-index]').forEach((select) => {
        select.value = this.settings.grammarSlots[Number(select.dataset.slotIndex)] || DEFAULT_SLOTS[0];
      });
      const status = root.querySelector('#learning-status');
      if (status) status.textContent = statusText;
      root.dataset.status = statusKind;
      root.classList.toggle('classic', this.settings.mode === 'classic');
      root.classList.toggle('audio', this.settings.mode === 'audio');
    }
  }

  function createLearningMenu(bank) {
    const boot = document.getElementById('boot');
    const panel = boot && boot.firstElementChild;
    if (!panel || document.getElementById('learning-menu')) return;

    const menu = document.createElement('div');
    menu.id = 'learning-menu';
    menu.className = 'learning-menu';
    menu.innerHTML = `
      <div class="learning-head">
        <div>
          <div class="learning-kicker">Квиз</div>
          <div class="learning-title">Настройка раунда</div>
        </div>
        <div id="learning-status" class="learning-status"></div>
      </div>
      <div class="learning-controls">
        <section class="control-block">
          <div class="control-label">Режим</div>
          <div class="segmented mode-row">
            <button type="button" data-mode="grammar">Грамматика</button>
            <button type="button" data-mode="audio">Аудио</button>
            <button type="button" data-mode="classic">Классика</button>
          </div>
        </section>
        <section class="control-block">
          <div class="control-label">Уровень</div>
          <div class="segmented level-row">
            ${LANGUAGE_LEVELS.map((level) => `<button type="button" data-level="${level}">${level}</button>`).join('')}
          </div>
        </section>
      </div>
      <div class="learning-form">
        <label class="field learning-select">
          <span>Лексика</span>
          <select id="learning-lexical">
            ${LEXICAL_TOPICS.map((topic) => `<option value="${topic}">${topic}</option>`).join('')}
          </select>
        </label>
        <div class="slot-grid" aria-label="Темы мостов">
          ${DEFAULT_SLOTS.map((slot, index) => `
            <label class="field">
              <span>Мост ${index + 1}</span>
              <select data-slot-index="${index}">
                ${GRAMMAR_TOPICS.map((topic) => `<option value="${topic}"${topic === slot ? ' selected' : ''}>${topic}</option>`).join('')}
              </select>
            </label>
          `).join('')}
        </div>
      </div>
    `;
    panel.insertBefore(menu, document.getElementById('start'));

    menu.addEventListener('click', (event) => {
      const modeButton = event.target.closest('[data-mode]');
      if (modeButton) {
        bank.configure({ mode: modeButton.dataset.mode });
        return;
      }
      const levelButton = event.target.closest('[data-level]');
      if (levelButton) {
        bank.configure({ level: levelButton.dataset.level });
      }
    });

    menu.addEventListener('change', (event) => {
      if (event.target.id === 'learning-lexical') {
        bank.configure({ lexicalTopic: event.target.value });
        return;
      }
      if (event.target.matches('[data-slot-index]')) {
        const slots = bank.settings.grammarSlots.slice();
        slots[Number(event.target.dataset.slotIndex)] = event.target.value;
        bank.configure({ grammarSlots: slots });
      }
    });

    bank.renderSettingsMenu();
  }

  const AudioQuiz = (() => {
    const cache = new Map();
    let currentQuestion = null;
    let token = 0;
    let button = null;

    function ensureButton() {
      if (button || !document.body) return;
      button = document.createElement('button');
      button.id = 'audio-repeat';
      button.type = 'button';
      button.textContent = '▶';
      button.title = 'Повторить аудио-вопрос';
      button.addEventListener('click', () => play(currentQuestion, true));
      document.body.appendChild(button);
    }

    function fallbackSpeech(text) {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'de-DE';
      utter.rate = 0.88;
      const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      const germanVoice = voices.find((voice) => /^de[-_]/i.test(voice.lang || ''));
      if (germanVoice) utter.voice = germanVoice;
      window.speechSynthesis.speak(utter);
    }

    async function play(question, force = false) {
      ensureButton();
      currentQuestion = question && question.audioText ? question : null;
      if (button) button.classList.toggle('on', Boolean(currentQuestion));
      if (!currentQuestion) return;
      if (!force && currentQuestion._audioPlayed) return;
      currentQuestion._audioPlayed = true;

      const text = currentQuestion.audioText;
      const myToken = ++token;
      if (button) button.classList.add('loading');
      try {
        let buffer = cache.get(text);
        if (!buffer) {
          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
          buffer = await response.arrayBuffer();
          cache.set(text, buffer.slice(0));
        }
        if (myToken !== token) return;
        const audio = new Audio(URL.createObjectURL(new Blob([buffer.slice(0)], { type: 'audio/mpeg' })));
        await audio.play();
      } catch (_) {
        if (myToken === token) fallbackSpeech(text);
      } finally {
        if (myToken === token && button) button.classList.remove('loading');
      }
    }

    return { play, ensureButton };
  })();

  const bank = new QuestionBank();
  window.QUESTIONS = LEGACY_QUESTIONS;
  window.MOSTY_LEARNING = { LANGUAGE_LEVELS, LEXICAL_TOPICS, GRAMMAR_TOPICS, bank };
  window.QuizQuestionBank = bank;
  window.pickQuestion = (cat, context) => bank.pickQuestion(cat, context);
  window.prepareMostyQuiz = (options) => bank.prepareForGame(options);
  window.releaseQuizQuestion = (question) => bank.releaseQuestion(question);
  window.quizPoolHasQuestion = (context) => bank.poolHasQuestion(context);
  window.quizEnsureQuestionAvailable = (context) => bank.ensureQuestionAvailable(context);
  window.playQuizAudio = (question, force) => AudioQuiz.play(question, force);

  document.addEventListener('DOMContentLoaded', () => {
    createLearningMenu(bank);
    AudioQuiz.ensureButton();
  });
})();

export type WebsiteLocale = 'en' | 'es';

export interface WebsiteLanguage {
  code: WebsiteLocale;
  name: string;
  shortName: string;
  flag: string;
}

export const WEBSITE_LANGUAGES: WebsiteLanguage[] = [
  { code: 'en', name: 'English', shortName: 'EN', flag: '🇬🇧' },
  { code: 'es', name: 'Español', shortName: 'ES', flag: '🇪🇸' },
];

export const WEBSITE_LANGUAGE_STORAGE_KEY = 'stitchspeak_website_language';

export const ENGLISH_WEBSITE_COPY = {
  documentTitle: 'Knitting & Crochet Pattern Translation | StitchSpeak',
  documentDescription: 'Translate knitting and crochet patterns into 14 languages. Review abbreviations, repeats, and chart legends in a workspace built for independent designers.',
  languageSelectorLabel: 'Website language',
  signIn: 'Sign in',
  loading: 'Loading...',
  nav: {
    journey: 'How it works',
    pricing: 'Pricing',
    faq: 'FAQ',
  },
  hero: {
    lead: 'Knitting & crochet',
    accent: 'patterns,',
    finish: 'ready for more markets.',
    body: 'Translate pattern files into 14 languages with craft-aware terminology, side-by-side review, and export tools for independent designers.',
    primaryAction: 'Start translating',
    secondaryAction: 'Follow the journey',
    imageAlt: 'StitchSpeak glossary shown on a laptop and phone in a warm textile studio',
    imageLabel: 'One pattern in. Fourteen markets out.',
  },
  trustPoints: [
    { title: '14 markets, one upload', text: 'Translate into any supported language' },
    { title: 'Made for patterns', text: 'Reviewed by knitters, not generic prose' },
    { title: 'Credits never expire', text: 'Use them when your next release is ready' },
  ],
  journey: {
    title: 'From one pattern to a wider market',
    body: 'One upload, 14 language options, and a clear price before translation begins.',
    steps: [
      {
        title: 'Upload once',
        description: 'Add your PDF, DOCX, TXT, or RTF file and choose one of 14 target languages.',
      },
      {
        title: 'Review and confirm',
        description: 'See the translation estimate and your remaining balance before anything starts.',
      },
      {
        title: 'Translate and publish',
        description: 'Review the translated copy, save it to your library, then place it in your own pattern layout.',
      },
    ],
  },
  story: {
    eyebrow: 'A pattern in motion',
    title: 'Watch one upload travel further.',
    body: 'Scroll through the same journey your pattern takes inside StitchSpeak—from source file to a translation you can review and publish.',
    activeLabel: 'Current step',
    stages: [
      {
        kicker: 'Your source stays central',
        title: 'Upload the pattern once.',
        body: 'Start with a PDF, DOCX, TXT, or RTF file. StitchSpeak keeps the source attached to the project so you can return for another language later.',
        status: 'Pattern received',
      },
      {
        kicker: 'Built for the craft',
        title: 'Terminology is recognized in context.',
        body: 'Rows, repeats, abbreviations, measurements, and chart legends are treated as pattern instructions—not generic prose.',
        status: 'Terms matched',
      },
      {
        kicker: 'One source, more markets',
        title: 'Choose from 14 target languages.',
        body: 'The original pattern becomes the center of a growing language map. Each translation has its own clear estimate before you confirm.',
        status: 'Market selected',
      },
      {
        kicker: 'Your eye stays in the loop',
        title: 'Review source and translation together.',
        body: 'Compare the translated copy with the original, check the details that matter, and revisit the result from your saved pattern library.',
        status: 'Ready to review',
      },
      {
        kicker: 'Ready for your publishing flow',
        title: 'Export, refine, and release.',
        body: 'Download PDF, Word, HTML, or plain text, then place the reviewed translation into your own pattern layout.',
        status: 'Ready to export',
      },
    ],
    visual: {
      filename: 'Willow-wrap-cardigan.pdf',
      source: 'English',
      target: 'Spanish',
      originalLabel: 'Original',
      translationLabel: 'Translation',
      originalLine: 'K2, p2; repeat from * to end.',
      translationLine: '2 der, 2 rev; repite desde * hasta el final.',
      formatsLabel: 'Export formats',
      languagesLabel: 'Language routes',
      languages: ['ES', 'DE', 'FR', 'IT', 'JA', 'KO'],
      formats: ['PDF', 'DOCX', 'HTML', 'TXT'],
    },
  },
  craft: {
    title: 'Pattern translation that speaks knitting and crochet',
    body: 'Purpose-built for independent designers who want to publish and sell patterns beyond one language.',
    featureTitle: 'Pattern language, not generic prose',
    featureBody: 'StitchSpeak understands rows, repeats, abbreviations, and terms such as “yarn over” and “slip stitch”. Its terminology has been reviewed by knitters.',
    sampleOne: 'Japanese to English',
    sampleTwo: 'German to US',
    workspaceTitle: 'Your translation workspace',
    workspaceBody: 'Keep every translation in one place, reopen it later, and prepare the copy for your next release.',
    workspaceImageAlt: 'Knitting pattern library open on a tablet beside yarn, needles, a crochet hook, and pattern notes',
  },
  inside: {
    eyebrow: 'Inside the app',
    title: 'What you actually use.',
    body: 'Upload one pattern, choose a language, confirm the estimate, and review the translated copy in your saved library.',
    items: [
      {
        title: 'Upload PDF, DOCX, TXT, or RTF',
        body: 'Sign in with Google or email, then upload your pattern file.',
      },
      {
        title: 'Buy credits, then confirm the estimate',
        body: 'Translation costs credits. You see the price before anything is charged.',
      },
      {
        title: 'Reuse one upload',
        body: 'Return to My Patterns and translate the same source for another language.',
      },
    ],
    videoLabel: 'StitchSpeak workflow: upload a pattern, confirm the estimate, and review the translated copy',
  },
  pricing: {
    title: 'Simple credits, no surprises',
    body: 'A standard pattern often starts around 6.5 credits. Longer or more complex files cost more; you always see the exact estimate before confirming. Credits never expire.',
    credits: 'credits',
    perCredit: 'per credit',
    mostPopular: 'Most popular',
    buy: 'Buy',
    note: 'Prices are in EUR and include applicable taxes. If you pay in another currency, PayPal or your bank will apply its exchange rate. You’ll see the final converted amount before confirming.',
  },
  faq: {
    eyebrow: 'Good to know',
    title: 'Knitting and crochet pattern translation FAQ',
    body: 'Straight answers about cost, accuracy, files, and privacy—including where translation still needs your eye.',
    cardTitle: 'Built for patterns. Still reviewed by you.',
    cardBody: 'Check sizes, gauge, stitch counts, charts, and unusual notation before publishing—just as you would with any translation draft.',
    stats: [
      { label: 'Target languages', value: '14' },
      { label: 'Billing', value: 'Pay as you go' },
      { label: 'Input', value: 'PDF · DOCX · TXT · RTF' },
      { label: 'Export', value: 'PDF · Word · HTML · TXT' },
    ],
    contactLead: 'Still unsure?',
    contactAction: 'Ask us directly',
    items: [
      {
        topic: 'Pricing',
        question: 'How is a translation priced?',
        answer: 'Upload your pattern and choose a language to see the exact credit estimate before you commit. Nothing is deducted until you confirm. There is no subscription: buy credits when you need them, and purchased credits do not expire.',
      },
      {
        topic: 'Files',
        question: 'Which files can I upload—and what can I download?',
        answer: 'Upload PDF, DOCX, TXT, or RTF files. When the translation is ready, export it as PDF, Word (.docx), HTML, or plain text so you can proofread it or move it into your publishing workflow.',
      },
      {
        topic: 'Languages',
        question: 'Can I translate the same pattern into several languages?',
        answer: 'Yes. StitchSpeak keeps the source file with your saved pattern, so you can return to My Patterns and add another translation without starting from scratch. Each language gets its own estimate and uses credits separately.',
      },
      {
        topic: 'Terminology',
        question: 'How does it handle abbreviations, repeats, and chart legends?',
        answer: 'StitchSpeak is designed around knitting and crochet instructions rather than generic prose. It works to localize abbreviations, row instructions, repeats, tables, and chart legends using conventions for the target language. Translations can still contain mistakes, so always review the result before publishing.',
      },
      {
        topic: 'Layout',
        question: 'Will the translated file look exactly like my original?',
        answer: 'Not pixel for pixel. StitchSpeak preserves readable structure and reconstructs headings, tables, images, and chart information where possible, but translated text changes line lengths and complex layouts may need adjustment. Use the Word or HTML export when you want more control before publication.',
      },
      {
        topic: 'Credits',
        question: 'What happens if a translation fails?',
        answer: 'If a translation does not complete, the server returns the credits reserved for that job automatically. If anything still looks wrong in your balance, contact support and include the pattern name and approximate time of the attempt.',
      },
      {
        topic: 'Workflow',
        question: 'What can I do after the translation is ready?',
        answer: 'Review the result alongside the source, reopen it later from My Patterns, export it in four formats, or use pattern chat to ask about an abbreviation, a confusing row, sizing notes, or another part of the translated pattern.',
      },
      {
        topic: 'Privacy',
        question: 'How private are my pattern files?',
        answer: 'Your files are not made public. They are processed only to translate your pattern and provide the features you request, then stored with your source, translation, and chat history so you can return to them. You can download your data or delete your account from Settings.',
        linkLabel: 'Read the full privacy policy',
      },
    ],
  },
  closing: {
    title: 'Give your next pattern a bigger market.',
    body: 'Upload once, check the cost, and translate into any of 14 languages with terminology made for makers.',
    action: 'Start translating',
  },
  purchaseDialog: {
    title: 'Sign in to buy credits',
    body: 'Sign in with Google or email to open checkout. The credit pack you chose will be selected for you.',
    close: 'Close',
  },
  footer: {
    copyright: 'StitchSpeak. Operated by Innovai Studio S.L.',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    accessibility: 'Accessibility',
    support: 'Support',
  },
} as const;

type DeepWiden<T> =
  T extends string ? string
    : T extends readonly (infer U)[] ? readonly DeepWiden<U>[]
      : T extends object ? { readonly [K in keyof T]: DeepWiden<T[K]> }
        : T;

export type WebsiteCopy = DeepWiden<typeof ENGLISH_WEBSITE_COPY>;

export const SPANISH_WEBSITE_COPY: WebsiteCopy = {
  documentTitle: 'Traducción de patrones de punto y ganchillo | StitchSpeak',
  documentDescription: 'Traduce patrones de punto y ganchillo a 14 idiomas. Revisa abreviaturas, repeticiones y leyendas de gráficos en un espacio para diseñadores.',
  languageSelectorLabel: 'Idioma de la web',
  signIn: 'Iniciar sesión',
  loading: 'Cargando...',
  nav: {
    journey: 'Cómo funciona',
    pricing: 'Precios',
    faq: 'Preguntas',
  },
  hero: {
    lead: 'Tus',
    accent: 'patrones de punto y ganchillo,',
    finish: 'listos para nuevos mercados.',
    body: 'Traduce archivos de patrones a 14 idiomas con terminología textil, revisión en paralelo y herramientas de exportación para diseñadores independientes.',
    primaryAction: 'Empezar a traducir',
    secondaryAction: 'Seguir el recorrido',
    imageAlt: 'El glosario de StitchSpeak abierto en un portátil y un móvil dentro de un estudio textil cálido',
    imageLabel: 'Entra un patrón. Sale hacia catorce mercados.',
  },
  trustPoints: [
    { title: '14 mercados, una sola subida', text: 'Traduce a cualquier idioma compatible' },
    { title: 'Pensado para patrones', text: 'Revisado por tejedores, sin prosa genérica' },
    { title: 'Los créditos no caducan', text: 'Úsalos cuando tu próximo lanzamiento esté listo' },
  ],
  journey: {
    title: 'De un solo patrón a un mercado más amplio',
    body: 'Una sola subida, 14 idiomas disponibles y un precio claro antes de empezar a traducir.',
    steps: [
      {
        title: 'Sube tu archivo una vez',
        description: 'Sube tu archivo PDF, DOCX, TXT o RTF y elige uno de los 14 idiomas de destino.',
      },
      {
        title: 'Revisa y confirma',
        description: 'Consulta la estimación de la traducción y tu saldo restante antes de empezar.',
      },
      {
        title: 'Traduce y publica',
        description: 'Revisa el texto traducido, guárdalo en tu biblioteca y aplícalo a la maquetación de tu propio patrón.',
      },
    ],
  },
  story: {
    eyebrow: 'Un patrón en movimiento',
    title: 'Mira hasta dónde llega una sola subida.',
    body: 'Recorre el mismo viaje que hace tu patrón dentro de StitchSpeak: desde el archivo original hasta una traducción que puedes revisar y publicar.',
    activeLabel: 'Paso actual',
    stages: [
      {
        kicker: 'Tu original permanece en el centro',
        title: 'Sube el patrón una sola vez.',
        body: 'Empieza con un archivo PDF, DOCX, TXT o RTF. StitchSpeak mantiene el original dentro del proyecto para que puedas volver y añadir otro idioma más adelante.',
        status: 'Patrón recibido',
      },
      {
        kicker: 'Creado para este oficio',
        title: 'La terminología se reconoce en contexto.',
        body: 'Vueltas, repeticiones, abreviaturas, medidas y leyendas de gráficos se tratan como instrucciones de patrón, no como prosa genérica.',
        status: 'Términos reconocidos',
      },
      {
        kicker: 'Un original, más mercados',
        title: 'Elige entre 14 idiomas de destino.',
        body: 'El patrón original se convierte en el centro de un mapa de idiomas en expansión. Cada traducción muestra una estimación clara antes de confirmar.',
        status: 'Mercado elegido',
      },
      {
        kicker: 'Tu criterio sigue dentro del proceso',
        title: 'Revisa original y traducción juntos.',
        body: 'Compara el texto traducido con el original, comprueba los detalles importantes y vuelve al resultado desde tu biblioteca de patrones.',
        status: 'Listo para revisar',
      },
      {
        kicker: 'Preparado para tu proceso editorial',
        title: 'Exporta, ajusta y publica.',
        body: 'Descarga el resultado en PDF, Word, HTML o texto plano y coloca la traducción revisada en la maquetación de tu patrón.',
        status: 'Listo para exportar',
      },
    ],
    visual: {
      filename: 'chaqueta-cruzada-willow.pdf',
      source: 'Inglés',
      target: 'Español',
      originalLabel: 'Original',
      translationLabel: 'Traducción',
      originalLine: 'K2, p2; repeat from * to end.',
      translationLine: '2 der, 2 rev; repite desde * hasta el final.',
      formatsLabel: 'Formatos de salida',
      languagesLabel: 'Rutas de idioma',
      languages: ['ES', 'DE', 'FR', 'IT', 'JA', 'KO'],
      formats: ['PDF', 'DOCX', 'HTML', 'TXT'],
    },
  },
  craft: {
    title: 'Traducción que entiende los patrones de punto y ganchillo',
    body: 'Diseñado específicamente para creadores independientes que quieren publicar y vender patrones en más de un idioma.',
    featureTitle: 'Lenguaje de patrones, no prosa genérica',
    featureBody: 'StitchSpeak entiende de vueltas, repeticiones, abreviaturas y términos como «hebra» o «punto deslizado». Su terminología ha sido revisada por tejedores.',
    sampleOne: 'De japonés a inglés',
    sampleTwo: 'De alemán a inglés (EE. UU.)',
    workspaceTitle: 'Tu espacio de trabajo de traducción',
    workspaceBody: 'Guarda todas tus traducciones en un solo lugar, vuelve a abrirlas más tarde y prepara el texto para tu próximo lanzamiento.',
    workspaceImageAlt: 'Biblioteca de patrones de punto abierta en una tableta junto a ovillos, agujas, un ganchillo y notas del patrón',
  },
  inside: {
    eyebrow: 'Dentro de la aplicación',
    title: 'Lo que realmente utilizas.',
    body: 'Sube un patrón, elige un idioma, confirma el presupuesto y revisa el texto traducido en tu biblioteca guardada.',
    items: [
      {
        title: 'Sube archivos PDF, DOCX, TXT o RTF',
        body: 'Inicia sesión con Google o por correo electrónico y sube el archivo de tu patrón.',
      },
      {
        title: 'Compra créditos y confirma el presupuesto',
        body: 'La traducción consume créditos. Verás el coste exacto antes de que se realice ningún cargo.',
      },
      {
        title: 'Reutiliza una misma subida',
        body: 'Vuelve a Mis patrones y traduce el mismo archivo original a otro idioma.',
      },
    ],
    videoLabel: 'Flujo de trabajo de StitchSpeak: subir un patrón, confirmar el presupuesto y revisar el texto traducido',
  },
  pricing: {
    title: 'Créditos sencillos, sin sorpresas',
    body: 'Un patrón estándar suele costar unos 6,5 créditos. Los archivos más largos o complejos cuestan más; siempre verás la estimación exacta antes de confirmar. Los créditos no caducan nunca.',
    credits: 'créditos',
    perCredit: 'por crédito',
    mostPopular: 'El más popular',
    buy: 'Comprar',
    note: 'Los precios están en EUR e incluyen los impuestos aplicables. Si pagas en otra divisa, PayPal o tu banco aplicarán su propio tipo de cambio. Verás el importe final convertido antes de confirmar.',
  },
  faq: {
    eyebrow: 'Información útil',
    title: 'Preguntas sobre la traducción de patrones de punto y ganchillo',
    body: 'Respuestas claras sobre costes, precisión, archivos y privacidad, incluyendo los aspectos en los que la traducción aún necesita tu revisión.',
    cardTitle: 'Creado para patrones. Pero revisado por ti.',
    cardBody: 'Comprueba las tallas, la tensión, el número de puntos, los gráficos y las anotaciones poco comunes antes de publicar, tal como harías con cualquier borrador de traducción.',
    stats: [
      { label: 'Idiomas de destino', value: '14' },
      { label: 'Facturación', value: 'Pago por uso' },
      { label: 'Formatos de entrada', value: 'PDF · DOCX · TXT · RTF' },
      { label: 'Formatos de exportación', value: 'PDF · Word · HTML · TXT' },
    ],
    contactLead: '¿Aún tienes dudas?',
    contactAction: 'Pregúntanos directamente',
    items: [
      {
        topic: 'Precios',
        question: '¿Cómo se calcula el precio de una traducción?',
        answer: 'Sube tu patrón y elige un idioma para ver la estimación exacta de créditos antes de comprometerte. No se descontará nada hasta que confirmes. Sin suscripciones: compra créditos cuando los necesites y no te preocupes, porque no caducan.',
      },
      {
        topic: 'Archivos',
        question: '¿Qué archivos puedo subir y cuáles puedo descargar?',
        answer: 'Puedes subir archivos PDF, DOCX, TXT o RTF. Cuando la traducción esté lista, expórtala en PDF, Word (.docx), HTML o texto plano para poder revisarla o incorporarla a tu proceso de publicación.',
      },
      {
        topic: 'Idiomas',
        question: '¿Puedo traducir el mismo patrón a varios idiomas?',
        answer: 'Sí. StitchSpeak guarda el archivo original junto con tu patrón guardado, por lo que puedes volver a Mis patrones y añadir otra traducción sin tener que empezar de cero. Cada idioma tiene su propia estimación y consume créditos de forma independiente.',
      },
      {
        topic: 'Terminología',
        question: '¿Cómo gestiona las abreviaturas, las repeticiones y las leyendas de los gráficos?',
        answer: 'StitchSpeak está diseñado específicamente para instrucciones de punto y ganchillo, no para prosa genérica. Se encarga de localizar abreviaturas, instrucciones de vueltas, repeticiones, tablas y leyendas de gráficos adaptándolas a las convenciones del idioma de destino. Aun así, las traducciones pueden contener errores, por lo que te recomendamos revisar siempre el resultado antes de publicar.',
      },
      {
        topic: 'Diseño y maquetación',
        question: '¿El archivo traducido tendrá exactamente el mismo aspecto que el original?',
        answer: 'No píxel por píxel. StitchSpeak conserva una estructura legible y reconstruye encabezados, tablas, imágenes e información de gráficos siempre que es posible, pero la longitud de las líneas cambia al traducir y los diseños complejos pueden requerir ajustes. Utiliza la exportación a Word o HTML si quieres tener un mayor control antes de publicar.',
      },
      {
        topic: 'Créditos',
        question: '¿Qué pasa si una traducción falla?',
        answer: 'Si una traducción no se completa, el servidor devuelve automáticamente los créditos reservados para esa tarea. Si aun así detectas algún error en tu saldo, ponte en contacto con el servicio de asistencia e indícanos el nombre del patrón y la hora aproximada del intento.',
      },
      {
        topic: 'Flujo de trabajo',
        question: '¿Qué puedo hacer una vez que la traducción esté lista?',
        answer: 'Puedes revisar el resultado junto al archivo original, volver a abrirlo más tarde desde Mis patrones, exportarlo en cuatro formatos o usar el chat del patrón para consultar dudas sobre una abreviatura, una vuelta confusa, notas sobre las tallas o cualquier otra parte del patrón traducido.',
      },
      {
        topic: 'Privacidad',
        question: '¿Qué nivel de privacidad tienen mis archivos de patrones?',
        answer: 'Tus archivos no se hacen públicos. Solo se procesan para traducir tu patrón y ofrecerte las funciones que solicites, y se guardan junto con el archivo original, la traducción y el historial de chat para que puedas acceder a ellos cuando quieras. Puedes descargar tus datos o eliminar tu cuenta desde los Ajustes.',
        linkLabel: 'Leer la política de privacidad completa',
      },
    ],
  },
  closing: {
    title: 'Abre tu próximo patrón a un mercado más amplio.',
    body: 'Sube tu archivo una vez, consulta el coste y tradúcelo a cualquiera de los 14 idiomas con una terminología pensada para creadores.',
    action: 'Empezar a traducir',
  },
  purchaseDialog: {
    title: 'Inicia sesión para comprar créditos',
    body: 'Inicia sesión con Google o por correo electrónico para ir al pago. El paquete de créditos que hayas elegido ya estará seleccionado.',
    close: 'Cerrar',
  },
  footer: {
    copyright: 'StitchSpeak. Operado por Innovai Studio S.L.',
    privacy: 'Política de privacidad',
    terms: 'Condiciones del servicio',
    accessibility: 'Accesibilidad',
    support: 'Soporte',
  },
};

export const WEBSITE_COPY: Record<WebsiteLocale, WebsiteCopy> = {
  en: ENGLISH_WEBSITE_COPY,
  es: SPANISH_WEBSITE_COPY,
};

export function isWebsiteLocale(value: string | null | undefined): value is WebsiteLocale {
  return WEBSITE_LANGUAGES.some((language) => language.code === value);
}
